import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { AddSubGroupDto, AssignDto, CreateClassDto, CreateSubjectDto } from './dto';

/**
 * Ручное создание структуры школы (онбординг шаги 4.2 и 6):
 * классы/подгруппы (админ), дисциплины и распределение учителей (методист/завуч).
 * Тенант — активная орг сессии; в dev (orgId=null) берётся первая (засеянная) орг.
 */
@Injectable()
export class StructureService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveOrg(userOrgId: string | null): Promise<string> {
    if (userOrgId) return userOrgId;
    const first = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!first) throw new NotFoundException('Нет организации');
    return first.id;
  }

  // ─── классы / подгруппы ───
  async listClasses(userOrgId: string | null) {
    const organizationId = await this.resolveOrg(userOrgId);
    const classes = await this.prisma.class.findMany({
      where: { organizationId },
      orderBy: [{ parallel: 'asc' }, { letter: 'asc' }],
      include: { subGroups: true, _count: { select: { students: true } } },
    });
    return classes.map((c) => ({
      id: c.id, label: c.label, parallel: c.parallel, letter: c.letter,
      students: c._count.students,
      subGroups: c.subGroups.map((g) => ({ id: g.id, name: g.name })),
    }));
  }

  async createClass(userOrgId: string | null, dto: CreateClassDto) {
    const organizationId = await this.resolveOrg(userOrgId);
    const letter = dto.letter.trim().toUpperCase();
    const c = await this.prisma.class.create({
      data: { organizationId, parallel: dto.parallel, letter, label: `${dto.parallel}${letter}` },
    });
    return { id: c.id, label: c.label, parallel: c.parallel, letter: c.letter, students: 0, subGroups: [] };
  }

  async deleteClass(id: string) {
    await this.prisma.class.delete({ where: { id } });
    return { ok: true };
  }

  async addSubGroup(classId: string, dto: AddSubGroupDto) {
    const g = await this.prisma.subGroup.create({
      data: { organizationId: TenantContext.require(), classId, name: dto.name.trim() },
    });
    return { id: g.id, name: g.name };
  }

  async deleteSubGroup(id: string) {
    await this.prisma.subGroup.delete({ where: { id } });
    return { ok: true };
  }

  // ─── дисциплины ───
  async listSubjects(userOrgId: string | null) {
    const organizationId = await this.resolveOrg(userOrgId);
    const s = await this.prisma.subject.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
    return s.map((x) => ({ id: x.id, name: x.name, color: x.color }));
  }

  async createSubject(userOrgId: string | null, dto: CreateSubjectDto) {
    const organizationId = await this.resolveOrg(userOrgId);
    const s = await this.prisma.subject.create({
      data: { organizationId, name: dto.name.trim(), color: dto.color ?? '#2563EB' },
    });
    return { id: s.id, name: s.name, color: s.color };
  }

  async deleteSubject(id: string) {
    await this.prisma.subject.delete({ where: { id } });
    return { ok: true };
  }

  // ─── учителя + распределение ───
  async listTeachers(userOrgId: string | null) {
    const organizationId = await this.resolveOrg(userOrgId);
    const teachers = await this.prisma.teacher.findMany({
      where: { organizationId },
      include: { user: true, assignments: { include: { class: true, subject: true } } },
    });
    return teachers.map((t) => ({
      id: t.id,
      name: t.user.displayName,
      assignments: t.assignments.map((a) => ({
        id: a.id, classId: a.classId, classLabel: a.class.label,
        subjectId: a.subjectId, subjectName: a.subject.name, subGroupId: a.subGroupId,
      })),
    }));
  }

  async assign(dto: AssignDto) {
    const a = await this.prisma.teachingAssignment.upsert({
      where: { teacherId_classId_subjectId: { teacherId: dto.teacherId, classId: dto.classId, subjectId: dto.subjectId } },
      update: { subGroupId: dto.subGroupId ?? null },
      create: { organizationId: TenantContext.require(), teacherId: dto.teacherId, classId: dto.classId, subjectId: dto.subjectId, subGroupId: dto.subGroupId ?? null },
    });
    return { id: a.id };
  }

  async unassign(id: string) {
    await this.prisma.teachingAssignment.delete({ where: { id } });
    return { ok: true };
  }

  // ─── привязанные устройства-киоски (реальные, из таблицы Device) ───
  async listDevices(userOrgId: string | null) {
    const organizationId = await this.resolveOrg(userOrgId);
    const devices = await this.prisma.device.findMany({
      where: { orgId: organizationId },
      orderBy: { createdAt: 'desc' },
    });
    const boundIds = [...new Set(devices.map((d) => d.boundByUserId).filter((x): x is string => !!x))];
    const users = boundIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: boundIds } } })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.displayName]));
    return devices.map((d) => ({
      id: d.id,
      name: d.name,
      boundBy: d.boundByUserId ? (nameById.get(d.boundByUserId) ?? null) : null,
      boundAt: d.createdAt.toISOString(),
    }));
  }

  async deleteDevice(id: string) {
    await this.prisma.device.delete({ where: { id } });
    return { ok: true };
  }
}

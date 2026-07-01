import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { newEvent } from '../../common/events/domain-event';
import {
  ENGINE_EVENTS,
  type AttendanceMarkedV1,
  type KppApprovedV1,
  type KppScheduledV1,
  type KtpApprovedV1,
  type LessonPhaseChangedV1,
  type LessonStartedV1,
  type TopicCompletedV1,
  type TopicProgressedV1,
} from './engine.contract';

// База термового календаря для раскладки уроков на даты (упрощение v1; реальный календарь
// слот→дата по неделям семестра — уточнение).
const TERM_START = new Date('2025-09-01T08:00:00Z');
const DAY_MS = 24 * 3600 * 1000;

/**
 * Движок планирования — единственный писатель КТП/Timetable/КПП/Lesson (Архстандарт §8).
 * Пайплайн §7: ktp.approved → Solver (генерация КПП) → kpp.scheduled → kpp.approved → гейт урока.
 * Все запросы тенант-scoped (workspaceId из контекста); записи проставляют workspaceId явно.
 */
@Injectable()
export class EngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  // ─────────────── КТП ───────────────
  getKtp(classId?: string, disciplineId?: string) {
    return this.prisma.ktp.findMany({
      where: { ...(classId && { classId }), ...(disciplineId && { disciplineId }) },
      include: { topics: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveKtp(ktpId: string, approver: string) {
    const ktp = await this.prisma.ktp.findUnique({ where: { id: ktpId } });
    if (!ktp) throw new NotFoundException('КТП не найден');
    const ws = TenantContext.require();
    await this.prisma.$transaction(async (tx) => {
      await tx.ktp.update({ where: { id: ktpId }, data: { status: 'approved', approvedBy: approver } });
      await this.outbox.enqueue(
        tx,
        newEvent<KtpApprovedV1>({
          type: ENGINE_EVENTS.ktpApproved,
          workspaceId: ws,
          actor: approver,
          payload: { ktpId, classId: ktp.classId, disciplineId: ktp.disciplineId },
        }),
      );
    });
    return { id: ktpId, status: 'approved' as const, classId: ktp.classId, disciplineId: ktp.disciplineId };
  }

  // ─────────────── Solver (§3): детерминированная раскладка тем КТП по слотам Timetable, 0 ИИ ───────────────
  async generateKpp(classId: string, disciplineId: string) {
    const ws = TenantContext.require();
    const ktp = await this.prisma.ktp.findFirst({
      where: { classId, disciplineId, status: 'approved' },
      include: { topics: { orderBy: { order: 'asc' } } },
    });
    if (!ktp) throw new ConflictException({ code: 'NO_APPROVED_KTP', message: 'нет утверждённого КТП' });
    const timetable = await this.prisma.timetable.findFirst({
      where: { classId },
      include: { slots: { orderBy: [{ day: 'asc' }, { position: 'asc' }] } },
    });
    if (!timetable) throw new ConflictException({ code: 'NO_TIMETABLE', message: 'нет геометрии Timetable' });

    const slots = timetable.slots;
    const totalHours = ktp.topics.reduce((s, t) => s + t.fgosHours, 0);
    if (slots.length < totalHours) {
      // §3: часов темы не хватает в сетке
      throw new ConflictException({ code: 'INSUFFICIENT_SLOTS', requiredHours: totalHours, available: slots.length });
    }
    // защита от деструктивной регенерации: не пересобирать КПП, если есть проведённые/идущие
    // уроки (иначе каскад удалил бы их оценки). Регенерация допустима только по idle-плану.
    const inFlight = await this.prisma.lesson.count({
      where: { kppLesson: { kpp: { classId, disciplineId } }, state: { not: 'idle' } },
    });
    if (inFlight > 0) {
      throw new ConflictException({ code: 'KPP_IN_USE', message: 'нельзя пересобрать КПП: есть идущие/проведённые уроки' });
    }

    // входные слоты завуча (Архстандарт §7, Solver §3): утв. ФГОС-часы + оргстандарты.
    // FgosHours (если утв.) — авторитетный total; OrgStandards.lessonLengthMin доступен Solver.
    // Полное применение OrgStandards (спарки/физминутки/порядок) — стаб (см. docs/ENGINE.md).
    const fgos = await this.prisma.fgosHours.findFirst({ where: { classId, disciplineId, approvedAt: { not: null } } });
    const org = await this.prisma.orgStandards.findFirst();
    const fgosMatch = !fgos || fgos.hours === totalHours;
    const standards = { fgosHours: fgos?.hours ?? null, lessonLengthMin: org?.lessonLengthMin ?? null, fgosMatch };

    const result = await this.prisma.$transaction(async (tx) => {
      // регенерация идемпотентна: снести прошлый КПП (class,discipline) + его уроки-экземпляры
      const old = await tx.kpp.findMany({
        where: { classId, disciplineId },
        select: { lessons: { select: { id: true } } },
      });
      const oldKlIds = old.flatMap((k) => k.lessons.map((l) => l.id));
      if (oldKlIds.length) await tx.lesson.deleteMany({ where: { kppLessonId: { in: oldKlIds } } });
      await tx.kpp.deleteMany({ where: { classId, disciplineId } });

      const kpp = await tx.kpp.create({ data: { workspaceId: ws, classId, disciplineId, status: 'scheduled' } });
      let slotIdx = 0;
      let seq = 1;
      for (const topic of ktp.topics) {
        for (let h = 0; h < topic.fgosHours; h++) {
          const slot = slots[slotIdx++];
          const kl = await tx.kppLesson.create({
            data: {
              workspaceId: ws,
              kppId: kpp.id,
              topicId: topic.id,
              sequenceNo: seq,
              plannedContent: { arCodes: topic.arCodes },
            },
          });
          await tx.kppMapping.create({ data: { workspaceId: ws, kppLessonId: kl.id, timetableSlotId: slot.id } });
          await tx.lesson.create({
            data: {
              workspaceId: ws,
              subjectId: disciplineId,
              classId,
              kppLessonId: kl.id,
              topic: topic.title,
              shortTitle: topic.title.slice(0, 24),
              lessonNumber: seq,
              date: new Date(TERM_START.getTime() + (seq - 1) * DAY_MS),
              mode: 'auto',
              state: 'idle',
            },
          });
          seq++;
        }
      }
      await this.outbox.enqueue(
        tx,
        newEvent<KppScheduledV1>({
          type: ENGINE_EVENTS.kppScheduled,
          workspaceId: ws,
          payload: { kppId: kpp.id, classId, disciplineId, lessonCount: seq - 1 },
        }),
      );
      return { id: kpp.id, status: 'scheduled' as const, lessonCount: seq - 1 };
    });
    return { ...result, standards }; // исход + использованные входные слоты завуча
  }

  getKpp(classId?: string, disciplineId?: string) {
    return this.prisma.kpp.findMany({
      where: { ...(classId && { classId }), ...(disciplineId && { disciplineId }) },
      include: { lessons: { orderBy: { sequenceNo: 'asc' }, include: { topic: true, mapping: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveKpp(kppId: string, approver: string) {
    const kpp = await this.prisma.kpp.findUnique({ where: { id: kppId } });
    if (!kpp) throw new NotFoundException('КПП не найден');
    const ws = TenantContext.require();
    await this.prisma.$transaction(async (tx) => {
      await tx.kpp.update({ where: { id: kppId }, data: { status: 'approved', approvedBy: approver } });
      await this.outbox.enqueue(
        tx,
        newEvent<KppApprovedV1>({ type: ENGINE_EVENTS.kppApproved, workspaceId: ws, actor: approver, payload: { kppId } }),
      );
    });
    return { id: kppId, status: 'approved' as const };
  }

  // ─────────────── Timetable ───────────────
  getTimetable(classId?: string) {
    return this.prisma.timetable.findMany({
      where: classId ? { classId } : {},
      include: { slots: { orderBy: [{ day: 'asc' }, { position: 'asc' }] } },
    });
  }

  // ─────────────── Lesson FSM (гейт §7) ───────────────
  async getLesson(id: string) {
    const l = await this.prisma.lesson.findUnique({
      where: { id },
      include: { kppLesson: { include: { kpp: true } } },
    });
    if (!l) throw new NotFoundException('урок не найден');
    return { ...l, startGateOpen: l.kppLesson?.kpp.status === 'approved' };
  }

  /** Гейт «провести урок»: state→running ТОЛЬКО при kpp.approved урока (Архстандарт §7). */
  async startLesson(id: string, teacherId: string) {
    const l = await this.prisma.lesson.findUnique({ where: { id }, include: { kppLesson: { include: { kpp: true } } } });
    if (!l) throw new NotFoundException('урок не найден');
    if (l.kppLesson?.kpp.status !== 'approved') {
      throw new ConflictException({ code: 'LESSON_LOCKED', message: 'провести урок можно только после утверждения КПП (kpp.approved)' });
    }
    if (l.state !== 'idle') throw new BadRequestException(`урок уже ${l.state}`);
    const ws = TenantContext.require();
    await this.prisma.$transaction(async (tx) => {
      await tx.lesson.update({ where: { id }, data: { state: 'running', t0: new Date(), teacherId } });
      await this.outbox.enqueue(
        tx,
        newEvent<LessonStartedV1>({ type: ENGINE_EVENTS.lessonStarted, workspaceId: ws, actor: teacherId, payload: { lessonId: id } }),
      );
    });
    return { id, state: 'running' as const };
  }

  async setPhase(id: string, phase: string, teacherId: string) {
    const l = await this.prisma.lesson.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('урок не найден');
    if (l.state !== 'running') throw new BadRequestException('урок не идёт (state≠running)');
    const ws = TenantContext.require();
    await this.prisma.$transaction(async (tx) => {
      await tx.lesson.update({ where: { id }, data: { phase } });
      await this.outbox.enqueue(
        tx,
        newEvent<LessonPhaseChangedV1>({ type: ENGINE_EVENTS.lessonPhaseChanged, workspaceId: ws, actor: teacherId, payload: { lessonId: id, phase } }),
      );
    });
    return { id, phase };
  }

  async completeLesson(id: string) {
    const l = await this.prisma.lesson.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('урок не найден');
    if (l.state !== 'running') throw new BadRequestException('урок не идёт (state≠running)');
    await this.prisma.lesson.update({ where: { id }, data: { state: 'done' } });
    return { id, state: 'done' as const };
  }

  // ─────────────── Сигналы урока → ИОМ (Архстандарт §6). marks несут реальный studentId. ───────────────
  private async emit(type: string, payload: object, actor: string) {
    const ws = TenantContext.require();
    await this.prisma.$transaction((tx) => this.outbox.enqueue(tx, newEvent({ type, workspaceId: ws, actor, payload })));
  }

  async markAttendance(lessonId: string, marks: AttendanceMarkedV1['marks'], teacherId: string) {
    await this.emit(ENGINE_EVENTS.attendanceMarked, { lessonId, marks } as AttendanceMarkedV1, teacherId);
    return { ok: true, marked: marks.length };
  }

  async topicProgress(lessonId: string, topicId: string, timeSpent: number, teacherId: string) {
    await this.emit(ENGINE_EVENTS.topicProgressed, { lessonId, topicId, timeSpent } as TopicProgressedV1, teacherId);
    return { ok: true };
  }

  async topicComplete(lessonId: string, topicId: string, teacherId: string) {
    await this.emit(ENGINE_EVENTS.topicCompleted, { lessonId, topicId } as TopicCompletedV1, teacherId);
    return { ok: true };
  }

  // ─────────────── Расписание (Кабинеты_ТЗ; schedule.built публикует ТОЛЬКО движок, §8) ───────────────
  async scheduleMe(teacherId: string) {
    const assignments = await this.prisma.teachingAssignment.findMany({ where: { teacherId }, select: { classId: true } });
    const classIds = [...new Set(assignments.map((a) => a.classId))];
    return this.prisma.lesson.findMany({
      where: { classId: { in: classIds } },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, topic: true, classId: true, subjectId: true, state: true },
    });
  }

  scheduleBuilder() {
    return this.prisma.timetable.findMany({ include: { slots: { orderBy: [{ day: 'asc' }, { position: 'asc' }] } } });
  }

  /** Завуч POST schedule/build ДЕЛЕГИРУЕТ движку; событие schedule.built публикует движок (§8). */
  async buildSchedule(actor: string) {
    await this.emit(ENGINE_EVENTS.scheduleBuilt, { note: 'schedule rebuilt' }, actor);
    return { ok: true, event: ENGINE_EVENTS.scheduleBuilt };
  }
}

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  ACCESS_PARAMS,
  SINGLETON_ROLES,
  type ActivationTokenDto,
  type JoinStaffDto,
  type SchoolRole,
  type StaffCardDto,
  type TokenStatus,
} from '@edustore/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OutboxService } from '../../common/outbox/outbox.service';
import { newEvent } from '../../common/events/domain-event';
import { SchoolSessionService } from '../../common/auth/school-session.service';
import {
  SCHOOL_EVENTS,
  type StaffDeactivatedV1,
  type StaffDeletedV1,
  type StaffReactivatedV1,
  type StaffRegisteredV1,
  type TeacherUnboundV1,
} from '../schoolium.contract';
import { SchoolError } from '../schoolium.errors';
import { AccessService } from '../access/access.service';
import { JournalContractService } from '../journal/journal.service';
import { SubjectsContractService } from '../subjects/subjects.service';
import type { SchoolActor } from '../actor';

const MIN = 60_000;

/**
 * Персонал: карточки, присутственная QR-регистрация (AR-76), роли (AR-102),
 * удаление, деактивация и реактивация (AR-89).
 *
 * Отдельной секции «Модераторы» на `S-30` нет: модератор — уровень доступа, а не
 * должность в штатном расписании школы. Роль выдаётся кнопкой «Добавить роль» на
 * карточке любого зарегистрированного сотрудника и той же кнопкой снимается.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly sessions: SchoolSessionService,
    private readonly access: AccessService,
    private readonly journal: JournalContractService,
    private readonly subjects: SubjectsContractService,
  ) {}

  // ─────────────── чтение ───────────────

  async list(): Promise<StaffCardDto[]> {
    const cards = await this.prisma.staffCard.findMany({ orderBy: [{ section: 'asc' }, { seq: 'asc' }] });
    return Promise.all(cards.map((c) => this.toDto(c)));
  }

  async get(id: string): Promise<StaffCardDto> {
    const c = await this.prisma.staffCard.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('карточка не найдена');
    return this.toDto(c);
  }

  private async toDto(c: { id: string; section: number; plannedRoles: string[]; userId: string | null; workspaceId: string }): Promise<StaffCardDto> {
    if (!c.userId) {
      return {
        id: c.id,
        section: c.section as 1 | 2 | 3,
        roles: c.plannedRoles as SchoolRole[],
        registered: false,
        userId: null,
        name: null,
        avatarUrl: null,
        deactivated: false,
        hasHistory: false,
      };
    }
    const [user, membership] = await TenantContext.runAsSystem(() =>
      Promise.all([
        this.prisma.user.findUnique({ where: { id: c.userId! } }),
        this.prisma.membership.findFirst({ where: { userId: c.userId!, workspaceId: c.workspaceId } }),
      ]),
    );
    return {
      id: c.id,
      section: c.section as 1 | 2 | 3,
      // у зарегистрированного роли живут в членстве — оно единственный их носитель
      roles: (membership?.roles ?? []) as SchoolRole[],
      registered: true,
      userId: c.userId,
      name: user?.displayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      deactivated: membership?.deactivatedAt !== null && membership?.deactivatedAt !== undefined,
      hasHistory: await this.hasHistory(c.userId),
    };
  }

  /**
   * «История» сотрудника (AR-89): привязки к предметам либо выставленные отметки.
   * Решает СЕРВЕР, а не интерфейс: ответ карточки несёт `hasHistory`, и экран
   * показывает ровно одну кнопку из двух.
   */
  private async hasHistory(userId: string): Promise<boolean> {
    if (await this.subjects.hasBindings(userId)) return true;
    return this.journal.teacherHasMarks(userId);
  }

  /** `S-30.btn.addFounder` / `S-30.btn.addTeacher`: пустая карточка множественной роли. */
  async addCard(role: SchoolRole) {
    if (SINGLETON_ROLES.includes(role)) {
      throw new ForbiddenException(`роль ${role} существует в школе в единственном экземпляре`);
    }
    const ws = TenantContext.require();
    const section = role === 'founder' ? 1 : role === 'teacher' ? 3 : 2;
    const seq = await this.prisma.staffCard.count({ where: { section } });
    const c = await this.prisma.staffCard.create({
      data: { workspaceId: ws, section, plannedRoles: [role], seq },
    });
    return this.get(c.id);
  }

  // ─────────────── QR-активация (§11 строка 4, AR-76, AR-87) ───────────────

  async createActivationToken(cardId: string): Promise<ActivationTokenDto> {
    const ws = TenantContext.require();
    const card = await this.prisma.staffCard.findUnique({ where: { id: cardId } });
    if (!card) throw new NotFoundException('карточка не найдена');
    const t = await this.prisma.activationToken.create({
      data: {
        workspaceId: ws,
        token: randomBytes(20).toString('hex'),
        purpose: 'staff_activation',
        targetId: cardId,
        roles: card.plannedRoles,
        expiresAt: new Date(Date.now() + ACCESS_PARAMS.activationTtlMinutes * MIN),
      },
    });
    return { token: t.token, status: 'waiting', expiresAt: t.expiresAt.toISOString() };
  }

  /** Поллинг статуса раз в 2 секунды, пока карточка открыта (AR-87). */
  async activationStatus(cardId: string): Promise<ActivationTokenDto> {
    const t = await this.prisma.activationToken.findFirst({
      where: { purpose: 'staff_activation', targetId: cardId },
      orderBy: { createdAt: 'desc' },
    });
    const card = await this.prisma.staffCard.findUnique({ where: { id: cardId } });
    const registeredName = card?.userId
      ? (await TenantContext.runAsSystem(() => this.prisma.user.findUnique({ where: { id: card.userId! } })))?.displayName ?? null
      : null;
    if (!t) return { token: '', status: 'expired', expiresAt: new Date().toISOString(), registeredName };
    const status: TokenStatus = t.state === 'used' ? 'used' : t.expiresAt < new Date() ? 'expired' : (t.state as TokenStatus);
    return { token: t.token, status, expiresAt: t.expiresAt.toISOString(), registeredName };
  }

  /** `S-31.btn.close`: закрытие карточки ГАСИТ QR — код не переживает встречу. */
  async closeCard(cardId: string) {
    await this.prisma.activationToken.updateMany({
      where: { purpose: 'staff_activation', targetId: cardId, state: 'waiting' },
      data: { state: 'expired' },
    });
    return { ok: true };
  }

  // ─────────────── регистрация по QR (§11 строка 5) ───────────────

  /**
   * `S-03`. Три ветки AR-106, НЕРАЗЛИЧИМЫЕ снаружи по форме ответа:
   *   членство в ЭТОЙ школе есть → `PHONE_TAKEN_IN_SCHOOL`;
   *   `User` есть, членства в этой школе нет → создаётся членство к существующему
   *     `User`, ФИО из формы применяются к членству и НЕ переписывают глобальную
   *     запись — педагог из другой школы регистрируется, а не получает отказ;
   *   телефона нет → создаются `User` и `Membership`.
   *
   * Сессия выдаётся, только если страницу открыл САМ сотрудник (AR-91): чужое
   * устройство не становится его кабинетом. Признак не угадывается — страница
   * знает, кто её открыл, по наличию живой сессии модератора в том же браузере.
   */
  async join(token: string, dto: JoinStaffDto, opts: { openedByOtherSession: boolean; deviceHint: string }) {
    const t = await TenantContext.runAsSystem(() =>
      this.prisma.activationToken.findUnique({ where: { token } }),
    );
    if (!t || t.purpose !== 'staff_activation') throw new SchoolError('TOKEN_EXPIRED');
    if (t.state === 'used') throw new SchoolError('TOKEN_USED');
    if (t.expiresAt < new Date() || t.state === 'expired') throw new SchoolError('TOKEN_EXPIRED');

    const ws = t.workspaceId;
    const phone = dto.phone.replace(/[^\d+]/g, '');
    const roles = t.roles as SchoolRole[];

    return TenantContext.runAsSystem(async () => {
      const existing = await this.prisma.user.findUnique({ where: { phone } });
      if (existing) {
        const here = await this.prisma.membership.findFirst({ where: { userId: existing.id, workspaceId: ws } });
        if (here) throw new SchoolError('PHONE_TAKEN_IN_SCHOOL');
      }

      const userId = existing?.id ?? `u-${randomUUID()}`;
      const displayName = `${dto.lastName.trim()} ${dto.firstName.trim()}`.trim();

      await this.prisma.$transaction(async (tx) => {
        if (!existing) {
          await tx.user.create({
            data: {
              id: userId,
              phone,
              firstName: dto.firstName.trim(),
              lastName: dto.lastName.trim(),
              middleName: dto.middleName?.trim() || null,
              displayName,
            },
          });
        }
        await tx.membership.create({
          data: {
            florusUserId: userId,
            userId,
            workspaceId: ws,
            florusRole: 'staff', // legacy-колонка контура КТП; роли версии — в roles[]
            roles,
          },
        });
        await tx.staffCard.update({ where: { id: t.targetId }, data: { userId } });
        await tx.activationToken.update({ where: { id: t.id }, data: { state: 'used', usedAt: new Date() } });
        await this.outbox.enqueue(
          tx,
          newEvent<StaffRegisteredV1>({
            type: SCHOOL_EVENTS.staffRegistered,
            workspaceId: ws,
            actor: userId,
            payload: { userId, roles, registeredVia: 'moderator_qr' },
          }),
        );
      });

      if (opts.openedByOtherSession) {
        // регистрацию заполнили с устройства модератора: якоря у сотрудника нет,
        // вход — код с карточки (AR-91, AR-92)
        return { ok: true, sessionToken: null as string | null, userId };
      }
      const session = await this.sessions.issue({ userId, workspaceId: ws, roles, deviceHint: opts.deviceHint });
      await this.access.publishSessionStarted(userId, ws, 'registration', opts.deviceHint);
      return { ok: true, sessionToken: session.token, userId };
    });
  }

  // ─────────────── роли (§11 строки 7, 32; AR-102) ───────────────

  /** `S-31.btn.addRole`. Роль `moderator` выдаётся любому — так появляется второй. */
  async addRole(cardId: string, role: SchoolRole, actor: SchoolActor) {
    const { membership } = await this.registered(cardId);
    if (membership.roles.includes(role)) return this.get(cardId);
    await TenantContext.runAsSystem(() =>
      this.prisma.membership.update({ where: { id: membership.id }, data: { roles: [...membership.roles, role] } }),
    );
    return this.get(cardId);
  }

  /**
   * `S-31.btn.removeRole`. Два предохранителя: роль последнего активного
   * модератора не снимается (`LAST_MODERATOR`), последняя роль сотрудника не
   * снимается вовсе (`LAST_ROLE`) — для закрытия доступа есть деактивация, а
   * сотрудник без единой роли это запись, о правах которой нельзя рассуждать.
   */
  async removeRole(cardId: string, role: SchoolRole, actor: SchoolActor) {
    const { membership, workspaceId } = await this.registered(cardId);
    if (role === 'moderator' && (await this.activeModerators(workspaceId)) <= 1) {
      throw new SchoolError('LAST_MODERATOR');
    }
    if (membership.roles.length <= 1) throw new SchoolError('LAST_ROLE');
    await TenantContext.runAsSystem(() =>
      this.prisma.membership.update({
        where: { id: membership.id },
        data: { roles: membership.roles.filter((r) => r !== role) },
      }),
    );
    return this.get(cardId);
  }

  private async registered(cardId: string) {
    const card = await this.prisma.staffCard.findUnique({ where: { id: cardId } });
    if (!card?.userId) throw new NotFoundException('сотрудник не зарегистрирован');
    const membership = await TenantContext.runAsSystem(() =>
      this.prisma.membership.findFirst({ where: { userId: card.userId!, workspaceId: card.workspaceId } }),
    );
    if (!membership) throw new NotFoundException('членство не найдено');
    return { card, membership, workspaceId: card.workspaceId, userId: card.userId };
  }

  private async activeModerators(workspaceId: string): Promise<number> {
    return TenantContext.runAsSystem(() =>
      this.prisma.membership.count({
        where: { workspaceId, deactivatedAt: null, roles: { has: 'moderator' } },
      }),
    );
  }

  // ─────────────── удаление, деактивация, реактивация (§11 строки 29–31) ───────────────

  /**
   * Каскад один для удаления и деактивации (AR-89): привязки к предметам
   * снимаются, покрытие предметов падает, сетка помечается `stale` — уроки без
   * исполнителя человек видит плашкой, а не узнаёт в сентябре. Выставленные
   * отметки ОСТАЮТСЯ: `postedBy` — историческая ссылка, а не живая связь.
   */
  private async cascadeUnbind(userId: string, workspaceId: string, actor: SchoolActor): Promise<string[]> {
    const unbound = await this.subjects.unbindAllOfTeacher(userId);
    for (const u of unbound) {
      await this.prisma.$transaction((tx) =>
        this.outbox.enqueue(
          tx,
          newEvent<TeacherUnboundV1>({
            type: SCHOOL_EVENTS.teacherUnbound,
            workspaceId,
            actor: actor.userId,
            payload: { subjectId: u.subjectId, classId: u.classId, teacherId: userId, reason: 'staff_removed' },
          }),
        ),
      );
    }
    return unbound.map((u) => u.subjectId);
  }

  async deactivate(cardId: string, actor: SchoolActor) {
    const { membership, workspaceId, userId } = await this.registered(cardId);
    if (membership.roles.includes('moderator') && (await this.activeModerators(workspaceId)) <= 1) {
      throw new SchoolError('LAST_MODERATOR');
    }
    const unboundSubjects = await this.cascadeUnbind(userId, workspaceId, actor);
    await TenantContext.runAsSystem(() =>
      this.prisma.membership.update({ where: { id: membership.id }, data: { deactivatedAt: new Date() } }),
    );
    // деактивация отзывает активные сессии НЕМЕДЛЕННО — иначе доступ уволенного
    // живёт 90 дней (AR-92)
    await this.sessions.revokeAllForUser(userId, 'deactivated');
    await this.prisma.$transaction((tx) =>
      this.outbox.enqueue(
        tx,
        newEvent<StaffDeactivatedV1>({
          type: SCHOOL_EVENTS.staffDeactivated,
          workspaceId,
          actor: actor.userId,
          payload: { userId, unboundSubjects },
        }),
      ),
    );
    await this.access.publishSessionRevoked(userId, workspaceId, 'deactivated', actor.userId);
    return this.get(cardId);
  }

  /** Реактивация возвращает доступ; сессии не воскресают — вход заново. */
  async reactivate(cardId: string, actor: SchoolActor) {
    const { membership, workspaceId, userId } = await this.registered(cardId);
    await TenantContext.runAsSystem(() =>
      this.prisma.membership.update({ where: { id: membership.id }, data: { deactivatedAt: null } }),
    );
    await this.prisma.$transaction((tx) =>
      this.outbox.enqueue(
        tx,
        newEvent<StaffReactivatedV1>({
          type: SCHOOL_EVENTS.staffReactivated,
          workspaceId,
          actor: actor.userId,
          payload: { userId },
        }),
      ),
    );
    return this.get(cardId);
  }

  /**
   * Удаление доступно сотруднику БЕЗ привязок и БЕЗ выставленных отметок;
   * сотрудник с историей деактивируется, и деактивация обратима (AR-89).
   * Последний активный модератор не удаляется — правило защищает школу, а не
   * должность: при двух модераторах любой удаляется свободно.
   */
  async remove(cardId: string, actor: SchoolActor) {
    const { membership, workspaceId, userId } = await this.registered(cardId);
    if (membership.roles.includes('moderator') && (await this.activeModerators(workspaceId)) <= 1) {
      throw new SchoolError('LAST_MODERATOR');
    }
    // Гейт живёт в контракте, а не в интерфейсе (красная линия 3): карточка могла
    // показать «Удалить» до того, как сотрудник выставил отметку (AR-113).
    if (await this.hasHistory(userId)) throw new SchoolError('STAFF_HAS_HISTORY');
    const unboundSubjects = await this.cascadeUnbind(userId, workspaceId, actor);
    await this.sessions.revokeAllForUser(userId, 'deleted');
    await TenantContext.runAsSystem(async () => {
      await this.prisma.membership.deleteMany({ where: { id: membership.id } });
      await this.prisma.staffCard.update({ where: { id: cardId }, data: { userId: null } });
    });
    await this.prisma.$transaction((tx) =>
      this.outbox.enqueue(
        tx,
        newEvent<StaffDeletedV1>({
          type: SCHOOL_EVENTS.staffDeleted,
          workspaceId,
          actor: actor.userId,
          payload: { userId, unboundSubjects },
        }),
      ),
    );
    await this.access.publishSessionRevoked(userId, workspaceId, 'deleted', actor.userId);
    return { ok: true };
  }

  // ─────────────── код входа и сессии (§11 строки 35, 37) ───────────────

  /** `S-31.btn.loginCode`: выдаётся повторно столько раз, сколько нужно (AR-92). */
  async issueLoginCode(cardId: string) {
    const { userId, workspaceId } = await this.registered(cardId);
    return this.access.issueLoginCode(userId, workspaceId);
  }

  async revokeSessions(cardId: string, actor: SchoolActor) {
    const { userId, workspaceId } = await this.registered(cardId);
    const count = await this.sessions.revokeAllForUser(userId, 'manual');
    await this.access.publishSessionRevoked(userId, workspaceId, 'manual', actor.userId);
    return { ok: true, revoked: count };
  }

  // ─────────────── аватар (§11 строки 6, 33) ───────────────

  async setAvatar(userId: string, url: string) {
    await TenantContext.runAsSystem(() =>
      this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } }),
    );
    return { ok: true };
  }

  async clearAvatar(userId: string) {
    await TenantContext.runAsSystem(() =>
      this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } }),
    );
    return { ok: true };
  }
}

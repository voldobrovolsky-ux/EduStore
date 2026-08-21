import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  MARK_VALUES,
  isNumericMark,
  type JournalColumnDto,
  type JournalDto,
  type JournalRowDto,
  type MarkValue,
  type SchoolRole,
} from '@edustore/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OutboxService } from '../../common/outbox/outbox.service';
import { newEvent } from '../../common/events/domain-event';
import { SCHOOL_EVENTS, type MarkPostedV1, type MarkRemovedV1, type TopicSetV1 } from '../schoolium.contract';
import { SchoolError } from '../schoolium.errors';
import { schoolTodayIso as today } from '../calendar/school-day';

export interface Actor {
  userId: string;
  roles: SchoolRole[];
  name: string;
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Журнал 1.1.1 (AR-74, AR-79, AR-83).
 *
 * Колонка = материализованный урок, строка = ученик; обе проекции приезжают
 * событиями (`JournalProjection`). Отметки и темы — собственные данные журнала,
 * и единственный их писатель — этот сервис.
 *
 * **Порядок проверок один для всех** (стенд P11): сперва полномочия, затем гейт
 * реальности. Полные права модератора (AR-88) не отменяют второго: непроведённый
 * урок закрыт и для него — это факт календаря, а не уровень доступа.
 */
@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  // ─────────────── чтение ───────────────

  async read(classId: string, subjectId: string, nextSchoolDay: string | null): Promise<JournalDto> {
    const [columns, rows] = await Promise.all([
      this.prisma.journalColumn.findMany({
        where: { classId, subjectId },
        orderBy: [{ date: 'asc' }, { slotNo: 'asc' }],
        include: { lessonTopic: true },
      }),
      this.prisma.journalRow.findMany({
        where: { classId },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { middleName: 'asc' }],
        include: { marks: true },
      }),
    ]);
    const t = today();
    const cols: JournalColumnDto[] = columns.map((c) => ({
      lessonId: c.lessonId,
      date: isoDay(c.date),
      slotNo: c.slotNo,
      subjectId: c.subjectId,
      teacherId: c.teacherId,
      topic: c.lessonTopic?.topic ?? null,
      future: isoDay(c.date) > t,
      detached: c.detachedAt !== null,
    }));
    const out: JournalRowDto[] = rows.map((r) => {
      const marks: Record<string, MarkValue> = {};
      for (const m of r.marks) marks[m.lessonId] = m.value as MarkValue;
      const nums = r.marks.map((m) => m.value as MarkValue).filter(isNumericMark).map(Number);
      return {
        studentId: r.studentId,
        lastName: r.lastName,
        firstName: r.firstName,
        middleName: r.middleName,
        sex: (r.sex as 'm' | 'f' | null) ?? null,
        deactivated: r.deactivated,
        marks,
        average: nums.length ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)) : null,
      };
    });
    return { classId, subjectId, columns: cols, rows: out, nextSchoolDay };
  }

  // ─────────────── гейты ───────────────

  /**
   * Эталон — `markGate` в `model/states.mjs`. Возвращает колонку либо бросает
   * названный отказ. `mode` различает две ветки записи: постановка отметки
   * дополнительно смотрит на ученика, снятие — нет.
   */
  private async gate(lessonId: string, actor: Actor) {
    const col = await this.prisma.journalColumn.findUnique({ where: { lessonId } });
    if (!col) throw new SchoolError('LESSON_NOT_HELD');

    // 1. полномочия: модератор — любой урок школы (AR-88); педагог — свой
    const may =
      actor.roles.includes('moderator') ||
      (actor.roles.includes('teacher') && col.teacherId === actor.userId);
    if (!may) throw new ForbiddenException('нет права записи в этот урок');

    // 2. гейт реальности: урок вне расписания (AR-85) и непроведённый урок (AR-74).
    // Коды разные намеренно: тот про урок, которого больше нет, этот — про урок,
    // который ещё не прошёл. Один код на две причины оставил бы человека без
    // понимания, что произошло.
    if (col.detachedAt) throw new SchoolError('LESSON_DETACHED');
    if (isoDay(col.date) > today()) throw new SchoolError('LESSON_NOT_HELD');
    return col;
  }

  // ─────────────── мутации ───────────────

  /** §11 строка 24 · `S-52`: отметка. Шкала — шесть значений (AR-79). */
  async postMark(lessonId: string, studentId: string, mark: MarkValue, actor: Actor) {
    if (!MARK_VALUES.includes(mark)) throw new SchoolError('LESSON_NOT_HELD');
    await this.gate(lessonId, actor);
    const row = await this.prisma.journalRow.findUnique({ where: { studentId } });
    if (!row) throw new SchoolError('STUDENT_INACTIVE');
    if (row.deactivated) throw new SchoolError('STUDENT_INACTIVE');

    const ws = TenantContext.require();
    await this.prisma.$transaction(async (tx) => {
      await tx.mark.upsert({
        where: { lessonId_studentId: { lessonId, studentId } },
        update: { value: mark, postedBy: actor.userId, postedAt: new Date() },
        create: { workspaceId: ws, lessonId, studentId, value: mark, postedBy: actor.userId },
      });
      await this.outbox.enqueue(
        tx,
        newEvent<MarkPostedV1>({
          type: SCHOOL_EVENTS.markPosted,
          workspaceId: ws,
          actor: actor.userId,
          payload: { lessonId, studentId, mark, postedBy: actor.userId },
        }),
      );
    });
    return { ok: true };
  }

  /**
   * §11 строка 25 · `S-52.btn.clear`: снятие отметки — ЕДИНСТВЕННЫЙ способ её
   * стереть, и он именной (AR-88): в аудит уходит идентичность снявшего.
   */
  async removeMark(lessonId: string, studentId: string, actor: Actor) {
    await this.gate(lessonId, actor);
    const ws = TenantContext.require();
    await this.prisma.$transaction(async (tx) => {
      await tx.mark.deleteMany({ where: { lessonId, studentId } });
      await this.outbox.enqueue(
        tx,
        newEvent<MarkRemovedV1>({
          type: SCHOOL_EVENTS.markRemoved,
          workspaceId: ws,
          actor: actor.userId,
          payload: { lessonId, studentId, removedBy: actor.userId },
        }),
      );
    });
    return { ok: true };
  }

  /** §11 строка 23 · `S-51`: тема урока. Снятия темы нет — только замена текста. */
  async setTopic(lessonId: string, topic: string, actor: Actor) {
    await this.gate(lessonId, actor);
    const ws = TenantContext.require();
    await this.prisma.$transaction(async (tx) => {
      await tx.lessonTopic.upsert({
        where: { lessonId },
        update: { topic, setBy: actor.userId, setAt: new Date() },
        create: { workspaceId: ws, lessonId, topic, setBy: actor.userId },
      });
      await this.outbox.enqueue(
        tx,
        newEvent<TopicSetV1>({
          type: SCHOOL_EVENTS.topicSet,
          workspaceId: ws,
          actor: actor.userId,
          payload: { lessonId, topic, setBy: actor.userId },
        }),
      );
    });
    return { ok: true };
  }
}

/**
 * Публичный ЧИТАЮЩИЙ контракт журнала (AR-45): «есть ли история» спрашивают у
 * него, а не запросом в его таблицы. На этот вопрос опирается правило подмены
 * кнопки «удалить» → «деактивировать» (AR-78, AR-89) и отказ `CLASS_HAS_MARKS`.
 */
@Injectable()
export class JournalContractService {
  constructor(private readonly prisma: PrismaService) {}

  async studentHasMarks(studentId: string): Promise<boolean> {
    return (await this.prisma.mark.count({ where: { studentId } })) > 0;
  }

  async classHasMarks(classId: string): Promise<boolean> {
    const rows = await this.prisma.journalRow.findMany({ where: { classId }, select: { studentId: true } });
    if (!rows.length) return false;
    return (await this.prisma.mark.count({ where: { studentId: { in: rows.map((r) => r.studentId) } } })) > 0;
  }

  /** Сотрудник «с историей» — тот, кто хоть раз выставил отметку (AR-89). */
  async teacherHasMarks(teacherId: string): Promise<boolean> {
    return (await this.prisma.mark.count({ where: { postedBy: teacherId } })) > 0;
  }

  /** Уроки с отметками — для `S-42.warn.detach` и правила `detach-marked`. */
  async lessonsWithMarks(lessonIds: string[]): Promise<Set<string>> {
    if (!lessonIds.length) return new Set();
    const rows = await this.prisma.mark.findMany({
      where: { lessonId: { in: lessonIds } },
      select: { lessonId: true },
      distinct: ['lessonId'],
    });
    return new Set(rows.map((r) => r.lessonId));
  }
}

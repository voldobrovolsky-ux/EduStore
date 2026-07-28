import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { newEvent } from '../../common/events/domain-event';
import {
  ENGINE_EVENTS,
  type AttendanceMarkedV1,
  type KppApprovedV1,
  type KppRevertedV1,
  type KppScheduledV1,
  type KtpApprovedV1,
  type KtpCreatedV1,
  type KtpGeneratedV1,
  type KtpRevertedV1,
  type LessonCompletedV1,
  type LessonPhaseChangedV1,
  type LessonReopenedV1,
  type LessonStartedV1,
  type TopicCompletedV1,
  type TopicProgressedV1,
} from './engine.contract';
import type { TextbookParsedV1 } from '../textbook/textbook.contract';
import type { EduLessonDto, KppDto, KtpDto, TimetableSlotInput } from '@edustore/shared';

// База термового календаря для раскладки уроков на даты (упрощение v1; реальный календарь
// слот→дата по неделям семестра — уточнение).
const TERM_START = new Date('2025-09-01T08:00:00Z');
const DAY_MS = 24 * 3600 * 1000;

// Оценка часов темы по числу карт парсера: fgosHours = max(1, ceil(карт/N)).
// N — конфиг (ENV KTP_CARDS_PER_HOUR), дефолт 5; тема без карт получает 1 час.
const CARDS_PER_HOUR = Math.max(1, Number(process.env.KTP_CARDS_PER_HOUR ?? 5) || 5);
const estimateHours = (cardCount: number) => Math.max(1, Math.ceil(cardCount / CARDS_PER_HOUR));

/**
 * Движок планирования — единственный писатель КТП/Timetable/КПП/Lesson (Архстандарт §8).
 * Пайплайн §7: ktp.approved → Solver (генерация КПП) → kpp.scheduled → kpp.approved → гейт урока.
 * Все запросы тенант-scoped (workspaceId из контекста); записи проставляют workspaceId явно.
 */
@Injectable()
export class EngineService {
  private readonly log = new Logger('EngineService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  // ─────────────── КТП ───────────────
  /** G-14: форма ответа — shared `KtpDto` (фронт `eduApi.ktpList` типизирован тем же). */
  async getKtp(classId?: string, disciplineId?: string): Promise<KtpDto[]> {
    const list = await this.prisma.ktp.findMany({
      where: { ...(classId && { classId }), ...(disciplineId && { disciplineId }) },
      include: { topics: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((k) => ({ ...k, createdAt: k.createdAt.toISOString() }));
  }

  /**
   * Ручное создание черновика КТП без учебника (остаток AR-38, FSM-дыра №9).
   * Завуч задаёт темы руками (hoursSource=null — это НЕ оценка парсера); черновик один на пару
   * (class, discipline) — при существующем draft → 409 (дополнять его правками тем, не плодить версии).
   */
  async createKtp(
    classId: string,
    disciplineId: string,
    topics: { title: string; fgosHours?: number }[],
    actor: string,
  ) {
    const ws = TenantContext.require();
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass) throw new NotFoundException('класс не найден');
    const disc = await this.prisma.subject.findUnique({ where: { id: disciplineId } });
    if (!disc) throw new NotFoundException('дисциплина не найдена');
    for (const t of topics) {
      if (!t.title?.trim()) throw new BadRequestException('тема без названия');
      if (t.fgosHours !== undefined && (!Number.isInteger(t.fgosHours) || t.fgosHours < 1)) {
        throw new BadRequestException('fgosHours — целое ≥ 1');
      }
    }
    const existing = await this.prisma.ktp.findFirst({ where: { classId, disciplineId, status: 'draft' } });
    if (existing) {
      throw new ConflictException({ code: 'KTP_DRAFT_EXISTS', ktpId: existing.id, message: 'черновик КТП уже есть — дополняйте его' });
    }
    return this.prisma.$transaction(async (tx) => {
      const ktp = await tx.ktp.create({
        data: {
          workspaceId: ws,
          classId,
          disciplineId,
          status: 'draft',
          topics: {
            create: topics.map((t, i) => ({
              workspaceId: ws,
              order: i + 1,
              title: t.title.trim(),
              fgosHours: t.fgosHours ?? 1,
              hoursSource: null, // ручной ввод завуча — не оценка парсера
              arCodes: [],
            })),
          },
        },
        include: { topics: { orderBy: { order: 'asc' } } },
      });
      await this.outbox.enqueue(
        tx,
        newEvent<KtpCreatedV1>({
          type: ENGINE_EVENTS.ktpCreated,
          workspaceId: ws,
          actor,
          payload: { ktpId: ktp.id, classId, disciplineId, topicCount: ktp.topics.length },
        }),
      );
      return ktp;
    });
  }

  /**
   * Обратный переход approved→draft (FSM-дыра №1). Допустим только пока производный план idle:
   * не-idle уроки → 409 KTP_IN_USE. Производный КПП (собранный по этой версии) сносится вместе
   * с idle-уроками — иначе остался бы план от уже не-утверждённого КТП.
   */
  async revertKtp(ktpId: string, actor: string) {
    const ktp = await this.prisma.ktp.findUnique({ where: { id: ktpId } });
    if (!ktp) throw new NotFoundException('КТП не найден');
    if (ktp.status !== 'approved') throw new ConflictException({ code: 'KTP_NOT_APPROVED', message: 'возврат возможен только из approved' });
    const inFlight = await this.prisma.lesson.count({
      where: { kppLesson: { kpp: { classId: ktp.classId, disciplineId: ktp.disciplineId } }, state: { not: 'idle' } },
    });
    if (inFlight > 0) {
      throw new ConflictException({ code: 'KTP_IN_USE', message: 'нельзя вернуть КТП в черновик: есть идущие/проведённые уроки' });
    }
    const ws = TenantContext.require();
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.kpp.findMany({
        where: { classId: ktp.classId, disciplineId: ktp.disciplineId },
        select: { lessons: { select: { id: true } } },
      });
      const oldKlIds = old.flatMap((k) => k.lessons.map((l) => l.id));
      if (oldKlIds.length) await tx.lesson.deleteMany({ where: { kppLessonId: { in: oldKlIds } } });
      const removed = await tx.kpp.deleteMany({ where: { classId: ktp.classId, disciplineId: ktp.disciplineId } });
      const updated = await tx.ktp.update({
        where: { id: ktpId },
        data: { status: 'draft', approvedBy: null },
        include: { topics: { orderBy: { order: 'asc' } } },
      });
      await this.outbox.enqueue(
        tx,
        newEvent<KtpRevertedV1>({
          type: ENGINE_EVENTS.ktpReverted,
          workspaceId: ws,
          actor,
          payload: { ktpId, classId: ktp.classId, disciplineId: ktp.disciplineId, kppsRemoved: removed.count },
        }),
      );
      return updated;
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

  /**
   * Автогенерация черновика КТП по textbook.parsed (движок — единственный писатель КТП, §8).
   * По materialId резолвит (disciplineId, classId) из Material; далее для пары (discipline, class):
   *  - нет КТП → создаёт draft; есть approved → создаёт НОВУЮ версию draft (утверждённая — рабочая,
   *    её не трогаем); есть draft → дополняет его.
   *  - дополнение идемпотентно: тема ищется по title (дубль не создаётся, карты прикрепляются),
   *    новая тема — в конец (order = max+1) с fgosHours-оценкой по числу карт и hoursSource='estimated'
   *    (в UI завуча видно, что это оценка парсера; ручная правка темы снимает флаг).
   * Всё в одной транзакции с эмиссией ktp.generated.
   */
  async generateKtpFromParsed(p: TextbookParsedV1): Promise<{ ktpId: string } | null> {
    const material = await this.prisma.material.findUnique({ where: { id: p.materialId } });
    if (!material) return null;
    if (!material.classId) {
      // материал без класса (старые загрузки/чужой поток) — КТП не к чему привязать, деградация
      this.log.warn(`ktp-gen: material=${p.materialId} без classId — пропуск`);
      return null;
    }
    const ws = TenantContext.require();
    const { classId, disciplineId } = { classId: material.classId, disciplineId: material.disciplineId };

    return this.prisma.$transaction(async (tx) => {
      const dbTopics = await tx.textbookTopic.findMany({ where: { materialId: material.id }, orderBy: { order: 'asc' } });
      const dbCards = await tx.textbookCard.findMany({ where: { materialId: material.id }, orderBy: { order: 'asc' } });
      const cardsByTopic = new Map<string, typeof dbCards>();
      for (const c of dbCards) {
        if (!c.topicId) continue; // карта вне тем — в КТП не попадает
        cardsByTopic.set(c.topicId, [...(cardsByTopic.get(c.topicId) ?? []), c]);
      }

      // черновик: есть → дополняем; нет (в т.ч. есть только approved) → новая draft-версия
      let ktp = await tx.ktp.findFirst({
        where: { classId, disciplineId, status: 'draft' },
        include: { topics: true },
        orderBy: { createdAt: 'desc' },
      });
      let created = false;
      if (!ktp) {
        ktp = { ...(await tx.ktp.create({ data: { workspaceId: ws, classId, disciplineId, status: 'draft' } })), topics: [] };
        created = true;
      }

      let maxOrder = ktp.topics.reduce((m, t) => Math.max(m, t.order), 0);
      let topicsAdded = 0;
      let cardsAttached = 0;
      for (const t of dbTopics) {
        const topicCards = cardsByTopic.get(t.id) ?? [];
        let target = ktp.topics.find((x) => x.title === t.title);
        if (!target) {
          target = await tx.ktpTopic.create({
            data: {
              workspaceId: ws,
              ktpId: ktp.id,
              order: ++maxOrder,
              title: t.title,
              fgosHours: estimateHours(topicCards.length),
              hoursSource: 'estimated',
              arCodes: [],
            },
          });
          ktp.topics.push(target);
          topicsAdded++;
        }
        // прикрепить карты к теме КТП (идемпотентно: повтор того же учебника ничего не меняет)
        const ids = topicCards.filter((c) => c.ktpTopicId !== target.id).map((c) => c.id);
        if (ids.length) {
          await tx.textbookCard.updateMany({ where: { id: { in: ids } }, data: { ktpTopicId: target.id } });
          cardsAttached += ids.length;
        }
      }

      if (created || topicsAdded > 0 || cardsAttached > 0) {
        await this.outbox.enqueue(
          tx,
          newEvent<KtpGeneratedV1>({
            type: ENGINE_EVENTS.ktpGenerated,
            workspaceId: ws,
            payload: { ktpId: ktp.id, classId, disciplineId, materialId: material.id, topicsAdded, cardsAttached },
          }),
        );
      }
      return { ktpId: ktp.id };
    });
  }

  /** Правка темы черновика (завуч перед утверждением): часы/название. Ручная правка снимает hoursSource. */
  async updateKtpTopic(topicId: string, input: { title?: string; fgosHours?: number }, actor: string) {
    const topic = await this.prisma.ktpTopic.findUnique({ where: { id: topicId }, include: { ktp: true } });
    if (!topic) throw new NotFoundException('тема КТП не найдена');
    if (topic.ktp.status !== 'draft') {
      throw new ConflictException({ code: 'KTP_NOT_DRAFT', message: 'править можно только черновик КТП' });
    }
    if (input.fgosHours !== undefined && (!Number.isInteger(input.fgosHours) || input.fgosHours < 1)) {
      throw new BadRequestException('fgosHours — целое ≥ 1');
    }
    const updated = await this.prisma.ktpTopic.update({
      where: { id: topicId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.fgosHours !== undefined ? { fgosHours: input.fgosHours } : {}),
        hoursSource: null, // тема отредактирована вручную — флаг «оценка парсера» снимается
      },
    });
    this.log.log(`КТП-тема ${topicId} отредактирована (${actor}) — hoursSource снят`);
    return updated;
  }

  /**
   * Наполнение уроков содержанием по kpp.approved: карты каждой темы распределяются по её урокам
   * равномерно (⌊C/L⌋ на урок, остаток — по одной в первые уроки), порядок карт — как у парсера.
   * Идемпотентно: повторный kpp.approved пересобирает связи без дублей.
   */
  async fillLessonContents(kppId: string): Promise<void> {
    const kpp = await this.prisma.kpp.findUnique({
      where: { id: kppId },
      include: { lessons: { orderBy: { sequenceNo: 'asc' } } },
    });
    if (!kpp || kpp.lessons.length === 0) return;
    const ws = TenantContext.require();
    const byTopic = new Map<string, typeof kpp.lessons>();
    for (const l of kpp.lessons) byTopic.set(l.topicId, [...(byTopic.get(l.topicId) ?? []), l]);

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonContent.deleteMany({ where: { kppLessonId: { in: kpp.lessons.map((l) => l.id) } } });
      let placed = 0;
      for (const [topicId, lessons] of byTopic) {
        const cards = await tx.textbookCard.findMany({
          where: { ktpTopicId: topicId },
          orderBy: [{ materialId: 'asc' }, { order: 'asc' }], // порядок парсера (внутри материала)
        });
        if (cards.length === 0) continue;
        const base = Math.floor(cards.length / lessons.length);
        const rem = cards.length % lessons.length;
        let idx = 0;
        for (let i = 0; i < lessons.length; i++) {
          const take = base + (i < rem ? 1 : 0);
          for (let k = 0; k < take; k++) {
            await tx.lessonContent.create({
              data: { workspaceId: ws, kppLessonId: lessons[i].id, cardId: cards[idx++].id, order: k + 1 },
            });
            placed++;
          }
        }
      }
      this.log.log(`КПП ${kppId}: карты разложены по урокам (${placed} связей)`);
    });
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

  /** G-14: форма ответа — shared `KppDto` (фронт `eduApi.kppList` типизирован тем же). */
  async getKpp(classId?: string, disciplineId?: string): Promise<KppDto[]> {
    const list = await this.prisma.kpp.findMany({
      where: { ...(classId && { classId }), ...(disciplineId && { disciplineId }) },
      include: { lessons: { orderBy: { sequenceNo: 'asc' }, include: { topic: true, mapping: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((k) => ({ ...k, createdAt: k.createdAt.toISOString() }));
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

  /**
   * Обратный переход approved→scheduled (FSM-дыра №1): закрывает гейт `lesson.start` обратно.
   * Допустим только при полностью idle-плане (не-idle уроки → 409 KPP_IN_USE).
   */
  async revertKpp(kppId: string, actor: string) {
    const kpp = await this.prisma.kpp.findUnique({ where: { id: kppId } });
    if (!kpp) throw new NotFoundException('КПП не найден');
    if (kpp.status !== 'approved') throw new ConflictException({ code: 'KPP_NOT_APPROVED', message: 'возврат возможен только из approved' });
    const inFlight = await this.prisma.lesson.count({
      where: { kppLesson: { kppId }, state: { not: 'idle' } },
    });
    if (inFlight > 0) {
      throw new ConflictException({ code: 'KPP_IN_USE', message: 'нельзя отозвать утверждение: есть идущие/проведённые уроки' });
    }
    const ws = TenantContext.require();
    await this.prisma.$transaction(async (tx) => {
      await tx.kpp.update({ where: { id: kppId }, data: { status: 'scheduled', approvedBy: null } });
      await this.outbox.enqueue(
        tx,
        newEvent<KppRevertedV1>({ type: ENGINE_EVENTS.kppReverted, workspaceId: ws, actor, payload: { kppId } }),
      );
    });
    return { id: kppId, status: 'scheduled' as const };
  }

  // ─────────────── Timetable ───────────────
  getTimetable(classId?: string) {
    return this.prisma.timetable.findMany({
      where: classId ? { classId } : {},
      include: { slots: { orderBy: [{ day: 'asc' }, { position: 'asc' }] } },
    });
  }

  /**
   * AR-38: авторинг сетки (типовая неделя) — завуч создаёт/заменяет сетку класса вручную.
   * Движок остаётся ЕДИНСТВЕННЫМ писателем Timetable. Будущее CP-SAT-авторасписание
   * заполняет ту же сетку тем же контрактом — экран завуча не меняется.
   */
  async upsertTimetable(classId: string, slots: TimetableSlotInput[], actor: string) {
    const ws = TenantContext.require();
    const klass = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!klass) throw new NotFoundException('класс не найден');
    for (const s of slots) {
      if (s.day < 1 || s.day > 7 || s.position < 1) {
        throw new ConflictException({ code: 'BAD_SLOT', message: `слот day=${s.day} position=${s.position} вне диапазона` });
      }
    }
    // защита от деструктива (аналог KPP_IN_USE): слоты существующей сетки уже держат
    // раскладку КПП → пересборка сетки снесла бы mappings под идущим планом
    const existing = await this.prisma.timetable.findMany({ where: { classId }, select: { id: true } });
    if (existing.length) {
      const mapped = await this.prisma.kppMapping.count({
        where: { timetableSlot: { timetableId: { in: existing.map((t) => t.id) } } },
      });
      if (mapped > 0) {
        throw new ConflictException({
          code: 'TIMETABLE_IN_USE',
          message: 'сетка уже держит раскладку КПП — сначала пересоберите/снимите КПП',
        });
      }
    }
    const lessonLen = (await this.prisma.orgStandards.findFirst())?.lessonLengthMin ?? 45;
    return this.prisma.$transaction(async (tx) => {
      await tx.timetable.deleteMany({ where: { classId } }); // слоты уходят каскадом
      const t = await tx.timetable.create({
        data: {
          workspaceId: ws,
          classId,
          source: 'zavuch-manual',
          approvedBy: actor,
          slots: {
            create: slots.map((s) => ({
              workspaceId: ws,
              day: s.day,
              position: s.position,
              durationMin: s.durationMin ?? lessonLen,
            })),
          },
        },
        include: { slots: { orderBy: [{ day: 'asc' }, { position: 'asc' }] } },
      });
      await this.outbox.enqueue(
        tx,
        newEvent({
          type: ENGINE_EVENTS.timetableUpdated,
          workspaceId: ws,
          actor,
          payload: { timetableId: t.id, classId, slots: t.slots.length },
        }),
      );
      return t;
    });
  }

  // ─────────────── Lesson FSM (гейт §7) ───────────────
  /** G-14: форма — расширение shared `EduLessonDetailDto` (фронт `eduApi.lesson` типизирован тем же). */
  async getLesson(id: string) {
    const l = await this.prisma.lesson.findUnique({
      where: { id },
      include: {
        kppLesson: {
          include: {
            kpp: true,
            topic: { select: { id: true, title: true, fgosHours: true, hoursSource: true } },
            contents: { orderBy: { order: 'asc' }, include: { card: { select: { id: true, title: true, content: true } } } },
          },
        },
      },
    });
    if (!l) throw new NotFoundException('урок не найден');
    // содержание урока: карты парсера, разложенные по kpp.approved (LessonContent)
    const contents = (l.kppLesson?.contents ?? []).map((c) => ({
      id: c.id,
      order: c.order,
      cardId: c.card.id,
      title: c.card.title,
      content: c.card.content,
    }));
    // G-14: форма ответа — расширение shared `EduLessonDetailDto` (даты — ISO, как на проводе)
    return { ...l, date: l.date.toISOString(), startGateOpen: l.kppLesson?.kpp.status === 'approved', contents };
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

  /** Конец урока теперь виден каскадам (FSM-дыра №2): событие в той же транзакции. */
  async completeLesson(id: string, teacherId: string) {
    const l = await this.prisma.lesson.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('урок не найден');
    if (l.state !== 'running') throw new BadRequestException('урок не идёт (state≠running)');
    const ws = TenantContext.require();
    await this.prisma.$transaction(async (tx) => {
      await tx.lesson.update({ where: { id }, data: { state: 'done' } });
      await this.outbox.enqueue(
        tx,
        newEvent<LessonCompletedV1>({
          type: ENGINE_EVENTS.lessonCompleted,
          workspaceId: ws,
          actor: teacherId,
          payload: { lessonId: id, classId: l.classId, disciplineId: l.subjectId },
        }),
      );
    });
    return { id, state: 'done' as const };
  }

  /**
   * Обратный переход done→running (FSM-дыра №1): учитель возобновляет завершённый урок
   * (ошибочное закрытие). Оценки/сигналы не трогаются; гейт КПП должен оставаться открытым.
   */
  async reopenLesson(id: string, teacherId: string) {
    const l = await this.prisma.lesson.findUnique({ where: { id }, include: { kppLesson: { include: { kpp: true } } } });
    if (!l) throw new NotFoundException('урок не найден');
    if (l.state !== 'done') throw new BadRequestException(`урок не завершён (state=${l.state})`);
    if (l.kppLesson?.kpp.status !== 'approved') {
      throw new ConflictException({ code: 'LESSON_LOCKED', message: 'возобновить урок можно только при утверждённом КПП' });
    }
    const ws = TenantContext.require();
    await this.prisma.$transaction(async (tx) => {
      await tx.lesson.update({ where: { id }, data: { state: 'running', teacherId } });
      await this.outbox.enqueue(
        tx,
        newEvent<LessonReopenedV1>({ type: ENGINE_EVENTS.lessonReopened, workspaceId: ws, actor: teacherId, payload: { lessonId: id } }),
      );
    });
    return { id, state: 'running' as const };
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
  /** G-14: форма ответа — shared `EduLessonDto` (фронт `eduApi.scheduleMe` типизирован тем же). */
  async scheduleMe(teacherId: string): Promise<EduLessonDto[]> {
    const assignments = await this.prisma.teachingAssignment.findMany({ where: { teacherId }, select: { classId: true } });
    const classIds = [...new Set(assignments.map((a) => a.classId))];
    const lessons = await this.prisma.lesson.findMany({
      where: { classId: { in: classIds } },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, topic: true, classId: true, subjectId: true, state: true },
    });
    return lessons.map((l) => ({ ...l, date: l.date.toISOString() }));
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

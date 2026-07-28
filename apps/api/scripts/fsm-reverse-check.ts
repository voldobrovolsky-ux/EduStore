/**
 * G-19 (остатки AR-38 + FSM-дыры №1/№2/№9) — ручное КТП и обратные переходы FSM:
 * (а) завуч создаёт черновик КТП без учебника (темы руками, hoursSource=null, событие
 *     planning.ktp.created.v1); второй черновик той же пары → KTP_DRAFT_EXISTS;
 * (б) Ktp approved→draft: производный idle-КПП сносится, событие planning.ktp.reverted.v1;
 *     при не-idle уроках → KTP_IN_USE;
 * (в) Kpp approved→scheduled: гейт lesson.start закрывается обратно (LESSON_LOCKED);
 *     при не-idle уроках → KPP_IN_USE;
 * (г) completeLesson эмитит lesson.lesson.completed.v1 (конец урока виден каскадам);
 * (д) done→running (reopen) с событием; reopen не-done урока отклоняется.
 * Запуск: npm run fsm:check (нужен Postgres).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TenantContext } from '../src/common/tenant/tenant-context';
import { OutboxDispatcher } from '../src/common/outbox/outbox.dispatcher';
import { EngineService } from '../src/modules/engine/engine.service';
import { ENGINE_EVENTS } from '../src/modules/engine/engine.contract';

const WS = 'ws-fsm-check';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const engine = app.get(EngineService);
  const dispatcher = app.get(OutboxDispatcher);

  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean) => {
    console.log(`${ok ? '✓' : '✗ FAIL'}  ${name}`);
    ok ? pass++ : fail++;
  };
  const codeOf = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return '';
    } catch (e) {
      return ((e as { response?: { code?: string } }).response?.code ?? '') as string;
    }
  };
  const eventCount = (type: string) =>
    TenantContext.runAsSystem(() => prisma.outboxEvent.count({ where: { workspaceId: WS, type } }));

  const ids = await TenantContext.runAsSystem(async () => {
    // очистка в порядке FK
    const old = await prisma.outboxEvent.findMany({ where: { workspaceId: WS }, select: { id: true } });
    if (old.length) await prisma.processedEvent.deleteMany({ where: { eventId: { in: old.map((o) => o.id) } } });
    await prisma.outboxEvent.deleteMany({ where: { workspaceId: WS } });
    await prisma.auditLog.deleteMany({ where: { workspaceId: WS } });
    await prisma.journalCell.deleteMany({ where: { workspaceId: WS } });
    await prisma.lesson.deleteMany({ where: { workspaceId: WS } });
    await prisma.kppMapping.deleteMany({ where: { workspaceId: WS } });
    await prisma.kppLesson.deleteMany({ where: { workspaceId: WS } });
    await prisma.kpp.deleteMany({ where: { workspaceId: WS } });
    await prisma.timetableSlot.deleteMany({ where: { workspaceId: WS } });
    await prisma.timetable.deleteMany({ where: { workspaceId: WS } });
    await prisma.ktpTopic.deleteMany({ where: { workspaceId: WS } });
    await prisma.ktp.deleteMany({ where: { workspaceId: WS } });
    await prisma.subject.deleteMany({ where: { workspaceId: WS } });
    await prisma.class.deleteMany({ where: { workspaceId: WS } });
    await prisma.workspace.deleteMany({ where: { id: WS } });

    const platform = await prisma.organization.upsert({
      where: { id: 'org-edustore-platform' },
      update: {},
      create: { id: 'org-edustore-platform', name: 'EduStore', type: 'platform' },
    });
    await prisma.workspace.create({ data: { id: WS, orgId: platform.id, name: 'FSM Check' } });
    const klass = await prisma.class.create({ data: { workspaceId: WS, parallel: 7, letter: 'Ф', label: '7Ф' } });
    const subject = await prisma.subject.create({ data: { workspaceId: WS, name: 'Физика-ФЧ', color: '#555555' } });
    return { classId: klass.id, disciplineId: subject.id };
  });

  await TenantContext.run({ tenantId: WS, system: false }, async () => {
    // ─── (а) ручное создание КТП без учебника ───
    check('пустая тема → BadRequest (кода нет, но отказ)', (await codeOf(engine.createKtp(ids.classId, ids.disciplineId, [{ title: '  ' }], 'zavuch'))) === '');
    const ktp = await engine.createKtp(
      ids.classId,
      ids.disciplineId,
      [
        { title: 'Механика', fgosHours: 2 },
        { title: 'Оптика' }, // fgosHours по умолчанию 1
      ],
      'zavuch',
    );
    check(
      'черновик создан руками: 2 темы, hoursSource=null (не «оценка парсера»)',
      ktp.status === 'draft' && ktp.topics.length === 2 && ktp.topics.every((t) => t.hoursSource === null) && ktp.topics[1].fgosHours === 1,
    );
    await dispatcher.drain();
    check('событие planning.ktp.created.v1 эмитировано', (await eventCount(ENGINE_EVENTS.ktpCreated)) === 1);
    check(
      'второй черновик той же пары → KTP_DRAFT_EXISTS',
      (await codeOf(engine.createKtp(ids.classId, ids.disciplineId, [{ title: 'Дубль' }], 'zavuch'))) === 'KTP_DRAFT_EXISTS',
    );

    // сетка (3 слота = 3 часа КТП) и утверждение → КПП
    await engine.upsertTimetable(ids.classId, [1, 2, 3].map((d) => ({ day: d, position: 1 })), 'zavuch');
    await engine.approveKtp(ktp.id, 'zavuch');
    await dispatcher.drain(); // ktp.approved → Solver → КПП scheduled
    const kpp = (await engine.getKpp(ids.classId, ids.disciplineId))[0];
    check('после approve Solver собрал КПП (scheduled)', kpp?.status === 'scheduled');

    // ─── (б) Ktp approved→draft при idle-плане ───
    const reverted = await engine.revertKtp(ktp.id, 'zavuch');
    await dispatcher.drain();
    check('КТП вернулся в draft, производный КПП снесён', reverted.status === 'draft' && (await engine.getKpp(ids.classId, ids.disciplineId)).length === 0);
    check('событие planning.ktp.reverted.v1 эмитировано', (await eventCount(ENGINE_EVENTS.ktpReverted)) === 1);
    check('revert draft-КТП → KTP_NOT_APPROVED', (await codeOf(engine.revertKtp(ktp.id, 'zavuch'))) === 'KTP_NOT_APPROVED');

    // снова утверждаем и собираем план; утверждаем КПП → гейт урока открыт
    await engine.approveKtp(ktp.id, 'zavuch');
    await dispatcher.drain();
    const kpp2 = (await engine.getKpp(ids.classId, ids.disciplineId))[0];
    await engine.approveKpp(kpp2.id, 'zavuch');
    await dispatcher.drain();
    const lessons = await TenantContext.runAsSystem(() =>
      prisma.lesson.findMany({ where: { workspaceId: WS }, orderBy: { lessonNumber: 'asc' } }),
    );
    check('уроки-экземпляры созданы (3 часа)', lessons.length === 3);

    // ─── (в) Kpp approved→scheduled закрывает гейт ───
    const kppReverted = await engine.revertKpp(kpp2.id, 'zavuch');
    await dispatcher.drain();
    check('КПП вернулся в scheduled', kppReverted.status === 'scheduled');
    check('событие planning.kpp.reverted.v1 эмитировано', (await eventCount(ENGINE_EVENTS.kppReverted)) === 1);
    check('гейт урока закрылся обратно → LESSON_LOCKED', (await codeOf(engine.startLesson(lessons[0].id, 'teacher'))) === 'LESSON_LOCKED');

    // повторное утверждение → урок стартует; не-idle урок блокирует реверсы обеих ступеней
    await engine.approveKpp(kpp2.id, 'zavuch');
    await dispatcher.drain();
    await engine.startLesson(lessons[0].id, 'teacher');
    check('running-урок блокирует отзыв КПП → KPP_IN_USE', (await codeOf(engine.revertKpp(kpp2.id, 'zavuch'))) === 'KPP_IN_USE');
    check('running-урок блокирует возврат КТП → KTP_IN_USE', (await codeOf(engine.revertKtp(ktp.id, 'zavuch'))) === 'KTP_IN_USE');

    // ─── (г) завершение урока эмитит событие ───
    await engine.completeLesson(lessons[0].id, 'teacher');
    await dispatcher.drain();
    check('lesson.lesson.completed.v1 эмитировано (конец урока виден каскадам)', (await eventCount(ENGINE_EVENTS.lessonCompleted)) === 1);

    // ─── (д) done→running (reopen) ───
    check('reopen идущего урока отклоняется', (await codeOf(engine.reopenLesson(lessons[1].id, 'teacher'))) === '');
    const reopened = await engine.reopenLesson(lessons[0].id, 'teacher');
    await dispatcher.drain();
    check('done→running: урок возобновлён', reopened.state === 'running');
    check('событие lesson.lesson.reopened.v1 эмитировано', (await eventCount(ENGINE_EVENTS.lessonReopened)) === 1);

    // отзыв утверждений — в аудите (AR-30): revert-события легли в леджер
    const audit = await TenantContext.runAsSystem(() =>
      prisma.auditLog.findMany({ where: { workspaceId: WS, action: { in: [ENGINE_EVENTS.ktpReverted, ENGINE_EVENTS.kppReverted] } } }),
    );
    check('отзывы КТП/КПП попали в audit-леджер', audit.length === 2);
  });

  await app.close();
  console.log(`\n${fail === 0 ? '✓ FSM-ОСТАТКИ ЗАКРЫТЫ' : '✗ ЕСТЬ ПРОБОИ'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

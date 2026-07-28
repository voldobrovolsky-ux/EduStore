/**
 * G-17 (AR-22, AR-24) — DLQ-replay: событие, добитое до FAILED, переигрывается командой;
 * повторная обработка идемпотентна (inbox `bus:<consumer>`).
 * Доказывает: (а) падение потребителя НЕ глотается — outbox ретраит и после MAX_ATTEMPTS
 * кладёт событие в DLQ (`FAILED`), ветка достижима; (б) успешный сосед-потребитель при
 * ретраях выполняется ровно один раз (шинная inbox-отметка); (в) `replayFailed` возвращает
 * событие в строй — доработает только падавший потребитель; (г) повторный replay и повторная
 * публикация — no-op (идемпотентность).
 * Запуск: npm run dlq:check (нужен Postgres).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { OutboxService } from '../src/common/outbox/outbox.service';
import { OutboxDispatcher } from '../src/common/outbox/outbox.dispatcher';
import { EventBus } from '../src/common/events/event-bus';
import { newEvent, type DomainEvent } from '../src/common/events/domain-event';
import { TenantContext } from '../src/common/tenant/tenant-context';

const WS = 'ws-dlq-check';
const EVENT_TYPE = 'gcheck.dlq.tested.v1'; // канон AR-23; домен gcheck — только для этой проверки

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const outbox = app.get(OutboxService);
  const dispatcher = app.get(OutboxDispatcher);
  const bus = app.get(EventBus);

  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean) => {
    console.log(`${ok ? '✓' : '✗ FAIL'}  ${name}`);
    ok ? pass++ : fail++;
  };

  // два потребителя: flaky падает, пока не «починят»; stable считает доставки
  const state = { flakyFails: true, flakyRuns: 0, stableRuns: 0 };
  bus.subscribe(EVENT_TYPE, 'g17-flaky', async () => {
    if (state.flakyFails) throw new Error('симуляция падения потребителя (G-17)');
    state.flakyRuns++;
  });
  bus.subscribe(EVENT_TYPE, 'g17-stable', async () => {
    state.stableRuns++;
  });

  const event = await TenantContext.runAsSystem(async () => {
    // чистый прогон: своя workspace + снос следов прошлых прогонов
    const old = await prisma.outboxEvent.findMany({ where: { workspaceId: WS }, select: { id: true } });
    if (old.length) {
      await prisma.processedEvent.deleteMany({ where: { eventId: { in: old.map((o) => o.id) } } });
      await prisma.outboxEvent.deleteMany({ where: { workspaceId: WS } });
    }
    const platform = await prisma.organization.upsert({
      where: { id: 'org-edustore-platform' },
      update: {},
      create: { id: 'org-edustore-platform', name: 'EduStore', type: 'platform' },
    });
    await prisma.workspace.upsert({
      where: { id: WS },
      update: {},
      create: { id: WS, orgId: platform.id, name: 'DLQ Check' },
    });
    const ev = newEvent({ type: EVENT_TYPE, workspaceId: WS, payload: { probe: 'g17' } });
    await prisma.$transaction((tx) => outbox.enqueue(tx, ev));
    return ev;
  });

  // (а) добиваем до DLQ: каждый dispatch — попытка; flaky падает → attempts++ → FAILED
  await dispatcher.drain();
  const row = await TenantContext.runAsSystem(() => prisma.outboxEvent.findUnique({ where: { id: event.id } }));
  check('событие добито до FAILED (DLQ достижим)', row?.status === 'FAILED');
  check('attempts = MAX (8)', row?.attempts === 8);
  // (б) сосед-потребитель не пострадал и выполнен ровно один раз, несмотря на 8 ретраев
  check('stable-потребитель выполнен ровно 1 раз (inbox отсёк ретраи)', state.stableRuns === 1);
  check('flaky не доработал ни разу', state.flakyRuns === 0);

  // (в) «чиним» потребителя и переигрываем DLQ командой
  state.flakyFails = false;
  const replayed = await dispatcher.replayFailed();
  const rowAfter = await TenantContext.runAsSystem(() => prisma.outboxEvent.findUnique({ where: { id: event.id } }));
  check('replayFailed нашёл событие и опубликовал (PUBLISHED)', replayed.found === 1 && rowAfter?.status === 'PUBLISHED');
  check('после replay доработал ТОЛЬКО падавший (flaky=1, stable=1)', state.flakyRuns === 1 && state.stableRuns === 1);

  // (г) идемпотентность: повторный replay — пусто; повторная публикация — оба отсечены inbox
  const replayAgain = await dispatcher.replayFailed();
  const redelivery: DomainEvent = { ...event };
  await bus.publish(redelivery);
  check(
    'повторный replay/publish — no-op (found=0, счётчики не выросли)',
    replayAgain.found === 0 && state.flakyRuns === 1 && state.stableRuns === 1,
  );

  await app.close();
  console.log(`\n${fail === 0 ? '✓ DLQ-REPLAY РАБОТАЕТ' : '✗ ЕСТЬ ПРОБОИ'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

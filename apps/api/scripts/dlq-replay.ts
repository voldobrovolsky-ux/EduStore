/**
 * Операторская команда DLQ-replay (G-17): показать события `FAILED` и вернуть их в строй.
 *   npm run dlq:replay              — переиграть весь DLQ
 *   npm run dlq:replay -- <id> ...  — переиграть только указанные события
 *   npm run dlq:replay -- --list    — только показать DLQ, ничего не переигрывать
 * Идемпотентность: успешные потребители отсечены inbox-отметкой `bus:<consumer>` —
 * доработает только падавший.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { OutboxDispatcher } from '../src/common/outbox/outbox.dispatcher';
import { TenantContext } from '../src/common/tenant/tenant-context';

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const ids = args.filter((a) => !a.startsWith('--'));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const prisma = app.get(PrismaService);
  const dispatcher = app.get(OutboxDispatcher);

  await TenantContext.runAsSystem(async () => {
    const failed = await prisma.outboxEvent.findMany({
      where: { status: 'FAILED', ...(ids.length ? { id: { in: ids } } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, workspaceId: true, attempts: true, createdAt: true },
    });
    if (failed.length === 0) {
      console.log('DLQ пуст — переигрывать нечего.');
      return;
    }
    console.log(`DLQ: ${failed.length} событий`);
    for (const f of failed) {
      console.log(`  ${f.id}  ${f.type}  ws=${f.workspaceId}  attempts=${f.attempts}  ${f.createdAt.toISOString()}`);
    }
    if (listOnly) return;

    const { found } = await dispatcher.replayFailed(ids.length ? ids : undefined);
    const still = await prisma.outboxEvent.count({ where: { status: 'FAILED', id: { in: failed.map((f) => f.id) } } });
    console.log(`\nпереиграно: ${found}; снова в DLQ: ${still}${still ? ' (потребитель всё ещё падает — смотрите логи)' : ''}`);
  });

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

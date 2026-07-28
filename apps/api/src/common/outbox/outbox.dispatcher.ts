import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBus } from '../events/event-bus';
import type { DomainEvent } from '../events/domain-event';

const MAX_ATTEMPTS = 8;

/**
 * Полит outbox и публикует PENDING-события в шину (at-least-once).
 * В проде запускается по интервалу/через CDC; здесь — вызывается явно
 * (drain) для синхронных сценариев и тестов каскада.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly log = new Logger('OutboxDispatcher');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventBus,
  ) {}

  /** Опубликовать одну пачку. Возвращает число обработанных строк. */
  async dispatchPending(batch = 100): Promise<number> {
    const rows = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: batch,
    });
    for (const r of rows) {
      const event: DomainEvent = {
        id: r.id,
        type: r.type,
        occurredAt: r.createdAt.toISOString(),
        workspaceId: r.workspaceId,
        correlationId: r.correlationId,
        causationId: r.causationId,
        depth: r.depth,
        actor: r.actor,
        payload: r.payload,
      };
      try {
        await this.bus.publish(event);
        await this.prisma.outboxEvent.update({
          where: { id: r.id },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
      } catch (err) {
        const attempts = r.attempts + 1;
        await this.prisma.outboxEvent.update({
          where: { id: r.id },
          data: { attempts, status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING' }, // FAILED = DLQ
        });
        this.log.error(`publish ${r.type} failed (попытка ${attempts}): ${(err as Error).message}`);
      }
    }
    return rows.length;
  }

  /** Дренировать весь накопленный каскад (несколько уровней depth). */
  async drain(maxRounds = 50): Promise<void> {
    for (let i = 0; i < maxRounds; i++) {
      if ((await this.dispatchPending()) === 0) return;
    }
    this.log.warn('drain: достигнут предел раундов — возможна петля или большой каскад');
  }

  /**
   * G-17: ручной replay DLQ — события `FAILED` возвращаются в `PENDING` (attempts=0) и
   * дренируются. Повторная обработка идемпотентна: успешные потребители отсечены
   * inbox-отметкой `bus:<consumer>` — доработает только тот, кто падал.
   */
  async replayFailed(ids?: string[]): Promise<{ found: number }> {
    const where = { status: 'FAILED' as const, ...(ids?.length ? { id: { in: ids } } : {}) };
    const rows = await this.prisma.outboxEvent.findMany({ where, select: { id: true, type: true } });
    if (rows.length === 0) return { found: 0 };
    for (const r of rows) this.log.log(`replay DLQ: ${r.type} (${r.id})`);
    await this.prisma.outboxEvent.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: 'PENDING', attempts: 0 } });
    await this.drain();
    return { found: rows.length };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxDispatcher } from './outbox.dispatcher';

/**
 * Durability-воркер outbox (§4.6). Inline-`drain()` в запросе — лишь latency-fast-path;
 * если процесс упал между commit транзакции и drain, PENDING-строки остаются висеть.
 * Этот фоновый тик их досылает, поэтому краш после commit НЕ теряет события каскада.
 *
 * Идемпотентность обеспечена слоем ниже: публикация двигает статус PENDING→PUBLISHED,
 * а потребители дедуплят по `id` через ProcessedEvent (inbox), так что повторный дренаж
 * не приводит к двойной обработке.
 */
@Injectable()
export class OutboxWorker {
  private readonly log = new Logger('OutboxWorker');
  private running = false; // тик мог прийти, пока идёт прошлый дренаж — не наслаиваем

  constructor(private readonly dispatcher: OutboxDispatcher) {}

  @Interval('outbox-drain', 2000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatcher.drain();
    } catch (err) {
      // дренаж устойчив к падению отдельного события (FAILED=DLQ внутри dispatchPending);
      // сюда долетает лишь сбой самого цикла (например, потеря соединения с БД) — лог и ждём след. тик.
      this.log.error(`фоновый дренаж прерван: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

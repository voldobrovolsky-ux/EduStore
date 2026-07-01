import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { newEvent } from '../../common/events/domain-event';
import { TEXTBOOK_EVENTS, type ParsedCard, type ParsedTopic, type TextbookParsedV1 } from './textbook.contract';

// Структурные маркеры учебника (реально встречаются в textExtract): темы и параграфы-карты.
const TOPIC_RE = /^(глава|тема|раздел)\s+\d+/i; // «Глава 1. Векторы», «Тема 3 …», «Раздел 2»
const CARD_RE = /^§\s*\d+/; // «§ 1. Понятие вектора»

interface ParsedInternal {
  topics: ParsedTopic[];
  cards: (ParsedCard & { content?: string })[];
}

/**
 * Детерминированный разбор textExtract на темы/карты по структурным маркерам.
 *
 * TODO(parser): здесь позже встанет РЕАЛЬНЫЙ классификатор (DeepSeek/YandexGPT) — семантическая
 * сегментация на темы/карты + сопоставление с ФГОС АР-кодами. Сейчас 0 ИИ (как договорено для всех
 * парсинг-стабов на этом этапе): чистое правило по заголовкам, без вызова моделей. OCR НЕ повторяется —
 * textExtract переиспользуется из doc.file.enriched (единственный OCR — в хранилище).
 */
export function parseTextExtract(text: string): ParsedInternal {
  const topics: ParsedTopic[] = [];
  const cards: (ParsedCard & { content?: string })[] = [];
  let curTopicOrder: number | undefined;
  let curCard: (ParsedCard & { content?: string }) | null = null;
  const flush = () => {
    if (curCard) {
      cards.push(curCard);
      curCard = null;
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (TOPIC_RE.test(line)) {
      flush();
      const order = topics.length + 1;
      topics.push({ order, title: line });
      curTopicOrder = order;
    } else if (CARD_RE.test(line)) {
      flush();
      curCard = { order: cards.length + 1, title: line, topicOrder: curTopicOrder };
    } else if (curCard) {
      curCard.content = curCard.content ? `${curCard.content}\n${line}` : line;
    }
  }
  flush();
  return { topics, cards };
}

/**
 * Парсер учебников. Подписан на doc.file.enriched (см. parser.handlers) — по приходу резолвит
 * Material по fileId, переиспользует textExtract, детерминированно разбирает на темы/карты
 * (кабинетная сущность), эмитит textbook.parsed{materialId, fileId, cards, topics}. Идемпотентен.
 */
@Injectable()
export class ParserService {
  private readonly log = new Logger('ParserService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Разбор по событию обогащения. Событие не про учебник (нет Material с этим fileId) → тихо
   * игнорируем (не ошибка). Пустой textExtract / файл не обогащён → деградация (не запускаемся,
   * материал остаётся без тем/карт до реального doc.file.enriched). Повторный вызов — no-op.
   */
  async parseFromEnriched(fileId: string, textExtractFromEvent: string | null): Promise<void> {
    const material = await this.prisma.material.findUnique({ where: { fileId } });
    if (!material) return; // не учебник — тихо игнорируем

    const already =
      (await this.prisma.textbookTopic.count({ where: { materialId: material.id } })) +
      (await this.prisma.textbookCard.count({ where: { materialId: material.id } }));
    if (already > 0) return; // уже разобран (идемпотентность на переигровку события)

    // переиспользуем textExtract: из события, иначе из строки File (обогащение хранилища)
    let text = textExtractFromEvent;
    if (!text || !text.trim()) {
      const file = await this.prisma.file.findUnique({ where: { id: fileId }, select: { textExtract: true } });
      text = file?.textExtract ?? null;
    }
    if (!text || !text.trim()) {
      this.log.debug(`fileId=${fileId}: пустой textExtract — парсер не запускается (деградация)`);
      return; // не гадаем по пустому тексту
    }

    const parsed = parseTextExtract(text);
    if (parsed.topics.length === 0 && parsed.cards.length === 0) {
      this.log.debug(`fileId=${fileId}: структура не распознана — тем/карт нет`);
      return;
    }

    const topics: ParsedTopic[] = parsed.topics.map((t) => ({ order: t.order, title: t.title }));
    const cards: ParsedCard[] = parsed.cards.map((c) => ({ order: c.order, title: c.title, topicOrder: c.topicOrder }));

    // темы+карты и событие — атомарно (transactional outbox): либо всё, либо ничего
    await this.prisma.$transaction(async (tx) => {
      const topicIdByOrder = new Map<number, string>();
      for (const t of parsed.topics) {
        const row = await tx.textbookTopic.create({
          data: { workspaceId: material.workspaceId, materialId: material.id, fileId, order: t.order, title: t.title },
        });
        topicIdByOrder.set(t.order, row.id);
      }
      for (const c of parsed.cards) {
        await tx.textbookCard.create({
          data: {
            workspaceId: material.workspaceId,
            materialId: material.id,
            fileId,
            topicId: c.topicOrder ? topicIdByOrder.get(c.topicOrder) ?? null : null,
            order: c.order,
            title: c.title,
            content: c.content ?? null,
          },
        });
      }
      await this.outbox.enqueue(
        tx,
        newEvent<TextbookParsedV1>({
          type: TEXTBOOK_EVENTS.parsed,
          workspaceId: material.workspaceId,
          payload: { materialId: material.id, fileId, cards, topics },
        }),
      );
    });
    this.log.log(`fileId=${fileId}: разобрано тем=${topics.length}, карт=${cards.length} → textbook.parsed`);
  }

  /** Чтение разбора (для UI/e2e): темы+карты материала по fileId. */
  async getParsed(fileId: string) {
    const material = await this.prisma.material.findUnique({ where: { fileId } });
    if (!material) return { materialId: null, fileId, topics: [], cards: [] };
    const [topics, cards] = await Promise.all([
      this.prisma.textbookTopic.findMany({ where: { materialId: material.id }, orderBy: { order: 'asc' } }),
      this.prisma.textbookCard.findMany({ where: { materialId: material.id }, orderBy: { order: 'asc' } }),
    ]);
    return { materialId: material.id, fileId, topics, cards };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { newEvent } from '../../common/events/domain-event';
import { DocService } from '../doc/doc.service';
import { TEXTBOOK_EVENTS, type TextbookUploadedV1 } from './textbook.contract';

/**
 * Учебники поверх Документохранилища: загрузка учебника учителем идёт через управляемый docs/-контур
 * (doc-абстракция, S3 только там). upload-init → commit создаёт Material{fileId, disciplineId} и эмитит
 * textbook.uploaded. Дальше хранилище асинхронно обогащает файл (raw→enriched) → парсер (parser.service).
 */
@Injectable()
export class MaterialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly doc: DocService,
  ) {}

  /** Инициация загрузки: pre-signed PUT в docs/ (через doc-абстракцию). disciplineId обязателен (учебник). */
  async uploadInit(input: { mime: string; disciplineId: string }, ownerId: string) {
    if (!input.disciplineId) throw new BadRequestException('disciplineId обязателен для учебника');
    // scope=школа: учебник — общий ресурс школы, не личный файл. S3 не сконфигурирован → doc отдаёт 503.
    return this.doc.uploadUrl({ mime: input.mime, scope: 'школа', disciplineId: input.disciplineId }, ownerId);
  }

  /**
   * Подтверждение загрузки: doc.commit валидирует объект в S3 (HEAD→raw→doc.file.created), затем заводим
   * Material и эмитим textbook.uploaded. Идемпотентно по fileId (@unique): повтор — без дубля и без события.
   */
  async commit(fileId: string, actor: string) {
    const committed = await this.doc.commit(fileId); // 409 NO_OBJECT если PUT не выполнен; 503 если S3 не готов
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('файл не найден');
    if (!file.disciplineId) throw new BadRequestException('у файла нет disciplineId — не учебник');
    const ws = TenantContext.require();

    const existing = await this.prisma.material.findUnique({ where: { fileId } });
    const material =
      existing ??
      (await this.prisma.material.create({
        data: { workspaceId: ws, fileId, disciplineId: file.disciplineId, uploadedBy: actor },
      }));
    if (!existing) {
      await this.prisma.$transaction((tx) =>
        this.outbox.enqueue(
          tx,
          newEvent<TextbookUploadedV1>({
            type: TEXTBOOK_EVENTS.uploaded,
            workspaceId: ws,
            actor,
            payload: { materialId: material.id, disciplineId: material.disciplineId, fileId },
          }),
        ),
      );
    }
    return { materialId: material.id, fileId, disciplineId: material.disciplineId, state: committed.state };
  }
}

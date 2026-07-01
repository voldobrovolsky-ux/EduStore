import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { DocModule } from '../doc/doc.module';
import { MaterialService } from './material.service';
import { ParserService } from './parser.service';
import { ParserHandlers } from './parser.handlers';
import { TextbookController } from './textbook.controller';

// Учебники + парсер (Phase 1): загрузка учебника поверх Документохранилища (DocModule) + разбор
// textExtract на темы/карты по doc.file.enriched → textbook.parsed. Outbox/EventBus — из EventsModule.
@Module({
  imports: [PrismaModule, DocModule],
  controllers: [TextbookController],
  providers: [MaterialService, ParserService, ParserHandlers],
  exports: [MaterialService, ParserService],
})
export class TextbookModule {}

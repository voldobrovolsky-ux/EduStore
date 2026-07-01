import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { GraphService } from './graph.service';
import { ChannelService } from './channel.service';
import { ParenthoodSync } from './parenthood.sync';
import { CommController } from './comm.controller';

// Communitoria (Phase 1) — чанк 1: граф контактов + инварианты безопасности миноров. Контур comm/
// изолирован от Документохранилища. ParenthoodSync — зеркало директории Флёруса (единственный
// писатель рёбер). Каналы/сообщения (чанк 2) и звонки (чанк 3) встают поверх этого фундамента.
@Module({
  imports: [PrismaModule],
  controllers: [CommController],
  providers: [GraphService, ChannelService, ParenthoodSync],
  exports: [GraphService, ChannelService, ParenthoodSync],
})
export class CommModule {}

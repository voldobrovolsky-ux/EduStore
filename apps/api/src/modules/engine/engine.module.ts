import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EngineService } from './engine.service';
import { EngineController } from './engine.controller';
import { EngineHandlers } from './engine.handlers';

// Движок планирования (Phase 1): КТП/Timetable/КПП Solver + Lesson FSM (Архстандарт §7/§8).
// OutboxService/EventBus/Dispatcher — из глобального EventsModule.
@Module({
  imports: [PrismaModule],
  controllers: [EngineController],
  providers: [EngineService, EngineHandlers],
})
export class EngineModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EngineService } from './engine.service';
import { EngineController } from './engine.controller';
import { EngineHandlers } from './engine.handlers';
import { IomService } from './iom.service';
import { IomHandlers } from './iom.handlers';

// Движок планирования + ИОМ (Phase 1): КТП/Timetable/КПП Solver + Lesson FSM + ИОМ-аккумулятор
// (Архстандарт §7/§8). OutboxService/EventBus/Dispatcher — из глобального EventsModule.
@Module({
  imports: [PrismaModule],
  controllers: [EngineController],
  providers: [EngineService, EngineHandlers, IomService, IomHandlers],
})
export class EngineModule {}

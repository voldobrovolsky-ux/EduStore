import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EngineService } from './engine.service';
import { EngineController } from './engine.controller';
import { EngineHandlers } from './engine.handlers';
import { IomService } from './iom.service';
import { IomHandlers } from './iom.handlers';
import { AssessmentService } from './assessment.service';

// Движок планирования + ИОМ + летучка (Phase 1): КТП/Timetable/КПП Solver + Lesson FSM +
// ИОМ-аккумулятор + петля летучки (Архстандарт §7/§8). Шина/outbox — из глобального EventsModule.
@Module({
  imports: [PrismaModule],
  controllers: [EngineController],
  providers: [EngineService, EngineHandlers, IomService, IomHandlers, AssessmentService],
})
export class EngineModule {}

import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '../../common/auth/flor.service';
import { OutboxDispatcher } from '../../common/outbox/outbox.dispatcher';
import { EngineService } from './engine.service';

interface GenerateBody { classId: string; disciplineId: string }
interface PhaseBody { phase: string }

// Движок планирования — /api/v1/edu/* (Архстандарт §2; глобальный префикс api → путь v1/edu).
@Controller('v1/edu')
export class EngineController {
  constructor(
    private readonly engine: EngineService,
    private readonly dispatcher: OutboxDispatcher,
  ) {}

  private actor(req: Request & { user?: SessionUser }): string {
    return req.user?.florusUserId ?? 'system';
  }

  // ─── КТП ───
  @Get('ktp')
  getKtp(@Query('classId') classId?: string, @Query('disciplineId') disciplineId?: string) {
    return this.engine.getKtp(classId, disciplineId);
  }

  /** Завуч утверждает КТП → ktp.approved → (inline) Solver раскладывает КПП (§7). */
  @Post('ktp/:id/approve')
  async approveKtp(@Param('id') id: string, @Req() req: Request & { user?: SessionUser }) {
    const res = await this.engine.approveKtp(id, this.actor(req));
    await this.dispatcher.drain(); // прогнать пайплайн: ktp.approved → генерация КПП
    return res;
  }

  // ─── КПП ───
  @Get('kpp')
  getKpp(@Query('classId') classId?: string, @Query('disciplineId') disciplineId?: string) {
    return this.engine.getKpp(classId, disciplineId);
  }

  /** Внутренняя генерация (Solver); пайплайн делегирует сюда по ktp.approved. */
  @Post('kpp/generate')
  generateKpp(@Body() body: GenerateBody) {
    return this.engine.generateKpp(body.classId, body.disciplineId);
  }

  @Post('kpp/:id/approve')
  async approveKpp(@Param('id') id: string, @Req() req: Request & { user?: SessionUser }) {
    const res = await this.engine.approveKpp(id, this.actor(req));
    await this.dispatcher.drain();
    return res;
  }

  // ─── Timetable ───
  @Get('timetable')
  getTimetable(@Query('classId') classId?: string) {
    return this.engine.getTimetable(classId);
  }

  // ─── Lesson FSM ───
  @Get('lessons/:id')
  getLesson(@Param('id') id: string) {
    return this.engine.getLesson(id);
  }

  @Post('lessons/:id/start')
  async start(@Param('id') id: string, @Req() req: Request & { user?: SessionUser }) {
    const res = await this.engine.startLesson(id, this.actor(req));
    await this.dispatcher.drain();
    return res;
  }

  @Post('lessons/:id/phase')
  setPhase(@Param('id') id: string, @Body() body: PhaseBody, @Req() req: Request & { user?: SessionUser }) {
    return this.engine.setPhase(id, body.phase, this.actor(req));
  }

  @Post('lessons/:id/complete')
  complete(@Param('id') id: string) {
    return this.engine.completeLesson(id);
  }
}

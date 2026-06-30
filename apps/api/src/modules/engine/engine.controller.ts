import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '../../common/auth/flor.service';
import { OutboxDispatcher } from '../../common/outbox/outbox.dispatcher';
import { RequirePermission } from '../../common/authz/require-permission.decorator';
import { EngineService } from './engine.service';
import { IomService } from './iom.service';

interface GenerateBody { classId: string; disciplineId: string }
interface PhaseBody { phase: string }
interface AttendanceBody { marks: { studentId: string; status: string; arrivalTime?: string }[] }
interface TopicProgressBody { topicId: string; timeSpent: number }
interface TopicCompleteBody { topicId: string }

// Движок планирования — /api/v1/edu/* (Архстандарт §2; глобальный префикс api → путь v1/edu).
@Controller('v1/edu')
export class EngineController {
  constructor(
    private readonly engine: EngineService,
    private readonly iom: IomService,
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
  @RequirePermission('planning.ktp.approve')
  @Post('ktp/:id/approve')
  async approveKtp(@Param('id') id: string, @Req() req: Request & { user?: SessionUser }) {
    const res = await this.engine.approveKtp(id, this.actor(req));
    await this.dispatcher.drain(); // прогнать пайплайн: ktp.approved → генерация КПП
    // вернуть исход генерации (Solver может упасть на нехватке слотов — ошибка в логах,
    // здесь видно, собрался ли КПП); kpp=null → генерация не дала плана.
    const kpps = await this.engine.getKpp(res.classId, res.disciplineId);
    const kpp = kpps[0];
    return {
      id: res.id,
      status: res.status,
      kpp: kpp ? { id: kpp.id, status: kpp.status, lessonCount: kpp.lessons.length } : null,
    };
  }

  // ─── КПП ───
  @Get('kpp')
  getKpp(@Query('classId') classId?: string, @Query('disciplineId') disciplineId?: string) {
    return this.engine.getKpp(classId, disciplineId);
  }

  /** Внутренняя генерация (Solver); пайплайн делегирует сюда по ktp.approved. */
  @RequirePermission('planning.kpp.approve')
  @Post('kpp/generate')
  generateKpp(@Body() body: GenerateBody) {
    return this.engine.generateKpp(body.classId, body.disciplineId);
  }

  @RequirePermission('planning.kpp.approve')
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

  @RequirePermission('lesson.conduct')
  @Post('lessons/:id/start')
  async start(@Param('id') id: string, @Req() req: Request & { user?: SessionUser }) {
    const res = await this.engine.startLesson(id, this.actor(req));
    await this.dispatcher.drain();
    return res;
  }

  @RequirePermission('lesson.conduct')
  @Post('lessons/:id/phase')
  setPhase(@Param('id') id: string, @Body() body: PhaseBody, @Req() req: Request & { user?: SessionUser }) {
    return this.engine.setPhase(id, body.phase, this.actor(req));
  }

  @RequirePermission('lesson.conduct')
  @Post('lessons/:id/complete')
  complete(@Param('id') id: string) {
    return this.engine.completeLesson(id);
  }

  // ─── Сигналы урока → ИОМ (inline-дренаж → аккумулятор обновляется сразу) ───
  @RequirePermission('lesson.conduct')
  @Post('lessons/:id/attendance')
  async attendance(@Param('id') id: string, @Body() body: AttendanceBody, @Req() req: Request & { user?: SessionUser }) {
    const res = await this.engine.markAttendance(id, body.marks, this.actor(req));
    await this.dispatcher.drain();
    return res;
  }

  @RequirePermission('lesson.conduct')
  @Post('lessons/:id/topic-progress')
  async topicProgress(@Param('id') id: string, @Body() body: TopicProgressBody, @Req() req: Request & { user?: SessionUser }) {
    const res = await this.engine.topicProgress(id, body.topicId, body.timeSpent, this.actor(req));
    await this.dispatcher.drain();
    return res;
  }

  @RequirePermission('lesson.conduct')
  @Post('lessons/:id/topic-complete')
  async topicComplete(@Param('id') id: string, @Body() body: TopicCompleteBody, @Req() req: Request & { user?: SessionUser }) {
    const res = await this.engine.topicComplete(id, body.topicId, this.actor(req));
    await this.dispatcher.drain();
    return res;
  }

  // ─── ИОМ-срез (UI учителя — реальные имена) ───
  @Get('iom/:studentId')
  getIom(@Param('studentId') studentId: string) {
    return this.iom.getIom(studentId);
  }
}

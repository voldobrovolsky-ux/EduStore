import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from './public.decorator';
import { FlorService, type SessionUser } from './flor.service';
import { DEFAULT_TEACHER_ID } from './dev-auth.guard';

/**
 * Единый guard: сессия Флёруса (cookie flor_sid) → request.user.
 * Публичные маршруты (login/callback/backchannel) пропускаются.
 * DEV-bypass (AUTH_MODE != production): x-florus-user-id или засеянный учитель —
 * чтобы локальная разработка/тесты работали до настройки Флёруса на сервере.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flor: FlorService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: SessionUser; teacherId?: string }>();

    const sid = req.cookies?.flor_sid as string | undefined;
    if (sid) {
      const session = await this.flor.getSession(sid);
      if (session) {
        req.user = session;
        req.teacherId = session.florusUserId; // совместимость с @CurrentTeacher
        return true;
      }
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    // DEV-bypass по x-florus-* — ТОЛЬКО для CI/e2e. В pilot-qr (и production) он ВЫКЛЮЧЕН: там доступ
    // только по реальной сессии (пилотный QR-вход выдаёт её), чтобы два режима не смешивались.
    if (process.env.AUTH_MODE !== 'production' && process.env.AUTH_MODE !== 'pilot-qr') {
      const header = req.headers['x-florus-user-id'];
      const uid = (Array.isArray(header) ? header[0] : header)?.trim() || DEFAULT_TEACHER_ID;
      // DEV: x-florus-role / x-florus-subrole переопределяют доменную роль — чтобы тестировать
      // RBAC-гейтинг под разными ролями (завуч approve, учитель conduct) без живого Флёра.
      const hdr = (k: string) => {
        const v = req.headers[k];
        return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
      };
      req.teacherId = uid;
      req.user = {
        florusUserId: uid,
        workspaceId: null,
        florusWorkspaceId: null,
        florusOrgId: null,
        role: hdr('x-florus-role') ?? 'teacher',
        subRole: hdr('x-florus-subrole') ?? null,
        name: 'Анна Соколова',
      };
      return true;
    }

    return false; // production + нет сессии + не public → 403
  }
}

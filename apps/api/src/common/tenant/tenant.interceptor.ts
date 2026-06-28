import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, Subscription } from 'rxjs';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext, type TenantStore } from './tenant-context';
import type { SessionUser } from '../auth/flor.service';

/**
 * Глобальный интерсептор (§3.6): кладёт tenant-контекст запроса в ALS, чтобы tenant-guard
 * фильтровал каждый запрос доменных моделей внутри обработчика.
 *
 * Активный тенант: из сессии (req.user.orgId). В DEV/без активного контекста выводится из
 * directory по florus_user_id. Публичные/неаутентифицированные маршруты (login/callback/
 * backchannel) идут без user → системный контекст (там работает OIDC-провижининг).
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    return from(this.resolveStore(req)).pipe(
      switchMap(
        (store) =>
          new Observable((subscriber) => {
            let sub: Subscription | undefined;
            // подписка на обработчик происходит ВНУТРИ ALS-контекста → его await'ы
            // (и Prisma-вызовы) наследуют тенант.
            TenantContext.run(store, () => {
              sub = next.handle().subscribe(subscriber);
            });
            return () => sub?.unsubscribe();
          }),
      ),
    );
  }

  private async resolveStore(req: Request & { user?: SessionUser }): Promise<TenantStore> {
    const user = req.user;
    if (!user) return { tenantId: null, system: true }; // публичный маршрут → система
    if (user.orgId) return { tenantId: user.orgId, system: false };
    // сессия без активного org или DEV-bypass: вывести тенант из directory
    const tenantId = await this.resolveTenantForUser(user.florusUserId);
    if (tenantId) return { tenantId, system: false };
    return { tenantId: null, system: true }; // не привязан ни к одной орг (owner до выбора)
  }

  // Membership вне изоляции; Teacher — fallback для DEV-учителя (guarded, потому system).
  private resolveTenantForUser(florusUserId: string): Promise<string | null> {
    return TenantContext.runAsSystem(async () => {
      const m = await this.prisma.membership.findFirst({
        where: { florusUserId },
        select: { orgId: true },
      });
      if (m) return m.orgId;
      const t = await this.prisma.teacher.findUnique({
        where: { id: florusUserId },
        select: { organizationId: true },
      });
      return t?.organizationId ?? null;
    });
  }
}

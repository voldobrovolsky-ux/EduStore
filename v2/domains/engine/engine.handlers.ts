import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../../common/events/event-bus';
import { TenantContext } from '../../common/tenant/tenant-context';
import { type DomainEvent } from '../../common/events/domain-event';
import { ENGINE_EVENTS, type KtpApprovedV1 } from './engine.contract';
import { EngineService } from './engine.service';

/**
 * Пайплайн §7: ktp.approved → Solver раскладывает КПП → kpp.scheduled.
 * Идемпотентность — через регенерацию в generateKpp (повтор события пересобирает КПП),
 * поэтому inbox-дедуп не нужен (и не оборачиваем в чужую транзакцию).
 */
@Injectable()
export class EngineHandlers implements OnModuleInit {
  private readonly log = new Logger('engine');

  constructor(
    private readonly bus: EventBus,
    private readonly engine: EngineService,
  ) {}

  onModuleInit() {
    this.bus.subscribe(ENGINE_EVENTS.ktpApproved, 'engine-solver', (e) => this.onKtpApproved(e));
  }

  private async onKtpApproved(e: DomainEvent) {
    const p = e.payload as KtpApprovedV1;
    // тенант-контекст события (работает и в inline-, и в фоновом дренаже)
    await TenantContext.run({ tenantId: e.workspaceId, system: false }, async () => {
      const kpp = await this.engine.generateKpp(p.classId, p.disciplineId);
      this.log.log(`КПП ${kpp.id} сгенерирован по ktp.approved (${kpp.lessonCount} уроков)`);
    });
  }
}

import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './common/auth/auth.module';
import { AuthGuard } from './common/auth/auth.guard';
import { TenantInterceptor } from './common/tenant/tenant.interceptor';
import { AuthzModule } from './common/authz/authz.module';
import { EventsModule } from './common/events/events.module';
import { TeacherModule } from './modules/teacher/teacher.module';
import { PlanningModule } from './modules/planning/planning.module';
import { JournalModule } from './modules/journal/journal.module';
import { VoiceModule } from './modules/voice/voice.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { NotesModule } from './modules/notes/notes.module';
import { ReportsModule } from './modules/reports/reports.module';
import { StructureModule } from './modules/structure/structure.module';
import { DeviceModule } from './modules/oidc-device/device.module';
import { ConsentModule } from './modules/consent/consent.module';
// Параметры (система параметров EduStore, см. docs/PARAMETERS.md). Новый параметр = одна строка.
import { ContingentModule } from './parameters/contingent/contingent.module';
import { CommsModule } from './parameters/comms/comms.module';
import { NutritionModule } from './parameters/nutrition/nutrition.module';
import { UmkParamModule } from './parameters/umk-param/umk-param.module';
import { ComplianceModule } from './parameters/compliance/compliance.module';

/**
 * Сборка модульного монолита: глобальный доступ к БД + событийный kernel +
 * доменные модули (кабинет) + параметры. Новый домен/параметр = одна строка здесь.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(), // §4.6: планировщик для фонового диспетчера outbox
    PrismaModule,
    AuthModule, // Флёрус OIDC RP (ADR-0005)
    AuthzModule, // §5.1: права как данные (каталог + резолвер доступа)
    EventsModule, // event bus + transactional outbox + idempotent inbox + durability-воркер (shared kernel)
    // кабинет учителя (поверхность параметра УМК)
    TeacherModule,
    PlanningModule,
    JournalModule,
    VoiceModule,
    MaterialsModule,
    NotesModule,
    ReportsModule,
    StructureModule, // ручное создание структуры школы (онбординг 4.2/6)
    DeviceModule, // привязка устройств + вход на киоске (главная, режимы 2/3)
    ConsentModule, // §6: согласие на обработку ПДн (152-ФЗ)
    // параметры
    ContingentModule,
    CommsModule,
    NutritionModule,
    UmkParamModule,
    ComplianceModule, // §6.4: реакция на запрос удаления ПДн
  ],
  providers: [
    // Единый guard: сессия Флёруса или DEV-bypass (AUTH_MODE != production).
    { provide: APP_GUARD, useClass: AuthGuard },
    // §3.6: tenant-контекст запроса в ALS (после guard, до обработчика) → изоляция тенанта.
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}

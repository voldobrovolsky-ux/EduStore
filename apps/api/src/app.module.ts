import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './common/auth/auth.module';
import { AuthGuard } from './common/auth/auth.guard';
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
// Параметры (система параметров EduStore, см. docs/PARAMETERS.md). Новый параметр = одна строка.
import { ContingentModule } from './parameters/contingent/contingent.module';
import { CommsModule } from './parameters/comms/comms.module';
import { NutritionModule } from './parameters/nutrition/nutrition.module';
import { UmkParamModule } from './parameters/umk-param/umk-param.module';

/**
 * Сборка модульного монолита: глобальный доступ к БД + событийный kernel +
 * доменные модули (кабинет) + параметры. Новый домен/параметр = одна строка здесь.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule, // Флёрус OIDC RP (ADR-0005)
    EventsModule, // event bus + transactional outbox + idempotent inbox (shared kernel)
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
    // параметры
    ContingentModule,
    CommsModule,
    NutritionModule,
    UmkParamModule,
  ],
  providers: [
    // Единый guard: сессия Флёруса или DEV-bypass (AUTH_MODE != production).
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}

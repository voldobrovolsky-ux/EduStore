import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { DevAuthGuard } from './common/auth/dev-auth.guard';
import { TeacherModule } from './modules/teacher/teacher.module';
import { PlanningModule } from './modules/planning/planning.module';
import { JournalModule } from './modules/journal/journal.module';
import { VoiceModule } from './modules/voice/voice.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { NotesModule } from './modules/notes/notes.module';
import { ReportsModule } from './modules/reports/reports.module';

/**
 * Сборка модульного монолита: глобальный доступ к БД + доменные модули.
 * Новый домен = одна строка здесь (см. ARCHITECTURE.md).
 */
@Module({
  imports: [
    PrismaModule,
    TeacherModule,
    PlanningModule,
    JournalModule,
    VoiceModule,
    MaterialsModule,
    NotesModule,
    ReportsModule,
  ],
  providers: [
    // DEV-аутентификация (Flōrus SSO заглушка) — проставляет teacherId в request.
    { provide: APP_GUARD, useClass: DevAuthGuard },
  ],
})
export class AppModule {}

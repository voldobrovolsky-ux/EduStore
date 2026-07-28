import { PrismaClient } from '@prisma/client';

/**
 * Канонический каталог прав (§5.1) — Раздел→Экран→Действие + пакеты ролей.
 * Это ОПРЕДЕЛЕНИЕ (версионируется в коде); рантайм-источник истины — БД, куда оно
 * идемпотентно засевается `syncAuthzCatalog`. Резолв доступа (AuthzService) читает из БД.
 * Расширение прав = строка здесь, не правка кода резолва.
 */
export interface PermissionDef {
  code: string;
  section: string;
  screen: string;
  action: string;
  label: string;
}
export interface RolePackageDef {
  key: string; // = роль/суб-роль EduStore (owner|admin|teacher|parent|student|zavuch|methodist|psychologist)
  cabinet: string; // CabinetKey фронта
  label: string;
  permissions: string[]; // коды Permission
}

export const PERMISSIONS: PermissionDef[] = [
  // owner.* прав в каталоге НЕТ: owner — tenancy-роль Флёра (AR-16), кабинет учредителя ведёт
  // панель Флёра; мёртвые owner.metrics/schools/license.view удалены аудитом 2026-07-28
  // (не входили ни в один пакет — резолвились в пустоту).
  // структура школы (admin/завуч)
  { code: 'structure.disciplines.manage', section: 'structure', screen: 'disciplines', action: 'manage', label: 'Дисциплины' },
  { code: 'structure.distribution.manage', section: 'structure', screen: 'distribution', action: 'manage', label: 'Распределение учителей' },
  { code: 'structure.devices.manage', section: 'structure', screen: 'devices', action: 'manage', label: 'Устройства-киоски' },
  { code: 'structure.classes.manage', section: 'structure', screen: 'classes', action: 'manage', label: 'Классы и подгруппы' },
  { code: 'contingent.students.manage', section: 'contingent', screen: 'students', action: 'manage', label: 'Зачисление/учёт учеников' },
  { code: 'settings.parser.manage', section: 'settings', screen: 'parser', action: 'manage', label: 'Настройки парсера учебников' },
  // документохранилище (AR-35): manage = свои файлы/теги/версии; publish = статус-FSM/доступ/шаринг
  { code: 'doc.files.manage', section: 'doc', screen: 'files', action: 'manage', label: 'Файлы — загрузка/теги/версии' },
  { code: 'doc.files.publish', section: 'doc', screen: 'files', action: 'publish', label: 'Файлы — статус/доступ/шаринг' },
  // согласия 152-ФЗ (AR-29/AR-30): запись — любая аутентифицированная роль за себя/подопечного
  // (source-валидация в сервисе); заявка на удаление — родитель/админ/завуч
  { code: 'consent.record', section: 'consent', screen: 'consent', action: 'record', label: 'Фиксация согласия' },
  { code: 'consent.deletion.request', section: 'consent', screen: 'consent', action: 'deletion', label: 'Заявка на удаление ПДн' },
  // кабинет учителя
  { code: 'journal.grades.view', section: 'journal', screen: 'grades', action: 'view', label: 'Журнал — просмотр' },
  { code: 'journal.grades.edit', section: 'journal', screen: 'grades', action: 'edit', label: 'Журнал — оценки' },
  { code: 'planning.ktp.view', section: 'planning', screen: 'ktp', action: 'view', label: 'КТП — просмотр' },
  { code: 'planning.ktp.edit', section: 'planning', screen: 'ktp', action: 'edit', label: 'КТП — правка' },
  { code: 'planning.ktp.approve', section: 'planning', screen: 'ktp', action: 'approve', label: 'Утверждение КТП (завуч)' },
  { code: 'planning.kpp.approve', section: 'planning', screen: 'kpp', action: 'approve', label: 'Утверждение/генерация КПП (завуч)' },
  { code: 'lesson.conduct', section: 'lesson', screen: 'lesson', action: 'conduct', label: 'Проведение урока (учитель)' },
  // контракты завуча/методиста (Phase 1)
  { code: 'standards.assessment.manage', section: 'standards', screen: 'assessment', action: 'manage', label: 'Политика оценивания (завуч)' },
  { code: 'standards.org.manage', section: 'standards', screen: 'org', action: 'manage', label: 'Оргстандарты (завуч)' },
  { code: 'standards.fgos.approve', section: 'standards', screen: 'fgos', action: 'approve', label: 'Утверждение ФГОС-часов (завуч)' },
  { code: 'standards.timing.manage', section: 'standards', screen: 'timing', action: 'manage', label: 'Тайминг-профили (методист)' },
  // кабинеты (Phase 1)
  { code: 'methodics.manage', section: 'methodics', screen: 'library', action: 'manage', label: 'Методкопилка (методист)' },
  { code: 'courses.manage', section: 'courses', screen: 'studio', action: 'manage', label: 'Студия курсов (методист)' },
  { code: 'curation.assign', section: 'curation', screen: 'teachers', action: 'assign', label: 'Курирование/назначение (методист)' },
  { code: 'schedule.build', section: 'schedule', screen: 'builder', action: 'build', label: 'Сборка расписания (завуч)' },
  { code: 'materials.lesson.generate', section: 'materials', screen: 'lesson', action: 'generate', label: 'Генерация материалов' },
  { code: 'materials.textbook.upload', section: 'materials', screen: 'textbook', action: 'upload', label: 'Загрузка учебника (учитель)' },
  // Communitoria (каналы/объявления): «завуч» на объявлениях = доменная суб-роль staff·завуч.
  { code: 'comm.channel.manage', section: 'comm', screen: 'channels', action: 'manage', label: 'Создание каналов Communitoria' },
  { code: 'comm.announcement.post', section: 'comm', screen: 'announcements', action: 'post', label: 'Публикация объявлений (завуч)' },
  { code: 'notes.teacher.edit', section: 'notes', screen: 'teacher', action: 'edit', label: 'Заметки учителя' },
  { code: 'schedule.view', section: 'schedule', screen: 'schedule', action: 'view', label: 'Расписание' },
  // методист
  { code: 'methodics.umk.view', section: 'methodics', screen: 'umk', action: 'view', label: 'УМК' },
  { code: 'methodics.rp.view', section: 'methodics', screen: 'rp', action: 'view', label: 'Рабочая программа' },
  // родитель / ученик
  { code: 'diary.child.view', section: 'diary', screen: 'child', action: 'view', label: 'Дневник ребёнка' },
  { code: 'grades.child.view', section: 'grades', screen: 'child', action: 'view', label: 'Оценки ребёнка' },
  { code: 'tasks.view', section: 'tasks', screen: 'tasks', action: 'view', label: 'Задания' },
  { code: 'progress.view', section: 'progress', screen: 'progress', action: 'view', label: 'Успеваемость' },
  // психолог (risk-карта — гейт согласия на профилирование, §6.3)
  { code: 'psych.cases.view', section: 'psych', screen: 'cases', action: 'view', label: 'Кейсы' },
  { code: 'psych.sessions.view', section: 'psych', screen: 'sessions', action: 'view', label: 'Сессии' },
  { code: 'psych.risk.view', section: 'psych', screen: 'risk', action: 'view', label: 'Risk-карта' },
];

// Каталог строится на ролях, ПРИХОДЯЩИХ в токен: доменные (teacher|student|parent|
// staff·завуч/методист/психолог) + организационная admin из florus_orgs[].role (уточнение
// AR-16 от 2026-07-28). Вне каталога только owner и tenancy-роли панели Флёра
// (operator/workspace_admin) — они в токен не приходят, их кабинеты ведёт панель Флёра.
export const ROLE_PACKAGES: RolePackageDef[] = [
  { key: 'teacher', cabinet: 'teacher', label: 'Кабинет учителя', permissions: ['journal.grades.view', 'journal.grades.edit', 'planning.ktp.view', 'planning.ktp.edit', 'materials.lesson.generate', 'materials.textbook.upload', 'comm.channel.manage', 'notes.teacher.edit', 'lesson.conduct', 'schedule.view', 'doc.files.manage', 'consent.record'] },
  { key: 'zavuch', cabinet: 'zavuch', label: 'Кабинет завуча', permissions: ['structure.disciplines.manage', 'structure.distribution.manage', 'structure.classes.manage', 'contingent.students.manage', 'planning.ktp.view', 'planning.ktp.edit', 'planning.ktp.approve', 'planning.kpp.approve', 'standards.assessment.manage', 'standards.org.manage', 'standards.fgos.approve', 'comm.channel.manage', 'comm.announcement.post', 'schedule.build', 'schedule.view', 'doc.files.manage', 'doc.files.publish', 'consent.record', 'consent.deletion.request'] },
  { key: 'methodist', cabinet: 'methodist', label: 'Кабинет методиста', permissions: ['structure.disciplines.manage', 'methodics.umk.view', 'methodics.rp.view', 'standards.timing.manage', 'methodics.manage', 'courses.manage', 'curation.assign', 'comm.channel.manage', 'doc.files.manage', 'doc.files.publish', 'consent.record'] },
  { key: 'parent', cabinet: 'parent', label: 'Кабинет родителя', permissions: ['diary.child.view', 'grades.child.view', 'schedule.view', 'consent.record', 'consent.deletion.request'] },
  { key: 'student', cabinet: 'student', label: 'Кабинет ученика', permissions: ['tasks.view', 'schedule.view', 'progress.view', 'consent.record'] },
  { key: 'psychologist', cabinet: 'psychologist', label: 'Кабинет психолога', permissions: ['psych.cases.view', 'psych.sessions.view', 'psych.risk.view', 'consent.record'] },
  // admin — организационная роль из florus_orgs[].role (провижинится в Membership и сессию),
  // НЕ путать с tenancy-ролями панели Флёра (operator/workspace_admin, в токен не приходят).
  // Кабинет админа (AdminApp) работает по этому пакету — уточнение AR-16 в AR-35.
  { key: 'admin', cabinet: 'admin', label: 'Панель управления школой', permissions: ['structure.classes.manage', 'structure.disciplines.manage', 'structure.distribution.manage', 'structure.devices.manage', 'contingent.students.manage', 'settings.parser.manage', 'consent.record', 'consent.deletion.request'] },
];

/** Идемпотентно засеять каталог в БД из канонического определения (boot + сид). */
export async function syncAuthzCatalog(prisma: PrismaClient): Promise<void> {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { section: p.section, screen: p.screen, action: p.action, label: p.label },
      create: p,
    });
  }
  for (const pkg of ROLE_PACKAGES) {
    const row = await prisma.rolePackage.upsert({
      where: { key: pkg.key },
      update: { cabinet: pkg.cabinet, label: pkg.label },
      create: { key: pkg.key, cabinet: pkg.cabinet, label: pkg.label },
    });
    for (const code of pkg.permissions) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;
      await prisma.rolePackagePermission.upsert({
        where: { rolePackageId_permissionId: { rolePackageId: row.id, permissionId: perm.id } },
        update: {},
        create: { rolePackageId: row.id, permissionId: perm.id },
      });
    }
  }
  // прунинг: убрать пакеты и права, выпавшие из канона (например мёртвые owner.* —
  // owner вне каталога, AR-16). Связи RolePackagePermission уходят каскадом.
  const keep = ROLE_PACKAGES.map((p) => p.key);
  await prisma.rolePackage.deleteMany({ where: { key: { notIn: keep } } });
  await prisma.permission.deleteMany({ where: { code: { notIn: PERMISSIONS.map((p) => p.code) } } });
}

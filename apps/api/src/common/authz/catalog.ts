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
  // учредитель
  { code: 'owner.metrics.view', section: 'owner', screen: 'metrics', action: 'view', label: 'Бизнес-метрики' },
  { code: 'owner.schools.view', section: 'owner', screen: 'schools', action: 'view', label: 'Школы' },
  { code: 'owner.license.view', section: 'owner', screen: 'license', action: 'view', label: 'Лицензия' },
  // структура школы (admin/завуч)
  { code: 'structure.disciplines.manage', section: 'structure', screen: 'disciplines', action: 'manage', label: 'Дисциплины' },
  { code: 'structure.distribution.manage', section: 'structure', screen: 'distribution', action: 'manage', label: 'Распределение учителей' },
  { code: 'structure.devices.manage', section: 'structure', screen: 'devices', action: 'manage', label: 'Устройства-киоски' },
  // кабинет учителя
  { code: 'journal.grades.view', section: 'journal', screen: 'grades', action: 'view', label: 'Журнал — просмотр' },
  { code: 'journal.grades.edit', section: 'journal', screen: 'grades', action: 'edit', label: 'Журнал — оценки' },
  { code: 'planning.ktp.view', section: 'planning', screen: 'ktp', action: 'view', label: 'КТП — просмотр' },
  { code: 'planning.ktp.edit', section: 'planning', screen: 'ktp', action: 'edit', label: 'КТП — правка' },
  { code: 'materials.lesson.generate', section: 'materials', screen: 'lesson', action: 'generate', label: 'Генерация материалов' },
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

export const ROLE_PACKAGES: RolePackageDef[] = [
  { key: 'owner', cabinet: 'owner', label: 'Кабинет учредителя', permissions: ['owner.metrics.view', 'owner.schools.view', 'owner.license.view'] },
  { key: 'admin', cabinet: 'admin', label: 'Панель управления', permissions: ['structure.disciplines.manage', 'structure.distribution.manage', 'structure.devices.manage', 'schedule.view'] },
  { key: 'teacher', cabinet: 'teacher', label: 'Кабинет учителя', permissions: ['journal.grades.view', 'journal.grades.edit', 'planning.ktp.view', 'planning.ktp.edit', 'materials.lesson.generate', 'notes.teacher.edit', 'schedule.view'] },
  { key: 'zavuch', cabinet: 'zavuch', label: 'Кабинет завуча', permissions: ['structure.disciplines.manage', 'structure.distribution.manage', 'planning.ktp.view', 'schedule.view'] },
  { key: 'methodist', cabinet: 'methodist', label: 'Кабинет методиста', permissions: ['structure.disciplines.manage', 'methodics.umk.view', 'methodics.rp.view'] },
  { key: 'parent', cabinet: 'parent', label: 'Кабинет родителя', permissions: ['diary.child.view', 'grades.child.view', 'schedule.view'] },
  { key: 'student', cabinet: 'student', label: 'Кабинет ученика', permissions: ['tasks.view', 'schedule.view', 'progress.view'] },
  { key: 'psychologist', cabinet: 'psychologist', label: 'Кабинет психолога', permissions: ['psych.cases.view', 'psych.sessions.view', 'psych.risk.view'] },
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
}

/**
 * Доменные модели под изоляцией тенанта (§3.6, канон Флёра) → колонка ключа тенанта.
 * ЕДИНИЦА ИЗОЛЯЦИИ = школа = Workspace; ключ = workspaceId. Единый источник истины для
 * tenant-guard (и будущего RLS, ключуемого на workspaceId).
 *
 * НЕ перечисленные модели не фильтруются осознанно:
 *  - User / Membership / Session — directory & identity, доступ по florus_user_id
 *    (членства пользователя живут в РАЗНЫХ школах — фильтр по одной их бы скрыл);
 *  - Organization — ПЛАТФОРМА (одна, общая), не тенант; Worknet — tenancy-инфра (сеть);
 *  - OutboxEvent / ProcessedEvent — инфраструктура шины, читается системным воркером.
 * Workspace фильтруется по собственному `id` (видишь только свою школу).
 */
export const TENANT_COLUMN: Record<string, string> = {
  Workspace: 'id',
  Subject: 'workspaceId',
  Class: 'workspaceId',
  Lesson: 'workspaceId',
  Teacher: 'workspaceId',
  Device: 'workspaceId',
  ChannelMembership: 'workspaceId',
  MealOrder: 'workspaceId',
  Student: 'workspaceId',
  SubGroup: 'workspaceId',
  TeachingAssignment: 'workspaceId',
  Grade: 'workspaceId',
  GeneratedMaterial: 'workspaceId',
  StudentProfile: 'workspaceId',
  TeacherNote: 'workspaceId',
  Notification: 'workspaceId',
  Consent: 'workspaceId',
  AuditLog: 'workspaceId',
  Entitlement: 'workspaceId',
  // движок планирования (Phase 1)
  Ktp: 'workspaceId',
  KtpTopic: 'workspaceId',
  Timetable: 'workspaceId',
  TimetableSlot: 'workspaceId',
  Kpp: 'workspaceId',
  KppLesson: 'workspaceId',
  KppMapping: 'workspaceId',
};

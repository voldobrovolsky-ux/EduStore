/**
 * Доменные модели под изоляцией тенанта (§3.6) → колонка ключа тенанта.
 * Единый источник истины для tenant-guard (и будущего слоя RLS).
 *
 * НЕ перечисленные модели не фильтруются осознанно:
 *  - User / Membership / Session — directory & identity, доступ по florus_user_id
 *    (членства пользователя живут в РАЗНЫХ оргах — фильтр по одному тенанту их бы скрыл);
 *  - OutboxEvent / ProcessedEvent — инфраструктура шины, читается системным воркером.
 * Organization фильтруется по собственному `id` (видишь только свою орг).
 *
 * §3.5 (ОТКРЫТО до факта с живого Flör): ключ тенанта = organizationId. Если claim
 * `florus_orgs[]` даёт грануляцию workspace (несколько школ в одном юрлице) — провижининг
 * должен класть в Organization workspace-id, а не org-id. Это меняет ЗНАЧЕНИЕ ключа,
 * не механику guard'а: карта ниже остаётся прежней.
 */
export const TENANT_COLUMN: Record<string, string> = {
  Organization: 'id',
  Subject: 'organizationId',
  Class: 'organizationId',
  Lesson: 'organizationId',
  Teacher: 'organizationId',
  Device: 'orgId',
  ChannelMembership: 'organizationId',
  MealOrder: 'organizationId',
  Student: 'organizationId',
  SubGroup: 'organizationId',
  TeachingAssignment: 'organizationId',
  Grade: 'organizationId',
  GeneratedMaterial: 'organizationId',
  StudentProfile: 'organizationId',
  TeacherNote: 'organizationId',
  Notification: 'organizationId',
};

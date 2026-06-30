/**
 * События движка планирования (Архстандарт §6 — мастер-каталог). Subjects `edustore.<домен>.<событие>`,
 * на kernel-outbox (DomainEvent-конверт). Имена существующих subject'ов не меняются — только новые.
 */
export const ENGINE_EVENTS = {
  ktpGenerated: 'edustore.ktp.generated',
  ktpApproved: 'edustore.ktp.approved',
  kppScheduled: 'edustore.kpp.scheduled',
  kppApproved: 'edustore.kpp.approved',
  scheduleBuilt: 'edustore.schedule.built',
  lessonStarted: 'edustore.lesson.started',
  lessonPhaseChanged: 'edustore.lesson.phase.changed',
} as const;

export interface KtpApprovedV1 {
  ktpId: string;
  classId: string;
  disciplineId: string;
}
export interface KppScheduledV1 {
  kppId: string;
  classId: string;
  disciplineId: string;
  lessonCount: number;
}
export interface KppApprovedV1 {
  kppId: string;
}
export interface LessonStartedV1 {
  lessonId: string;
}
export interface LessonPhaseChangedV1 {
  lessonId: string;
  phase: string;
}

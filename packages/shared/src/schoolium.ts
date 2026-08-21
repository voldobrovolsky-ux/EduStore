/**
 * Schoolium 1.1.1 — канонический контракт фронт↔бэк (AR-36).
 *
 * Единственный источник ролей, прав, шкалы отметок, кодов отказа и форм всех
 * запросов/ответов версии. Обе стороны импортируют отсюда: дрейф формы ломает
 * `tsc`, а не обнаруживается в проде.
 *
 * Источники: `specs/school-onboarding/30-spec.md` (поведение),
 * `specs/school-onboarding/70-screens.md` §0, §9, §11 (экраны, коды, мутации).
 */

// ─────────────────────────── роли (AR-60) ───────────────────────────

/** Шесть ролей версии. Роли совместимы: у пользователя МАССИВ ролей. */
export const SCHOOL_ROLES = [
  'founder',
  'director',
  'deputy_academic',
  'deputy_upbringing',
  'teacher',
  'moderator',
] as const;
export type SchoolRole = (typeof SCHOOL_ROLES)[number];

export const ROLE_LABELS: Record<SchoolRole, string> = {
  founder: 'Учредитель',
  director: 'Директор',
  deputy_academic: 'Заместитель по учебной работе',
  deputy_upbringing: 'Заместитель по воспитательной работе',
  teacher: 'Преподаватель',
  moderator: 'Модератор школы',
};

/**
 * Секции экрана «Персонал» (`S-30`). Кнопка «Добавить» стоит только у
 * множественных ролей — учредители и преподаватели (AR-60): директор и оба зама
 * существуют в одном экземпляре, и «для симметрии» кнопка не добавляется.
 */
export const STAFF_SECTIONS = [
  { level: 1, title: 'Учредители и директор', roles: ['founder', 'director'] as SchoolRole[], addable: 'founder' as SchoolRole | null },
  { level: 2, title: 'Заместители', roles: ['deputy_academic', 'deputy_upbringing'] as SchoolRole[], addable: null },
  { level: 3, title: 'Преподаватели', roles: ['teacher'] as SchoolRole[], addable: 'teacher' as SchoolRole | null },
] as const;

/** Роли, существующие в школе в единственном экземпляре (карточка одна). */
export const SINGLETON_ROLES: SchoolRole[] = ['director', 'deputy_academic', 'deputy_upbringing'];

// ─────────────────────────── права (13 кодов, AR-69, AR-88) ───────────────────────────

/** Восемь мутационных прав версии. */
export const MUTATION_PERMISSIONS = [
  'school.manage',
  'contingent.write',
  'subject.write',
  'staff.manage',
  'schedule.build',
  'journal.mark.post',
  'journal.topic.set',
  'staff.self.write',
] as const;

/** Пять читающих прав; выдаются всем шести ролям. Шаблона «*.read» не существует. */
export const READ_PERMISSIONS = [
  'classes.read',
  'subjects.read',
  'staff.read',
  'schedule.read',
  'journal.read',
] as const;

export const SCHOOL_PERMISSIONS = [...MUTATION_PERMISSIONS, ...READ_PERMISSIONS] as const;
export type SchoolPermission = (typeof SCHOOL_PERMISSIONS)[number];

/**
 * Пакеты прав ролей 1.1.1 (AR-88): модератор держит **все тринадцать** — любая
 * мутация версии проходит для него, включая отметку в чужом уроке. Четыре
 * читающие роли не проходят ни одной мутации; педагог пишет отметки и темы
 * только в своих уроках (проверка принадлежности — в сервисе журнала).
 */
export const ROLE_PERMISSIONS: Record<SchoolRole, SchoolPermission[]> = {
  moderator: [...SCHOOL_PERMISSIONS],
  teacher: [...READ_PERMISSIONS, 'journal.mark.post', 'journal.topic.set', 'staff.self.write'],
  founder: [...READ_PERMISSIONS, 'staff.self.write'],
  director: [...READ_PERMISSIONS, 'staff.self.write'],
  deputy_academic: [...READ_PERMISSIONS, 'staff.self.write'],
  deputy_upbringing: [...READ_PERMISSIONS, 'staff.self.write'],
};

// ─────────────────────────── отметки (6 значений, AR-79) ───────────────────────────

/** Порядок фиксирован — таким он показывается в `S-52`. */
export const MARK_VALUES = ['5', '4', '3', '2', 'н', 'б'] as const;
export type MarkValue = (typeof MARK_VALUES)[number];

/** Числовые отметки участвуют в среднем балле; «н» и «б» — нет (AR-79). */
export const NUMERIC_MARKS: MarkValue[] = ['5', '4', '3', '2'];
export const isNumericMark = (m: MarkValue): boolean => NUMERIC_MARKS.includes(m);

export const MARK_TOKENS: Record<MarkValue, string> = {
  '5': 'mark.m5',
  '4': 'mark.m4',
  '3': 'mark.m3',
  '2': 'mark.m2',
  'н': 'mark.n',
  'б': 'mark.b',
};

// ─────────────────────────── коды ошибок (29, `70-screens.md` §9) ───────────────────────────

export const ERROR_CODES = [
  'LINK_CODE_EXPIRED',
  'TOKEN_USED',
  'TOKEN_EXPIRED',
  'PHONE_TAKEN_IN_SCHOOL',
  'CLASSES_ALREADY_EXIST',
  'TERM_OVERLAP',
  'TERM_REVERSED',
  'LOAD_EXCEEDS_SANPIN',
  'LOAD_EXCEEDS_GRID',
  'GROUP_HOURS_UNEQUAL',
  'TEACHER_OVERBOOKED',
  'SUBJECT_UNCOVERED',
  'GROUPS_UNASSIGNED',
  'DAY_EXCEEDS_SANPIN',
  'DAY_TOO_LONG',
  'CONCURRENT_EDIT',
  'NO_SOLUTION',
  'LESSON_NOT_HELD',
  'LESSON_DETACHED',
  'CLASS_HAS_MARKS',
  'LAST_MODERATOR',
  'LAST_ROLE',
  'CALENDAR_YEAR_MISSING',
  'LOGIN_CODE_INVALID',
  'LOGIN_CODE_EXPIRED',
  'ACCESS_REVOKED',
  'STUDENT_INACTIVE',
  // AR-113: подмена кнопки решает сервер, но гейт живёт в контракте — между
  // открытием карточки и нажатием педагог мог поставить отметку.
  'STUDENT_HAS_MARKS',
  'STAFF_HAS_HISTORY',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Девять кодов отказа генератора. Восемь считаются **арифметикой до перебора**
 * (AR-103, AR-107); `NO_SOLUTION` — единственный отказ самого перебора, он же
 * отвечает на исчерпание бюджета.
 */
export const ARITHMETIC_REFUSALS = [
  'LOAD_EXCEEDS_SANPIN',
  'LOAD_EXCEEDS_GRID',
  'TEACHER_OVERBOOKED',
  'SUBJECT_UNCOVERED',
  'GROUPS_UNASSIGNED',
  'GROUP_HOURS_UNEQUAL',
  'DAY_EXCEEDS_SANPIN',
  'DAY_TOO_LONG',
] as const;
export const GENERATOR_REFUSALS = [...ARITHMETIC_REFUSALS, 'NO_SOLUTION'] as const;
export type GeneratorRefusal = (typeof GENERATOR_REFUSALS)[number];

/** Ответ об ошибке: код, человекочитаемый текст с объектом и цифрами, requestId (AR-97). */
export interface SchoolErrorBody {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}

// ─────────────────────────── параметры контура доступа (AR-94) ───────────────────────────

/** Все значения — `[дефолт]`: меняются решением владельца, механики не меняют. */
export const ACCESS_PARAMS = {
  sessionDays: 90,
  deviceLinkTtlMinutes: 3,
  activationTtlMinutes: 15,
  bindTokenTtlMinutes: 5,
  loginCodeTtlMinutes: 5,
  loginCodeDigits: 6,
  bootstrapLinkTtlHours: 24,
  pollIntervalMs: 2000,
} as const;

/** Бюджет перебора генератора (AR-107): что раньше — секунды или попытки. */
export const GENERATOR_BUDGET = { seconds: 20, attempts: 200_000 } as const;

/** Потолок длины учебного дня — продуктовый дефолт владельца, не норма (AR-103). */
export const DAY_MINUTES_CAP = 420;

/** Дневной потолок уроков по параллелям — СанПиН 1.2.3685-21 табл. 6.6 (базис #11). */
export const DAY_SLOTS_CAP: Record<number, number> = {
  1: 4, 2: 5, 3: 5, 4: 5, 5: 6, 6: 6, 7: 7, 8: 7, 9: 7, 10: 7, 11: 7,
};

/**
 * AR-114: «уроков в день» — ВЕРХНЯЯ ГРАНИЦА школьного дня, одна на школу, а
 * потолок СанПиН нормирует параллель. День класса — `min(число, потолок его
 * параллели)`; отказ `DAY_EXCEEDS_SANPIN` — только когда число выше потолка
 * самой старшей параллели школы. Иначе школа с первым и восьмым классом обязана
 * поставить 4 урока в день всем и не собирается вовсе.
 */
export const classDayCap = (parallel: number, slotsPerDay: number): number =>
  Math.min(slotsPerDay, DAY_SLOTS_CAP[parallel] ?? 0);

export const schoolDayCap = (parallels: number[]): number =>
  Math.max(0, ...parallels.map((p) => DAY_SLOTS_CAP[p] ?? 0));

/** Недельный потолок часов по параллелям — СанПиН, 5-дневка (базис #3). */
export const WEEK_HOURS_CAP: Record<number, number> = {
  1: 21, 2: 23, 3: 23, 4: 23, 5: 29, 6: 30, 7: 32, 8: 33, 9: 33, 10: 34, 11: 34,
};

// ─────────────────────────── FSM онбординга (AR-72) ───────────────────────────

export const SCHOOL_STATES = [
  'empty',
  'classes_created',
  'students_filled',
  'subjects_created',
  'staff_activated',
  'teachers_bound',
  'terms_set',
  'load_set',
  'priorities_set',
  'day_params_set',
  'generated',
  'stale',
  'ready',
] as const;
export type SchoolState = (typeof SCHOOL_STATES)[number];

// ─────────────────────────── контингент ───────────────────────────

export type Sex = 'm' | 'f';

export interface ClassDto {
  id: string;
  parallel: number;
  letter: string | null;
  label: string;
  groupCount: number;
  students: number;
  /** Заполненные и всего — `M-13` называет первое число (AR-105). */
  filledProfiles: number;
  totalProfiles: number;
  /** Сервер решает, какая кнопка показывается: удалить или ничего (AR-89). */
  hasMarks: boolean;
}

export interface StudentDto {
  id: string;
  classId: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  sex: Sex | null;
  groupNo: number | null;
  deactivated: boolean;
  /** Правило подмены кнопки «удалить» → «деактивировать» (AR-78). */
  hasMarks: boolean;
  filled: boolean;
}

export interface CreateClassesDto {
  parallels: number;
  /** Список литер либо `null` — явный отказ «⌀ Без литер» (AR-77). */
  letters: string[] | null;
  studentsPerClass: number;
  /** 2…4 либо `null` — явный отказ «⌀ Без групп» (AR-77). */
  groups: number | null;
  sexKind: 'boys' | 'girls';
  sexCount: number;
  /** Версия прочитанного состояния контингента (AR-109). */
  version: number;
}

export interface UpsertStudentDto {
  lastName: string;
  firstName: string;
  middleName?: string | null;
  sex: Sex;
  groupNo?: number | null;
}

// ─────────────────────────── предметы и привязки ───────────────────────────

export type BindingScope = 'class' | 'group';

export interface SubjectDto {
  id: string;
  name: string;
  classId: string;
  classLabel: string;
  priority: boolean;
  bindings: BindingDto[];
  /** «Покрытие полное» либо перечень непокрытых групп. */
  coverageComplete: boolean;
  uncoveredGroups: number[];
}

export interface BindingDto {
  id: string;
  teacherId: string;
  teacherName: string;
  avatarUrl: string | null;
  scope: BindingScope;
  groupNos: number[];
  hoursPerWeek: number;
}

export interface CreateSubjectDto {
  name: string;
  classId: string;
}

export interface BindTeacherDto {
  token: string;
  scope: BindingScope;
  groupNos?: number[];
}

// ─────────────────────────── персонал ───────────────────────────

export interface StaffCardDto {
  id: string;
  section: 1 | 2 | 3;
  /** Роли: до регистрации — намеченные, после — действующие из членства. */
  roles: SchoolRole[];
  registered: boolean;
  userId: string | null;
  name: string | null;
  avatarUrl: string | null;
  deactivated: boolean;
  /** Сервер решает: удалить (нет истории) либо деактивировать (AR-89). */
  hasHistory: boolean;
}

export type TokenStatus = 'waiting' | 'scanned' | 'used' | 'expired';

export interface ActivationTokenDto {
  token: string;
  status: TokenStatus;
  expiresAt: string;
  /** После скана — идентичность сканировавшего (AR-87). */
  scannedByName?: string | null;
  registeredName?: string | null;
}

export interface JoinStaffDto {
  lastName: string;
  firstName: string;
  middleName?: string | null;
  phone: string;
}

export interface LoginCodeDto {
  code: string;
  expiresAt: string;
}

// ─────────────────────────── календарь ───────────────────────────

export interface TermDto {
  termNo: 1 | 2 | 3 | 4;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;
}

export interface SetTermsDto {
  terms: TermDto[];
}

// ─────────────────────────── расписание ───────────────────────────

export interface LoadEntryDto {
  bindingId: string;
  hoursPerWeek: number;
}

export interface SetLoadDto {
  entries: LoadEntryDto[];
  /** Версия прочитанного состояния расписания (AR-109). */
  version: number;
}

export interface SetPrioritiesDto {
  /** Пустой список допустим только вместе с `explicitNone` (AR-77). */
  subjectIds: string[];
  explicitNone: boolean;
}

export interface DayParamsDto {
  slotsPerDay: number;
  lessonMin: number;
  breakMin: number;
  days: 5 | 6;
  bigBreakAfter: number;
  bigBreakMin: number;
  version: number;
}

export interface TemplateSlotDto {
  dayNo: number;
  slotNo: number;
  classId: string;
  classLabel: string;
  groupNo: number | null;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
}

export interface SchedulePreviewDto {
  templateId: string;
  seed: number;
  status: 'draft' | 'confirmed' | 'stale';
  slots: TemplateSlotDto[];
  /** Мягкие предупреждения приоритетов — не блокируют (ограничение 6). */
  priorityWarnings: string[];
  /** Уроки с отметками, которых нет в новом шаблоне (`S-42.warn.detach`). */
  willDetach: number;
  version: number;
}

export interface ConfirmScheduleDto {
  templateId: string;
  version: number;
}

// ─────────────────────────── журнал ───────────────────────────

export interface JournalColumnDto {
  lessonId: string;
  date: string;
  slotNo: number;
  subjectId: string;
  teacherId: string;
  topic: string | null;
  /** Урок ещё не прошёл — гейт в контракте, UI лишь отражает (AR-74). */
  future: boolean;
  /** Урок вне расписания после регенерации (AR-85). */
  detached: boolean;
}

export interface JournalRowDto {
  studentId: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  sex: Sex | null;
  deactivated: boolean;
  marks: Record<string, MarkValue>; // lessonId → отметка
  /** Средний балл по числовым отметкам; null — числовых нет. */
  average: number | null;
}

export interface JournalDto {
  classId: string;
  subjectId: string;
  columns: JournalColumnDto[];
  rows: JournalRowDto[];
  /** Каникулы: ближайший учебный день из календаря (AR-68). */
  nextSchoolDay: string | null;
}

export interface PostMarkDto {
  studentId: string;
  mark: MarkValue;
}

export interface SetTopicDto {
  topic: string;
}

// ─────────────────────────── кабинет модератора ───────────────────────────

/**
 * Строка `S-60.audit`: «дата · действие · объект» (AR-30, AR-116). Подписи
 * готовит сервер — каталог событий живёт на сервере, и вторая его копия на
 * клиенте разошлась бы с первой.
 */
export interface AuditEntryDto {
  id: string;
  at: string;
  /** Тип события — техническое имя, показывается подсказкой, а не строкой. */
  action: string;
  actionLabel: string;
  objectKind: string;
  /** ФИО субъекта, если аудит его держит; иначе `null` — придумывать нечего. */
  objectName: string | null;
}

export interface AdminCabinetDto {
  state: SchoolState;
  audit: AuditEntryDto[];
}

// ─────────────────────────── сессии и устройства ───────────────────────────

export interface SessionDto {
  id: string;
  deviceHint: string;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

export interface DeviceLinkTokenDto {
  id: string;
  token: string;
  status: TokenStatus;
  expiresAt: string;
}

export interface MeDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
  workspaceId: string;
  schoolName: string;
  roles: SchoolRole[];
  permissions: SchoolPermission[];
  /** Стартовый экран роли: `school.manage` → `journal.mark.post` → `classes.read`. */
  startScreen: string;
  schoolState: SchoolState;
}

/** Стартовый экран роли по первому найденному праву (карта сайта, AR-95). */
export function startScreenFor(permissions: readonly string[]): string {
  if (permissions.includes('school.manage')) return '/classes';
  if (permissions.includes('journal.mark.post')) return '/journal';
  return '/classes';
}

/**
 * `next` валидируется как относительный путь своего origin (AR-95): протокол,
 * хост и `//` отклоняются, иначе кнопка «Вход» становится открытым редиректом.
 */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  if (next.includes('://') || next.includes('\\')) return fallback;
  return next;
}

// ─────────────────────────── маршруты API (`70-screens.md` §11) ───────────────────────────

export const SCHOOL_API = {
  // контур доступа
  deviceLinkToken: '/api/v1/auth/device-link/token',
  deviceLinkStatus: (id: string) => `/api/v1/auth/device-link/token/${id}`,
  deviceLinkApprove: '/api/v1/auth/device-link/approve',
  loginCodeVerify: '/api/v1/auth/login-code/verify',
  logout: '/api/v1/auth/logout',
  sessions: '/api/v1/auth/sessions',
  session: (sid: string) => `/api/v1/auth/sessions/${sid}`,
  me: '/api/v1/me',
  // персонал
  staff: '/api/v1/staff',
  staffCard: (id: string) => `/api/v1/staff/${id}`,
  staffActivationToken: (id: string) => `/api/v1/staff/${id}/activation-token`,
  staffJoin: (token: string) => `/api/v1/staff/join/${token}`,
  staffAvatar: '/api/v1/staff/me/avatar',
  staffRoles: (id: string) => `/api/v1/staff/${id}/roles`,
  staffRole: (id: string, role: string) => `/api/v1/staff/${id}/roles/${role}`,
  staffDeactivate: (id: string) => `/api/v1/staff/${id}/deactivate`,
  staffReactivate: (id: string) => `/api/v1/staff/${id}/reactivate`,
  staffLoginCode: (id: string) => `/api/v1/staff/${id}/login-code`,
  staffRevokeSessions: (id: string) => `/api/v1/staff/${id}/sessions/revoke`,
  // контингент
  classes: '/api/v1/classes',
  classesBulk: '/api/v1/classes/bulk',
  schoolClass: (id: string) => `/api/v1/classes/${id}`,
  classStudents: (id: string) => `/api/v1/classes/${id}/students`,
  student: (id: string) => `/api/v1/students/${id}`,
  studentDeactivate: (id: string) => `/api/v1/students/${id}/deactivate`,
  studentReactivate: (id: string) => `/api/v1/students/${id}/reactivate`,
  // предметы
  subjects: '/api/v1/subjects',
  subject: (id: string) => `/api/v1/subjects/${id}`,
  subjectBindToken: (id: string) => `/api/v1/subjects/${id}/bind-token`,
  subjectTeachers: (id: string) => `/api/v1/subjects/${id}/teachers`,
  subjectTeacher: (id: string, tid: string) => `/api/v1/subjects/${id}/teachers/${tid}`,
  scan: '/api/v1/subjects/scan',
  // календарь и расписание
  terms: '/api/v1/calendar/terms',
  schedule: '/api/v1/schedule',
  scheduleLoad: '/api/v1/schedule/load',
  schedulePriorities: '/api/v1/schedule/priorities',
  scheduleDayParams: '/api/v1/schedule/day-params',
  scheduleGenerate: '/api/v1/schedule/generate',
  scheduleGenerateCancel: '/api/v1/schedule/generate/cancel',
  scheduleConfirm: '/api/v1/schedule/confirm',
  // журнал
  journal: '/api/v1/journal',
  lessonTopic: (id: string) => `/api/v1/lessons/${id}/topic`,
  lessonMarks: (id: string) => `/api/v1/lessons/${id}/marks`,
  lessonMark: (id: string, studentId: string) => `/api/v1/lessons/${id}/marks/${studentId}`,
} as const;

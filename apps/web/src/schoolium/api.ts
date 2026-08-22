/**
 * Единый HTTP-слой Schoolium (AR-36). Формы запросов и ответов — из
 * `@edustore/shared`: тот же источник, что у бэка, поэтому дрейф контракта
 * ломает `tsc`, а не обнаруживается в проде.
 *
 * Отказ сервера НИКОГДА не проглатывается молча (AR-40): любая неуспешная
 * операция превращается в `SchoolApiError` с кодом и дословным текстом из §9,
 * который экран показывает человеку.
 */
import type {
  ActivationTokenDto,
  AdminCabinetDto,
  BindTeacherDto,
  ClassDto,
  ConfirmScheduleDto,
  CreateClassesDto,
  CreateSubjectDto,
  DayParamsDto,
  ErrorCode,
  JoinStaffDto,
  JournalDto,
  MarkValue,
  MeDto,
  SchedulePreviewDto,
  SchoolRole,
  SessionDto,
  SetLoadDto,
  SetPrioritiesDto,
  StaffCardDto,
  StudentDto,
  SubjectDto,
  TermDto,
  TokenStatus,
  UpsertStudentDto,
} from "@edustore/shared";

/** Отказ с кодом и текстом из реестра §9 — то, что экран показывает дословно. */
export class SchoolApiError extends Error {
  constructor(
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly requestId?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new SchoolApiError("NETWORK", "Нет связи с сервером — повторите");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  // Пустое тело — это ОТСУТСТВИЕ ответа, а не пустой объект: `GET /schedule`
  // до первой генерации возвращает именно его, и `{}` вместо `null` заставил
  // бы экран рисовать сетку, которой нет.
  const data = text ? (JSON.parse(text) as Record<string, unknown> | null) : null;
  if (data === null && res.ok) return null as T;
  if (!res.ok) {
    throw new SchoolApiError(
      ((data?.code as ErrorCode) ?? "NETWORK"),
      (data?.message as string) ?? "Не удалось выполнить операцию",
      data?.requestId as string | undefined,
      data?.details as Record<string, unknown> | undefined,
    );
  }
  return data as T;
}

const V1 = "/api/v1";

export const api = {
  // ─── контур доступа ───
  me: () => call<MeDto>("GET", `${V1}/me`),
  logout: () => call<{ ok: boolean }>("POST", `${V1}/auth/logout`),
  deviceLinkToken: (next?: string) =>
    call<{ id: string; token: string; status: TokenStatus; expiresAt: string }>(
      "POST",
      `${V1}/auth/device-link/token`,
      { next },
    ),
  deviceLinkStatus: (id: string) =>
    call<{ status: TokenStatus; nextPath?: string | null }>("GET", `${V1}/auth/device-link/token/${id}`),
  deviceLinkApprove: (token: string) =>
    call<{ ok: boolean; nextPath: string | null }>("POST", `${V1}/auth/device-link/approve`, { token }),
  verifyLoginCode: (code: string) =>
    call<{ ok: boolean; startScreen: string }>("POST", `${V1}/auth/login-code/verify`, { code }),
  consumeBootstrap: (token: string) =>
    call<{ ok: boolean; startScreen: string }>("POST", `${V1}/auth/bootstrap/consume`, { token }),
  sessions: () => call<SessionDto[]>("GET", `${V1}/auth/sessions`),
  endSession: (sid: string) => call<{ ok: boolean }>("DELETE", `${V1}/auth/sessions/${sid}`),

  // ─── контингент ───
  classes: () => call<{ classes: ClassDto[]; version: number }>("GET", `${V1}/classes`),
  schoolClass: (id: string) => call<ClassDto>("GET", `${V1}/classes/${id}`),
  students: (classId: string) => call<StudentDto[]>("GET", `${V1}/classes/${classId}/students`),
  student: (id: string) => call<StudentDto>("GET", `${V1}/students/${id}`),
  createClasses: (dto: CreateClassesDto) => call<{ ok: boolean; created: number }>("POST", `${V1}/classes/bulk`, dto),
  addStudent: (classId: string, dto: UpsertStudentDto) =>
    call<StudentDto>("POST", `${V1}/classes/${classId}/students`, dto),
  updateStudent: (id: string, dto: UpsertStudentDto) => call<StudentDto>("PUT", `${V1}/students/${id}`, dto),
  deleteStudent: (id: string) => call<{ ok: boolean }>("DELETE", `${V1}/students/${id}`),
  deactivateStudent: (id: string) => call<{ ok: boolean }>("POST", `${V1}/students/${id}/deactivate`),
  reactivateStudent: (id: string) => call<{ ok: boolean }>("POST", `${V1}/students/${id}/reactivate`),
  deleteClass: (id: string) => call<{ ok: boolean; studentsDeleted: number }>("DELETE", `${V1}/classes/${id}`),

  // ─── предметы ───
  subjects: () => call<SubjectDto[]>("GET", `${V1}/subjects`),
  subject: (id: string) => call<SubjectDto>("GET", `${V1}/subjects/${id}`),
  createSubject: (dto: CreateSubjectDto) => call<SubjectDto>("POST", `${V1}/subjects`, dto),
  deleteSubject: (id: string) => call<{ ok: boolean }>("DELETE", `${V1}/subjects/${id}`),
  bindToken: (id: string) =>
    call<{ token: string; status: TokenStatus; expiresAt: string }>("POST", `${V1}/subjects/${id}/bind-token`),
  bindStatus: (id: string) =>
    call<{ status: TokenStatus; scannedByName?: string | null; scannedById?: string | null }>(
      "GET",
      `${V1}/subjects/${id}/bind-token`,
    ),
  bindTeacher: (id: string, dto: BindTeacherDto) => call<SubjectDto>("POST", `${V1}/subjects/${id}/teachers`, dto),
  unbindTeacher: (id: string, teacherId: string) =>
    call<SubjectDto>("DELETE", `${V1}/subjects/${id}/teachers/${teacherId}`),
  scan: (token: string) =>
    call<{ ok: boolean; subject: string; classLabel: string }>("POST", `${V1}/subjects/scan`, { token }),

  // ─── персонал ───
  staff: () => call<StaffCardDto[]>("GET", `${V1}/staff`),
  staffCard: (id: string) => call<StaffCardDto>("GET", `${V1}/staff/${id}`),
  addStaffCard: (role: SchoolRole) => call<StaffCardDto>("POST", `${V1}/staff/cards`, { role }),
  activationToken: (id: string) => call<ActivationTokenDto>("POST", `${V1}/staff/${id}/activation-token`),
  activationStatus: (id: string) => call<ActivationTokenDto>("GET", `${V1}/staff/${id}/activation-token`),
  closeCard: (id: string) => call<{ ok: boolean }>("POST", `${V1}/staff/${id}/close`),
  addRole: (id: string, role: SchoolRole) => call<StaffCardDto>("POST", `${V1}/staff/${id}/roles`, { role }),
  removeRole: (id: string, role: SchoolRole) => call<StaffCardDto>("DELETE", `${V1}/staff/${id}/roles/${role}`),
  deactivateStaff: (id: string) => call<StaffCardDto>("POST", `${V1}/staff/${id}/deactivate`),
  reactivateStaff: (id: string) => call<StaffCardDto>("POST", `${V1}/staff/${id}/reactivate`),
  deleteStaff: (id: string) => call<{ ok: boolean }>("DELETE", `${V1}/staff/${id}`),
  loginCode: (id: string) => call<{ code: string; expiresAt: string }>("POST", `${V1}/staff/${id}/login-code`),
  revokeSessions: (id: string) => call<{ ok: boolean; revoked: number }>("POST", `${V1}/staff/${id}/sessions/revoke`),
  join: (token: string, dto: JoinStaffDto) =>
    call<{ ok: boolean; hasSession: boolean }>("POST", `${V1}/staff/join/${token}`, dto),
  setAvatar: (url: string) => call<{ ok: boolean }>("POST", `${V1}/staff/me/avatar`, { url }),
  clearAvatar: () => call<{ ok: boolean }>("DELETE", `${V1}/staff/me/avatar`),

  // ─── календарь и расписание ───
  terms: () => call<TermDto[]>("GET", `${V1}/calendar/terms`),
  setTerms: (terms: TermDto[]) => call<{ ok: boolean }>("PUT", `${V1}/calendar/terms`, { terms }),
  schedule: () => call<SchedulePreviewDto | null>("GET", `${V1}/schedule`),
  load: () =>
    call<{ entries: LoadEntry[]; version: number }>("GET", `${V1}/schedule/load`),
  setLoad: (dto: SetLoadDto) => call<{ ok: boolean }>("PUT", `${V1}/schedule/load`, dto),
  setPriorities: (dto: SetPrioritiesDto) => call<{ ok: boolean }>("PUT", `${V1}/schedule/priorities`, dto),
  setDayParams: (dto: DayParamsDto) =>
    call<{ ok: boolean; dayLengthMinutes: number; cap: number }>("PUT", `${V1}/schedule/day-params`, dto),
  generate: () => call<SchedulePreviewDto>("POST", `${V1}/schedule/generate`),
  cancelGeneration: () => call<{ ok: boolean }>("POST", `${V1}/schedule/generate/cancel`),
  preview: () => call<SchedulePreviewDto>("GET", `${V1}/schedule/preview`),
  confirm: (dto: ConfirmScheduleDto) =>
    call<{ ok: boolean; detached: number; materialized: number }>("POST", `${V1}/schedule/confirm`, dto),

  // ─── журнал ───
  journal: (classId: string, subjectId: string, week?: string) =>
    call<JournalDto>(
      "GET",
      `${V1}/journal?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}` +
        (week ? `&week=${encodeURIComponent(week)}` : ""),
    ),
  setTopic: (lessonId: string, topic: string) => call<{ ok: boolean }>("PUT", `${V1}/lessons/${lessonId}/topic`, { topic }),
  postMark: (lessonId: string, studentId: string, mark: MarkValue) =>
    call<{ ok: boolean }>("POST", `${V1}/lessons/${lessonId}/marks`, { studentId, mark }),
  removeMark: (lessonId: string, studentId: string) =>
    call<{ ok: boolean }>("DELETE", `${V1}/lessons/${lessonId}/marks/${studentId}`),

  // ─── кабинет модератора ───
  admin: () => call<AdminCabinetDto>("GET", `${V1}/admin`),
};

/** Строка экрана 2 мастера расписания: пара «педагог × предмет × класс/группа». */
export interface LoadEntry {
  bindingId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  classLabel: string;
  scope: "class" | "group";
  groupNos: number[];
  hoursPerWeek: number;
}

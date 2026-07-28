/**
 * EduStore — канонический контракт фронт↔бэк (кабинет учителя).
 * Чистые типы + лёгкие хелперы без зависимостей. Импортируется как `@edustore/shared`.
 */

// ─────────────────────────── enums ───────────────────────────
export type LessonType = "LESSON" | "TEST" | "CONTROL";
export type GradeSource = "MANUAL" | "VOICE";
export type NotificationType = "URGENT" | "NORMAL" | "INFO";
export type MaterialType =
  | "LESSON_PLAN"
  | "GRAPHIC_NOTES"
  | "PRESENTATION"
  | "TEST"
  | "CONTROL"
  | "BRIEF_TEST";

/** Значение ячейки журнала: "5".."2" | "н" (отсутствие) | "" (пусто). */
export type GradeValue = "5" | "4" | "3" | "2" | "н" | "";

// ─────────────────────────── teacher / classes ───────────────────────────
/** «Флажок» верхней панели: предмет в классе. */
export interface TeacherClass {
  id: string; // assignmentId
  classId: string;
  label: string; // "8А"
  subject: string; // "Алгебра"
  subjectId: string;
  students: number;
}

export interface TeacherProfile {
  id: string; // florus_user_id
  displayName: string;
  role: string; // "учитель математики"
  initials: string;
  isCurator: boolean;
}

// ─────────────────────────── planning / metro ───────────────────────────
export interface LessonStation {
  id: string;
  type: LessonType;
  title: string;
  short: string;
  unit?: string;
  lessonNumber: number;
  date: string; // ISO
}

export interface LessonMetrics {
  progress: number; // %
  attendance: number; // %
  performance: number; // %
  submitted: number;
  total: number;
}

export interface LessonMaterial {
  id: string;
  type: MaterialType;
  title: string;
  audience: string; // "для учителя"
  format: string; // DOCX | PDF | PPTX
  meta?: string; // "6 страниц"
  icon: string;
  tint: string;
  fileUrl: string;
}

export interface LessonDetail extends LessonStation {
  goals: string[];
  metrics: LessonMetrics;
  pageStart?: number;
  pageEnd?: number;
  homework?: string;
  materials: LessonMaterial[];
}

// ─────────────────────────── journal ───────────────────────────
export interface JournalColumn {
  lessonId: string;
  day: string; // "27.09"
  wd: string; // "пт"
}

export interface JournalRow {
  studentId: string;
  number: number;
  name: string;
  /** значения по колонкам (индекс соответствует columns[]) */
  grades: GradeValue[];
  avg: string; // "4.2" | "—"
}

export interface JournalSummary {
  avg: string;
  attendance: number;
  count: number;
}

export interface JournalData {
  classLabel: string;
  subject: string;
  columns: JournalColumn[];
  rows: JournalRow[];
  summary: JournalSummary;
}

export interface SetGradeRequest {
  studentId: string;
  lessonId: string;
  value: GradeValue;
  comment?: string;
  source?: GradeSource;
}

// ─────────────────────────── voice ───────────────────────────
export interface VoiceGradeRequest {
  audio: string; // base64
  classId: string;
  lessonId: string;
}

export interface VoiceCandidate {
  studentId: string;
  name: string;
  sub: string; // "9В · в журнале"
}

/** Если candidates.length > 1 — нужна дизамбигуация однофамильцев. */
export interface VoiceGradeResponse {
  transcript: string;
  grade: GradeValue;
  confidence: number;
  candidates: VoiceCandidate[];
}

// ─────────────────────────── notes / notifications ───────────────────────────
export interface TeacherNoteRequest {
  audio?: string;
  text?: string;
  lessonId?: string;
  studentIds?: string[];
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  category: string;
  title: string;
  message: string;
  time: string;
  icon: string;
}

// ─────────────────────────── helpers ───────────────────────────
/** CSS-класс ячейки журнала по значению. Совпадает с дизайн-системой. */
export function gradeClass(g: GradeValue | string): string {
  if (g === "5" || g === "4") return "g-good";
  if (g === "3") return "g-mid";
  if (g === "2") return "g-bad";
  if (g === "н") return "g-absent";
  return "";
}

export function studentAvg(grades: GradeValue[]): string {
  let sum = 0;
  let cnt = 0;
  for (const g of grades) {
    if (g && g !== "н") {
      sum += Number(g);
      cnt++;
    }
  }
  return cnt ? (sum / cnt).toFixed(1) : "—";
}

export const API_ROUTES = {
  teacherClasses: "/api/teacher/classes",
  teacherProfile: "/api/teacher/profile",
  lessons: (classId: string) => `/api/teacher/lessons/${classId}`,
  lesson: (lessonId: string) => `/api/teacher/lesson/${lessonId}`,
  journal: (classId: string) => `/api/journal/${classId}`,
  grade: "/api/journal/grade",
  voiceGrade: "/api/voice/grade",
  notes: "/api/teacher/notes",
  notifications: "/api/notifications",
} as const;

// ─────────────────────────── структура школы (AR-36: единый источник фронт↔бэк) ───────────────────────────
export interface StSubGroup { id: string; name: string }
export interface StClass { id: string; label: string; parallel: number; letter: string; students: number; subGroups: StSubGroup[] }
export interface StSubject { id: string; name: string; color: string }
export interface StAssignment { id: string; classId: string; classLabel: string; subjectId: string; subjectName: string; subGroupId: string | null }
export interface StTeacher { id: string; name: string; assignments: StAssignment[] }
export interface StDevice { id: string; name: string; boundBy: string | null; boundAt: string }

// ─────────────────────────── сетка расписания (AR-38) ───────────────────────────
export interface TimetableSlotDto { id: string; day: number; position: number; durationMin: number }
export interface TimetableDto { id: string; classId: string; source: string; slots: TimetableSlotDto[] }
/** Входной слот сетки при сохранении (POST timetable): без id, durationMin — из OrgStandards. */
export interface TimetableSlotInput { day: number; position: number; durationMin?: number }
export interface UpsertTimetableRequest { classId: string; slots: TimetableSlotInput[] }

// ─────────────────────────── движок планирования /api/v1/edu (G-14) ───────────────────────────
export type LessonFsmState = "idle" | "running" | "done";

export interface EduLessonDto {
  id: string;
  date: string; // ISO
  topic: string;
  classId: string;
  subjectId: string;
  state: LessonFsmState | string;
}

/** Карта-содержание урока (LessonContent → TextbookCard), разложено по kpp.approved. */
export interface LessonContentDto {
  id: string;
  order: number;
  cardId: string;
  title: string;
  content: string | null;
}

export interface EduLessonDetailDto extends EduLessonDto {
  startGateOpen: boolean;
  contents: LessonContentDto[];
  kppLesson: { topic: { id: string; title: string; fgosHours: number; hoursSource: string | null } } | null;
}

export interface KtpTopicDto {
  id: string;
  order: number;
  title: string;
  fgosHours: number;
  hoursSource: "estimated" | string | null; // 'estimated' — оценка парсера (ручная правка снимает)
  arCodes: string[];
}
export interface KtpDto {
  id: string;
  classId: string;
  disciplineId: string;
  status: "draft" | "approved" | string;
  approvedBy: string | null;
  topics: KtpTopicDto[];
  createdAt: string;
}
/** Патч темы черновика КТП (часы/название); ручная правка снимает hoursSource. */
export interface KtpTopicPatch { title?: string; fgosHours?: number }
/** Ручное создание КТП без учебника (остаток AR-38): черновик с темами завуча. */
export interface CreateKtpRequest {
  classId: string;
  disciplineId: string;
  topics?: { title: string; fgosHours?: number }[];
}
export interface KtpApproveOutcome {
  id: string;
  status: string;
  kpp: { id: string; status: string; lessonCount: number } | null;
  reason?: string | null; // код причины, если КПП не собрался (INSUFFICIENT_SLOTS/NO_TIMETABLE/…)
}

export interface KppLessonDto {
  id: string;
  sequenceNo: number;
  topic: { id: string; title: string; order: number };
}
export interface KppDto {
  id: string;
  classId: string;
  disciplineId: string;
  status: "scheduled" | "approved" | string;
  lessons: KppLessonDto[];
  createdAt: string;
}

export interface BriefTestPrintDto {
  id: string;
  status: "generated";
  count: number;
  codes: string[]; // псевдонимы (гейт §3 — без ФИО)
}
export interface BriefTestCheckItem { studentCode: string; score: number }
export interface BriefTestCheckResultDto {
  id: string;
  status: "checked";
  items: number;
}

// ─────────────────────────── учебники и Документохранилище (G-14) ───────────────────────────
export interface UploadInitResponse {
  fileId: string;
  uploadUrl: string;
  expiresIn: number;
  classId: string;
  disciplineId: string;
}
export interface CommitResponse {
  materialId: string;
  fileId: string;
  disciplineId: string;
  classId: string | null;
  state: string;
}
/** Назначение учителя (его собственный «флажок» класс+дисциплина) — контекст загрузки. */
export interface MyAssignmentDto {
  id: string; // assignmentId
  classId: string;
  label: string; // «6А»
  subject: string; // «Математика»
  subjectId: string;
}
export interface ParsedTopicDto { id: string; order: number; title: string }
export interface ParsedCardDto {
  id: string;
  order: number;
  title: string;
  content: string | null;
  topicId: string | null;
}
export interface ParsedResponse {
  materialId: string | null;
  fileId: string;
  topics: ParsedTopicDto[];
  cards: ParsedCardDto[];
}
export interface DocFileDto {
  id: string;
  mime: string | null;
  state: "pending" | "raw" | "enriched" | string;
  disciplineId: string | null;
  createdAt: string;
  s3Key: string;
}

// ─────────────────────────── пилотный контур /api/pilot (G-14, временный — AR-15/33) ───────────────────────────
export interface PilotStaffDto {
  inviteId: string;
  role: string;
  displayName: string | null;
  phone: string | null;
  status: string;
  userId: string | null;
  loggedIn: boolean;
  assigned: boolean;
  assignments: string[]; // ярлыки «5А · Математика»
  token: string | null; // для повторного QR (только пока не вошёл)
}
export interface PilotInviteDto { inviteId: string; token: string; role: string; displayName: string | null }
export interface PilotClassDto { id: string; label: string; parallel: number; letter: string }
export interface PilotSubjectDto { id: string; name: string; color: string }
export interface CabinetStateDto { state: "preparing" | "ready"; message?: string }

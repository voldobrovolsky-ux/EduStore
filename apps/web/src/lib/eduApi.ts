// Клиент образовательного движка (/api/v1/edu/*): расписание, летучка, КТП/КПП (надзор завуча).
// G-14: формы — ТОЛЬКО из @edustore/shared (бэк типизирует ответы теми же типами; дрейф ломает tsc).
import { http } from "./http";
import type {
  BriefTestCheckItem,
  BriefTestCheckResultDto,
  BriefTestPrintDto,
  CreateKtpRequest,
  EduLessonDetailDto,
  EduLessonDto,
  KtpApproveOutcome,
  KtpDto,
  KtpTopicDto,
  KtpTopicPatch,
  KppDto,
  TimetableDto,
  TimetableSlotInput,
} from "@edustore/shared";

// алиасы прежних локальных имён — экраны импортируют отсюда, форма одна (shared)
export type EduLesson = EduLessonDto;
export type EduLessonDetail = EduLessonDetailDto;
export type BriefTestPrint = BriefTestPrintDto;
export type BriefTestCheckResult = BriefTestCheckResultDto;
export type {
  KtpApproveOutcome,
  KtpDto,
  KtpTopicDto,
  KppDto,
  TimetableDto,
  TimetableSlotInput,
};
export type { KppLessonDto, LessonContentDto, TimetableSlotDto } from "@edustore/shared";

const BASE = "/api/v1/edu";

export const eduApi = {
  scheduleMe: () => http<EduLesson[]>(`${BASE}/schedule/me`),
  lesson: (id: string) => http<EduLessonDetail>(`${BASE}/lessons/${id}`),

  // летучка (Движок §5): печать кодов → проверка (score 0..1 по коду)
  printBriefTest: (lessonId: string) =>
    http<BriefTestPrint>(`${BASE}/lessons/${lessonId}/brief-test/print`, { method: "POST", body: JSON.stringify({}) }),
  checkBriefTest: (briefTestId: string, results: BriefTestCheckItem[]) =>
    http<BriefTestCheckResult>(`${BASE}/brief-test/${briefTestId}/check`, { method: "POST", body: JSON.stringify({ results }) }),

  // КТП / КПП (надзор завуча)
  ktpList: (classId?: string, disciplineId?: string) =>
    http<KtpDto[]>(`${BASE}/ktp${qs({ classId, disciplineId })}`),
  /** Ручное создание черновика КТП без учебника (остаток AR-38). */
  createKtp: (body: CreateKtpRequest) =>
    http<KtpDto>(`${BASE}/ktp`, { method: "POST", body: JSON.stringify(body) }),
  /** Правка темы черновика (часы/название) — снимает флаг «оценка парсера». */
  updateKtpTopic: (topicId: string, patch: KtpTopicPatch) =>
    http<KtpTopicDto>(`${BASE}/ktp/topics/${topicId}`, { method: "POST", body: JSON.stringify(patch) }),
  approveKtp: (id: string) => http<KtpApproveOutcome>(`${BASE}/ktp/${id}/approve`, { method: "POST", body: "{}" }),
  /** Возврат approved→draft (обратный переход FSM): допустим только при idle-плане. */
  revertKtp: (id: string) => http<KtpDto>(`${BASE}/ktp/${id}/revert`, { method: "POST", body: "{}" }),
  kppList: (classId?: string, disciplineId?: string) =>
    http<KppDto[]>(`${BASE}/kpp${qs({ classId, disciplineId })}`),
  approveKpp: (id: string) => http<{ id: string; status: string }>(`${BASE}/kpp/${id}/approve`, { method: "POST", body: "{}" }),
  /** Возврат approved→scheduled: закрывает гейт урока обратно (только при idle-уроках). */
  revertKpp: (id: string) => http<{ id: string; status: string }>(`${BASE}/kpp/${id}/revert`, { method: "POST", body: "{}" }),

  // Сетка расписания (AR-38): типовая неделя класса; движок — единственный писатель
  timetable: (classId?: string) => http<TimetableDto[]>(`${BASE}/timetable${qs({ classId })}`),
  saveTimetable: (classId: string, slots: TimetableSlotInput[]) =>
    http<TimetableDto>(`${BASE}/timetable`, { method: "POST", body: JSON.stringify({ classId, slots }) }),
};

function qs(params: Record<string, string | undefined>): string {
  const p = Object.entries(params).filter(([, v]) => v) as [string, string][];
  return p.length ? "?" + new URLSearchParams(p).toString() : "";
}

// Клиент учебников: загрузка через Документохранилище (upload-init → PUT presigned → commit)
// и разбор парсера (темы/карты). Контур docs/ — S3-абстракция бэка; фронт видит только presigned URL.
// G-14: формы — из @edustore/shared (та же типизация на бэке; дрейф ломает tsc).
import { http, HttpError } from "./http";
import type {
  CommitResponse,
  DocFileDto,
  MyAssignmentDto,
  ParsedResponse,
  UploadInitResponse,
} from "@edustore/shared";

// алиасы прежних локальных имён (экраны импортируют отсюда)
export type UploadInitResp = UploadInitResponse;
export type CommitResp = CommitResponse;
export type ParsedResp = ParsedResponse;
export type { DocFileDto, MyAssignmentDto };
export type { ParsedCardDto, ParsedTopicDto } from "@edustore/shared";

const EDU = "/api/v1/edu/materials";
const DOC = "/api/v1/doc";

export const materialsApi = {
  /** Собственные назначения учителя — контекст загрузки (класс+дисциплина берутся из них). */
  myAssignments: () => http<MyAssignmentDto[]>("/api/teacher/classes"),

  /** Класс+дисциплина НЕ передаются: сервер берёт их из назначения учителя (assignmentId — если их несколько). */
  uploadInit: (mime: string, assignmentId?: string) =>
    http<UploadInitResp>(`${EDU}/upload-init`, { method: "POST", body: JSON.stringify({ mime, assignmentId }) }),

  /**
   * PUT файла напрямую в S3 по presigned URL, с прогрессом (XHR — fetch не отдаёт onprogress).
   * ВАЖНО: content-type ДОЛЖЕН совпадать с mime из uploadInit — он входит в подпись presign.
   */
  putFile: (uploadUrl: string, file: File, mime: string, onProgress: (pct: number) => void) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("content-type", mime);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new HttpError(xhr.status, `S3 PUT: ${xhr.statusText || xhr.status}`));
      xhr.onerror = () => reject(new HttpError(0, "S3 недоступен (сеть/CORS)"));
      xhr.send(file);
    }),

  commit: (fileId: string) => http<CommitResp>(`${EDU}/${fileId}/commit`, { method: "POST", body: "{}" }),
  parsed: (fileId: string) => http<ParsedResp>(`${EDU}/${fileId}/parsed`),

  /** Учебники дисциплины = doc-файлы с этим disciplineId (list Документохранилища). */
  listByDiscipline: (disciplineId: string) =>
    http<DocFileDto[]>(`${DOC}/files?disciplineId=${encodeURIComponent(disciplineId)}`),
};

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/design/Icon";
import type { SectionProps } from "@/sections/types";
import { materialsApi, type DocFileDto, type ParsedResp } from "@/lib/materialsApi";
import { HttpError } from "@/lib/http";
import "./materials.css";

type UploadStage = { pct: number; label: string } | null;

const STATE_LABEL: Record<string, string> = { pending: "ожидает файла", raw: "загружен", enriched: "разобран" };

/**
 * Материалы: загрузка учебника (docs/-контур: upload-init → PUT presigned → commit) → обогащение →
 * разбор парсера (темы/карты). S3 не настроен → мягкая деградация (баннер), не ошибка интерфейса.
 */
export function MaterialsScreen({ ctx }: SectionProps) {
  const a = ctx.assignment;
  const [files, setFiles] = useState<DocFileDto[] | null>(null);
  const [upload, setUpload] = useState<UploadStage>(null);
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedResp | null>(null);
  const [err, setErr] = useState("");
  const [storageDown, setStorageDown] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    if (!a) return;
    materialsApi
      .listByDiscipline(a.subjectId)
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [a]);

  useEffect(() => {
    setFiles(null);
    setOpenFileId(null);
    setParsed(null);
    refresh();
  }, [refresh]);

  const doUpload = async (file: File) => {
    if (!a || upload) return;
    setErr("");
    setStorageDown(false);
    try {
      const mime = file.type || "application/pdf"; // единый mime: presign подписан под него
      setUpload({ pct: 0, label: "Готовим загрузку…" });
      const init = await materialsApi.uploadInit(mime, a.subjectId);
      setUpload({ pct: 0, label: "Загружаем в хранилище…" });
      await materialsApi.putFile(init.uploadUrl, file, mime, (pct) => setUpload({ pct, label: "Загружаем в хранилище…" }));
      setUpload({ pct: 100, label: "Подтверждаем и разбираем…" });
      await materialsApi.commit(init.fileId); // inline-каскад: enrich → parser → textbook.parsed
      setUpload(null);
      ctx.pushToast({ type: "normal", title: "Учебник загружен", msg: file.name });
      refresh();
      openParsed(init.fileId);
    } catch (e) {
      setUpload(null);
      if (e instanceof HttpError && e.status === 503) {
        setStorageDown(true); // S3 не сконфигурирован — осознанная деградация
      } else if (e instanceof HttpError && e.code === "NO_OBJECT") {
        setErr("Файл не долетел до хранилища — попробуйте ещё раз");
      } else {
        setErr(e instanceof Error ? e.message : "Не удалось загрузить");
      }
    }
  };

  const [parsedErr, setParsedErr] = useState(false);
  const openParsed = async (fileId: string) => {
    if (openFileId === fileId) {
      setOpenFileId(null);
      setParsed(null);
      return;
    }
    setOpenFileId(fileId);
    setParsed(null);
    setParsedErr(false);
    try {
      setParsed(await materialsApi.parsed(fileId));
    } catch {
      setParsedErr(true); // ошибка загрузки разбора ≠ «не учебник»
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void doUpload(f);
  };

  if (!a) {
    return (
      <div className="mt-wrap">
        <div className="mt-card mt-sub">Выберите класс и предмет в верхней панели — учебники привязаны к дисциплине.</div>
      </div>
    );
  }

  return (
    <div className="mt-wrap">
      <div className="mt-card">
        <h3 className="mt-h"><Icon name="materials" size={17} /> Учебники · {a.subject}</h3>
        <div className="mt-sub">Загрузите учебник — система разберёт его на темы и карты для наполнения КТП.</div>

        {storageDown && (
          <div className="mt-warn" style={{ marginTop: 12 }}>
            Файловое хранилище (S3) не настроено — загрузка временно недоступна. Ключи задаются в конфигурации сервера.
          </div>
        )}
        {err && <div className="mt-err" style={{ marginTop: 12 }}>{err}</div>}

        {!upload ? (
          <div
            className={`mt-drop${dragOver ? " is-over" : ""}`}
            style={{ marginTop: 14 }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <Icon name="storage" size={30} />
            <span className="big">Перетащите файл учебника или нажмите</span>
            <span className="small">PDF, EPUB, DjVu, изображения · один файл</span>
            <input
              ref={inputRef}
              type="file"
              hidden
              accept=".pdf,.epub,.djvu,.doc,.docx,image/*,application/pdf"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f); e.target.value = ""; }}
            />
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div className="mt-progress"><i style={{ width: `${upload.pct}%` }} /></div>
            <div className="mt-stage"><span className="mt-spin" /> {upload.label} {upload.pct > 0 && upload.pct < 100 ? `${upload.pct}%` : ""}</div>
          </div>
        )}
      </div>

      <div className="mt-card">
        <h3 className="mt-h">Библиотека дисциплины</h3>
        {files === null && <div className="mt-sub" style={{ padding: "10px 0" }}>Загружаем…</div>}
        {files !== null && files.length === 0 && <div className="mt-sub" style={{ padding: "10px 0" }}>Учебников пока нет — загрузите первый.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {(files ?? []).map((f) => (
            <div key={f.id}>
              <button className={`mt-file${openFileId === f.id ? " is-open" : ""}`} onClick={() => void openParsed(f.id)}>
                <span className="ico"><Icon name="materials" size={19} /></span>
                <span className="t">
                  <span className="name">{fileName(f)}</span>
                  <span className="meta">{new Date(f.createdAt).toLocaleDateString("ru-RU")} · {f.mime ?? "файл"}</span>
                </span>
                <span className={`mt-badge ${f.state}`}>{STATE_LABEL[f.state] ?? f.state}</span>
              </button>
              {openFileId === f.id && <ParsedView parsed={parsed} enriched={f.state === "enriched"} error={parsedErr} onRetry={() => void openParsed(f.id)} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function fileName(f: DocFileDto): string {
  const tail = f.s3Key.split("/").pop() ?? f.id;
  return `Учебник · ${tail.slice(0, 8)}…${tail.includes(".") ? tail.slice(tail.lastIndexOf(".")) : ""}`;
}

function ParsedView({ parsed, enriched, error, onRetry }: { parsed: ParsedResp | null; enriched: boolean; error: boolean; onRetry: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (error)
    return (
      <div className="mt-sub" style={{ padding: "10px 4px", display: "flex", alignItems: "center", gap: 10 }}>
        Не удалось загрузить разбор.
        <button className="mt-file" style={{ width: "auto", padding: "5px 12px", fontSize: 12.5 }} onClick={onRetry}>Повторить</button>
      </div>
    );
  if (!parsed) return <div className="mt-sub" style={{ padding: "10px 4px" }}><span className="mt-spin" style={{ display: "inline-block", verticalAlign: -2, marginRight: 7 }} />Читаем разбор…</div>;
  if (!parsed.materialId) return <div className="mt-sub" style={{ padding: "10px 4px" }}>Это файл дисциплины, но не учебник (загружен вне потока «Материалы»).</div>;
  if (parsed.topics.length === 0 && parsed.cards.length === 0) {
    return (
      <div className="mt-sub" style={{ padding: "10px 4px" }}>
        {enriched ? "Структура не распознана (нет маркеров «Глава/§» в тексте)." : "Разбор появится после обогащения файла (OCR)."}
      </div>
    );
  }
  const byTopic = (tid: string | null) => parsed.cards.filter((c) => c.topicId === tid);
  const orphans = byTopic(null); // карты без темы (учебник с § без глав) — тоже показываем
  return (
    <div className="mt-parse" style={{ padding: "10px 2px 2px" }}>
      {parsed.topics.map((t) => {
        const cards = byTopic(t.id);
        const isOpen = open === t.id;
        return (
          <div key={t.id} className={`mt-topic${isOpen ? " is-open" : ""}`}>
            <button onClick={() => setOpen(isOpen ? null : t.id)}>
              <Icon name="ktp" size={15} /> {t.title}
              <span className="mt-count">{cards.length} карт</span>
              <span className="chev"><Icon name="chevRight" size={15} /></span>
            </button>
            {isOpen && (
              <div className="mt-cards">
                {cards.map((c) => (
                  <div key={c.id} className="mt-cardrow">
                    <b>{c.title}</b>
                    {c.content && <span>{c.content}</span>}
                  </div>
                ))}
                {cards.length === 0 && <div className="mt-sub">Карт в теме нет.</div>}
              </div>
            )}
          </div>
        );
      })}
      {orphans.length > 0 && (
        <div className={`mt-topic${open === "__orphans" ? " is-open" : ""}`}>
          <button onClick={() => setOpen(open === "__orphans" ? null : "__orphans")}>
            <Icon name="ktp" size={15} /> Вне тем
            <span className="mt-count">{orphans.length} карт</span>
            <span className="chev"><Icon name="chevRight" size={15} /></span>
          </button>
          {open === "__orphans" && (
            <div className="mt-cards">
              {orphans.map((c) => (
                <div key={c.id} className="mt-cardrow">
                  <b>{c.title}</b>
                  {c.content && <span>{c.content}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

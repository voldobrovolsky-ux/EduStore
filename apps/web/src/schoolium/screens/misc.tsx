/**
 * `S-60` кабинет модератора, `S-70` сканер QR, `S-80` устройства и сессии,
 * плюс 403-экран для тех, кто пришёл на `/admin` не модератором.
 *
 * Общее у трёх экранов одно: они говорят человеку правду о том, чего он не
 * может, и почему. Пустой страницы и молчаливого редиректа нет ни в одном
 * случае (`70-screens.md`, `S-60`).
 */
import { useEffect, useRef, useState } from "react";
import type { AuditEntryDto, SessionDto } from "@edustore/shared";
import { api, SchoolApiError } from "../api";
import { useAsync } from "../hooks";
import { Badge, Button, EmptyState, ErrorState, Modal, Skeletons, Toast, useToast } from "../ui";
import { useSession } from "../session";
import { navigate } from "../router";

/** Десктоп начинается с 768px (§0): промежуточной верстки нет — две раскладки. */
const isMobile = (): boolean => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
const hasCamera = (): boolean =>
  typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

const dateTime = (iso: string): string =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// ─────────────────────────── 403 · раздел не для этой роли ───────────────────────────

/**
 * Экраны общие, действия гейтятся (AR-69) — но `/admin` целиком принадлежит
 * модератору, и остальным здесь показывается причина, а не пустота.
 */
export function ForbiddenScreen() {
  return (
    <EmptyState
      testId="forbidden"
      title="Раздел доступен модератору школы"
      hint="Ведение школы — классы, предметы, персонал, расписание — за модератором. Остальное вам открыто."
      action={
        <Button kind="primary" onClick={() => navigate("/journal")}>
          К журналу
        </Button>
      }
    />
  );
}

// ─────────────────────────── S-60 · кабинет модератора ───────────────────────────

const SECTIONS: { to: string; label: string; hint: string }[] = [
  { to: "/classes", label: "Классы", hint: "контингент и профили учеников" },
  { to: "/subjects", label: "Предметы", hint: "карточки «предмет × класс» и привязки педагогов" },
  { to: "/staff", label: "Персонал", hint: "карточки сотрудников, роли, доступ" },
  { to: "/schedule", label: "Расписание", hint: "сетка недели и её пересборка" },
];

export function AdminScreen() {
  const { can } = useSession();
  const [state, reload] = useAsync(() => api.admin());

  if (!can("school.manage")) return <ForbiddenScreen />;
  if (state.status === "loading") return <Skeletons count={4} kind="row" />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={reload} />;

  return (
    <>
      <div className="sch-page-head">
        <h1>Кабинет модератора</h1>
        <Badge muted>состояние школы: {state.data.state}</Badge>
      </div>

      <div className="sch-cards--4" data-testid="S-60.nav">
        {SECTIONS.map((s) => (
          <button key={s.to} className="sch-card sch-card--link" onClick={() => navigate(s.to)}>
            <span className="sch-card-title">{s.label}</span>
            <span className="sch-muted">{s.hint}</span>
          </button>
        ))}
      </div>

      <h2 className="sch-section-title" style={{ marginTop: "var(--sp-32)" }}>
        Мои действия
      </h2>
      {/* Аудит — противовес полным правам (AR-88): модератор видит собственный
          след теми же словами, какими его увидит проверяющий. Фильтров в
          1.1.1 нет намеренно. */}
      <AuditList entries={state.data.audit} />
    </>
  );
}

function AuditList({ entries }: { entries: AuditEntryDto[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Действий пока нет"
        hint="Здесь появится журнал ваших действий: дата, действие, объект"
      />
    );
  }
  return (
    <div className="sch-tablewrap">
      <table className="sch-table" data-testid="S-60.audit">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Действие</th>
            <th>Объект</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{dateTime(e.at)}</td>
              <td title={e.action}>{e.actionLabel}</td>
              <td>{e.objectName ?? e.objectKind}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────── S-70 · сканер QR ───────────────────────────

export function ScanScreen() {
  const [mobile] = useState(isMobile);
  const [denied, setDenied] = useState(false);
  const [result, setResult] = useState<{ subject: string; classLabel: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!mobile || !hasCamera()) return;
    let alive = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (!alive) return void s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => alive && setDenied(true));
    return () => {
      alive = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [mobile]);

  // Распознавание — нативным BarcodeDetector: сторонний декодер тянуть в
  // версию не за чем, а на устройствах без него честно предлагается ввод кода.
  useEffect(() => {
    if (!mobile || denied || result) return;
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!Detector) return;
    const det = new Detector({ formats: ["qr_code"] });
    const id = setInterval(async () => {
      if (!video.current || video.current.readyState < 2) return;
      const codes = await det.detect(video.current).catch(() => []);
      const raw = codes[0]?.rawValue;
      if (!raw) return;
      clearInterval(id);
      try {
        const r = await api.scan(raw.replace(/^schoolium:bind:/, ""));
        setResult({ subject: r.subject, classLabel: r.classLabel });
      } catch (e) {
        setError(e instanceof SchoolApiError ? e.message : "Код не распознан");
      }
    }, 400);
    return () => clearInterval(id);
  }, [mobile, denied, result]);

  if (!mobile) {
    // Десктоп показывает не заглушку, а причину: камера ноутбука есть не у
    // всех и смотрит не туда — рабочий сценарий здесь телефонный (§7).
    return (
      <EmptyState
        testId="S-70.hint.desktop"
        title="Сканер доступен на телефоне"
        hint="Наведите камеру телефона на QR из карточки предмета — привязка произойдёт там. На компьютере сканировать нечем: камера смотрит на вас, а не на экран коллеги."
      />
    );
  }

  if (denied) {
    return (
      <div className="sch-card sch-stack" data-testid="S-70.error.denied">
        <h2>Нет доступа к камере</h2>
        <p className="sch-muted">
          Разрешите камеру в настройках браузера: значок замка в адресной строке → «Камера» → «Разрешить», затем
          обновите страницу.
        </p>
        <Button kind="secondary" onClick={() => window.location.reload()}>
          Повторить
        </Button>
      </div>
    );
  }

  if (result) {
    return (
      <div className="sch-card sch-stack" data-testid="S-70.result">
        <h2>Вы привязаны к предмету</h2>
        <p>
          {result.subject} · {result.classLabel}
        </p>
        <Button kind="primary" onClick={() => navigate("/journal")}>
          К журналу
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="sch-viewfinder" data-testid="S-70.viewfinder">
        <video ref={video} autoPlay playsInline muted />
        <div className="sch-viewfinder-frame" />
      </div>
      <p className="sch-muted">Наведите камеру на QR из карточки предмета</p>
      {error ? <Toast text={error} /> : null}
    </>
  );
}

// ─────────────────────────── S-80 · устройства и сессии ───────────────────────────

export function DevicesScreen() {
  const [state, reload] = useAsync(() => api.sessions());
  const { toast, showToast } = useToast();
  const [pending, setPending] = useState<{ token: string; hint: string } | null>(null);

  if (state.status === "loading") return <Skeletons count={3} kind="row" />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={reload} />;

  const sessions = state.data;

  return (
    <>
      <div className="sch-page-head">
        <h1>Устройства и сессии</h1>
        {/* Кнопка скрыта, если камеры нет: подключать нечем, а неработающая
            кнопка врёт о возможности (§6). */}
        {hasCamera() ? (
          <Button
            kind="primary"
            testId="S-80.btn.linkDevice"
            onClick={() => {
              const raw = window.prompt("Код с экрана входа подключаемого устройства");
              if (raw) setPending({ token: raw.replace(/^schoolium:link:/, ""), hint: "новое устройство" });
            }}
          >
            Подключить устройство
          </Button>
        ) : null}
      </div>

      <div className="sch-list" data-testid="S-80.list.sessions">
        {sessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            onEnded={() => {
              showToast("Сессия завершена");
              reload();
            }}
            onError={showToast}
          />
        ))}
      </div>

      {/* Привязка не молчаливая (AR-18): подтверждение называет устройство. */}
      {pending ? (
        <Modal
          title="Подключить устройство?"
          width={420}
          testId="S-80.confirm"
          onClose={() => setPending(null)}
          footer={
            <div className="sch-actions">
              <Button kind="secondary" onClick={() => setPending(null)}>
                Отмена
              </Button>
              <Button
                kind="primary"
                onClick={async () => {
                  try {
                    await api.deviceLinkApprove(pending.token);
                    setPending(null);
                    showToast("Устройство подключено");
                    reload();
                  } catch (e) {
                    setPending(null);
                    showToast(e instanceof SchoolApiError ? e.message : "Не удалось подключить устройство");
                  }
                }}
              >
                Подключить
              </Button>
            </div>
          }
        >
          <p>Подключить {pending.hint}? После подключения оно получит доступ к вашей школе.</p>
        </Modal>
      ) : null}

      {toast ? <Toast text={toast} /> : null}
    </>
  );
}

function SessionRow({
  session,
  onEnded,
  onError,
}: {
  session: SessionDto;
  onEnded: () => void;
  onError: (t: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="sch-card sch-row sch-row--between">
      <div>
        <div>
          {session.deviceHint} {session.current ? <Badge>это устройство</Badge> : null}
        </div>
        <span className="sch-muted">последняя активность: {dateTime(session.lastSeenAt)}</span>
      </div>
      {/* Текущую сессию завершить нельзя: это «выйти», и кнопка для этого своя. */}
      {session.current ? null : (
        <Button
          kind="danger"
          testId="S-80.btn.endSession"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.endSession(session.id);
              onEnded();
            } catch (e) {
              onError(e instanceof SchoolApiError ? e.message : "Не удалось завершить сессию");
            } finally {
              setBusy(false);
            }
          }}
        >
          Завершить
        </Button>
      )}
    </div>
  );
}

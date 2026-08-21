/**
 * Контур входа: `S-00` лендинг, `S-01` привязка устройства, `S-05` код от
 * модератора, `S-03` регистрация по QR, `S-04` фото, `/bootstrap/:token`.
 *
 * Все пять экранов показываются БЕЗ оболочки (§2.3): ни сайдбара, ни топбара —
 * единственный элемент шапки это логотип. Кнопки регистрации на сайте нет и не
 * будет (AR-95): пользователей заводит школа, самостоятельной регистрации не
 * существует как класса.
 */
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ACCESS_PARAMS, safeNext } from "@edustore/shared";
import { api, SchoolApiError } from "../api";
import { Button, Field } from "../ui";
import { useIsMobile, usePolling } from "../hooks";
import { navigate } from "../router";

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="sch sch-auth">
      <div className="sch-logo" style={{ fontSize: "var(--fs-h2)" }}>
        Schoolium
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────── S-00 · лендинг ───────────────────────────

export function LandingScreen({ authed, startScreen }: { authed: boolean; startScreen: string }) {
  return (
    <div className="sch sch-auth">
      <div className="sch-hero">
        <div className="sch-logo" data-testid="S-00.logo" style={{ fontSize: "var(--fs-h1)", justifyContent: "center" }}>
          Schoolium
        </div>
        <div data-testid="S-00.hero">
          <h1>ERP для школы</h1>
          <p>
            Классы, предметы, персонал, расписание и журнал — в одном месте. Пустая школа превращается в работающую за
            один вечер.
          </p>
        </div>
      </div>
      {/* Кнопки регистрации нет и не будет (AR-95) — агент её не добавляет «для полноты». */}
      <Button
        kind="primary"
        testId="S-00.btn.login"
        onClick={() => navigate(authed ? startScreen : "/login")}
      >
        Вход
      </Button>
    </div>
  );
}

// ─────────────────────────── S-01 · вход, привязка устройства ───────────────────────────

export function LoginScreen({ next }: { next: string | null }) {
  const mobile = useIsMobile();
  const [token, setToken] = useState<{ id: string; token: string } | null>(null);
  const [status, setStatus] = useState<"waiting" | "used" | "expired">("waiting");
  const [error, setError] = useState<string | null>(null);

  const issue = () => {
    api
      .deviceLinkToken(next ?? undefined)
      .then((t) => {
        setToken({ id: t.id, token: t.token });
        setStatus("waiting");
      })
      .catch((e: unknown) => setError(e instanceof SchoolApiError ? e.message : "Не удалось получить код"));
  };

  useEffect(issue, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Поллинг статуса раз в 2 секунды (AR-87). Просроченный QR страница
  // перевыпускает САМА — человек видит новый код, а не ошибку (`S-01` error).
  usePolling(
    async () => {
      if (!token) return;
      const r = await api.deviceLinkStatus(token.id).catch(() => null);
      if (!r) return;
      if (r.status === "used") {
        setStatus("used");
        window.location.assign(safeNext(r.nextPath ?? null, "/classes"));
      } else if (r.status === "expired") {
        issue();
      }
    },
    ACCESS_PARAMS.pollIntervalMs,
    status === "waiting",
  );

  /*
   * `S-01` на мобайле НЕ показывает QR (§6): телефон не сканирует сам себя, и
   * код, который некому навести на камеру, — это тупик с картинкой. Вместо
   * него — прямое объяснение, откуда берётся доступ, и ссылка на `S-05`.
   * Поллинг при этом продолжается: если ноутбук рядом уже отсканировал код,
   * телефон уйдёт внутрь сам.
   */
  if (mobile) {
    return (
      <AuthFrame>
        <div className="sch-card sch-auth-card sch-stack">
          <p data-testid="S-01.caption">
            Вход по QR от модератора: попросите модератора открыть вашу карточку и наведите камеру на его экран
          </p>
          <p data-testid="S-01.status">{status === "used" ? "Устройство подключено" : "Ожидание сканирования…"}</p>
          <Button kind="primary" testId="S-01.link.byCode" onClick={() => navigate("/login/code")}>
            Войти по коду от модератора
          </Button>
          <p className="sch-muted" data-testid="S-01.note.help">
            Первый раз здесь? Доступ выдаёт модератор школы — обратитесь к нему
          </p>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <div className="sch-card sch-auth-card sch-qr">
        {error ? (
          <>
            <p className="sch-danger-text" role="alert">
              {error}
            </p>
            <Button kind="secondary" onClick={issue}>
              Повторить
            </Button>
          </>
        ) : (
          <>
            <div className="sch-qr-frame" data-testid="S-01.qr">
              {token ? <QRCodeSVG value={`schoolium:link:${token.token}`} size={240} /> : <div className="sch-skeleton sch-skeleton--qr" />}
            </div>
            <p data-testid="S-01.caption" className="sch-muted">
              Откройте Schoolium на телефоне: Настройки → Подключить устройство — и наведите камеру
            </p>
            <p data-testid="S-01.status">{status === "used" ? "Устройство подключено" : "Ожидание сканирования…"}</p>
            <Button kind="ghost" testId="S-01.link.byCode" onClick={() => navigate("/login/code")}>
              Нет телефона под рукой? Войти по коду от модератора
            </Button>
            <p className="sch-muted" data-testid="S-01.note.help">
              Первый раз здесь? Доступ выдаёт модератор школы — обратитесь к нему
            </p>
          </>
        )}
      </div>
    </AuthFrame>
  );
}

// ─────────────────────────── S-05 · вход по коду ───────────────────────────

export function LoginCodeScreen() {
  const [digits, setDigits] = useState<string[]>(Array(ACCESS_PARAMS.loginCodeDigits).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const submit = async (code: string) => {
    setBusy(true);
    try {
      const r = await api.verifyLoginCode(code);
      window.location.assign(r.startScreen);
    } catch (e) {
      // Ошибка: встряска + очистка (`S-05.code` состояния)
      setError(e instanceof SchoolApiError ? e.message : "Неверный код");
      setDigits(Array(ACCESS_PARAMS.loginCodeDigits).fill(""));
      refs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const setAt = (i: number, v: string) => {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError(null);
    if (d && i < digits.length - 1) refs.current[i + 1]?.focus();
    const code = next.join("");
    if (code.length === ACCESS_PARAMS.loginCodeDigits && !next.includes("")) void submit(code);
  };

  return (
    <AuthFrame>
      <div className="sch-card sch-auth-card sch-stack">
        <div className={error ? "sch-code-cells sch-shake" : "sch-code-cells"} data-testid="S-05.code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className="sch-code-cell"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={d}
              disabled={busy}
              aria-label={`Цифра ${i + 1}`}
              autoFocus={i === 0}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              }}
            />
          ))}
        </div>
        {error ? (
          <p className="sch-danger-text" role="alert">
            {error}
          </p>
        ) : null}
        <p className="sch-muted" data-testid="S-05.hint">
          Модератор откроет вашу карточку и покажет код — шесть цифр или QR
        </p>
        {/* Кнопка сканера скрыта, если камеры нет (§6). */}
        {hasCamera() ? (
          <Button kind="secondary" testId="S-05.btn.scan">
            Сканировать QR
          </Button>
        ) : null}
        <Button kind="ghost" testId="S-05.btn.back" onClick={() => navigate("/login")}>
          К входу по QR
        </Button>
      </div>
    </AuthFrame>
  );
}

const hasCamera = (): boolean =>
  typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

// ─────────────────────────── S-03 · регистрация по QR ───────────────────────────

export function JoinScreen({ token }: { token: string }) {
  const [form, setForm] = useState({ lastName: "", firstName: "", middleName: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = form.lastName.trim() && form.firstName.trim() && form.phone.trim();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.join(token, {
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || null,
        phone: form.phone.trim(),
      });
      navigate(`/join/${token}/photo`);
    } catch (e) {
      setError(e instanceof SchoolApiError ? e.message : "Не удалось зарегистрироваться");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <div className="sch-card sch-auth-card sch-auth-card--wide">
        <h2 data-testid="S-03.header.role">Регистрация сотрудника</h2>
        <div style={{ marginTop: "var(--sp-16)" }}>
          <Field
            label="Фамилия"
            testId="S-03.input.lastName"
            value={form.lastName}
            autoCapitalize="words"
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
          <Field
            label="Имя"
            testId="S-03.input.firstName"
            value={form.firstName}
            autoCapitalize="words"
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          {/* Отчество опционально — подпись «при наличии» стоит в спеке дословно. */}
          <Field
            label="Отчество"
            hint="при наличии"
            testId="S-03.input.middleName"
            value={form.middleName}
            autoCapitalize="words"
            onChange={(e) => setForm({ ...form, middleName: e.target.value })}
          />
          <Field
            label="Телефон"
            testId="S-03.input.phone"
            value={form.phone}
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 900 000-00-00"
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            error={error}
          />
        </div>
        <div className="sch-actions">
          <Button kind="primary" testId="S-03.btn.submit" disabled={!ready} loading={busy} onClick={submit}>
            Продолжить
          </Button>
        </div>
      </div>
    </AuthFrame>
  );
}

// ─────────────────────────── S-04 · фото профиля ───────────────────────────

export function PhotoScreen() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <AuthFrame>
      <div className="sch-card sch-auth-card sch-stack" style={{ alignItems: "center" }}>
        <div data-testid="S-04.avatar">
          {url ? (
            <img className="sch-avatar sch-avatar--lg" src={url} alt="Фото профиля" />
          ) : (
            <span className="sch-avatar sch-avatar--lg">·</span>
          )}
        </div>
        <Button
          kind="secondary"
          testId="S-04.btn.attach"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            // В 1.1.1 аватар — ссылка: файловое хранилище принадлежит контуру
            // Документохранилища (1.1.2), и тянуть его сюда рано.
            const value = window.prompt("Ссылка на фото");
            if (value) {
              await api.setAvatar(value).catch(() => undefined);
              setUrl(value);
            }
            setBusy(false);
          }}
        >
          Прикрепить фото
        </Button>
        {/* Пропуск фото — ПОЛНОЦЕННЫЙ путь, а не «отложить на потом». */}
        <Button kind="primary" testId="S-04.btn.skip" onClick={() => window.location.assign("/classes")}>
          Продолжить
        </Button>
      </div>
    </AuthFrame>
  );
}

// ─────────────────────────── /bootstrap/:token · первый модератор (AR-93) ───────────────────────────

export function BootstrapScreen({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .consumeBootstrap(token)
      .then((r) => window.location.assign(r.startScreen))
      .catch((e: unknown) => setError(e instanceof SchoolApiError ? e.message : "Ссылка недействительна"));
  }, [token]);
  return (
    <AuthFrame>
      <div className="sch-card sch-auth-card sch-stack">
        {error ? (
          <>
            <p className="sch-danger-text" role="alert">
              {error}
            </p>
            <p className="sch-muted">
              Ссылка одноразова и живёт {ACCESS_PARAMS.bootstrapLinkTtlHours} часа. Новую выпускает администратор
              платформы.
            </p>
          </>
        ) : (
          <p>Входим…</p>
        )}
      </div>
    </AuthFrame>
  );
}

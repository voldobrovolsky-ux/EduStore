/**
 * Библиотека Schoolium: девять типов кнопок (§4), модалка с ловушкой фокуса
 * (§3, AR-82), три состояния экрана (§5) и мелкие элементы.
 *
 * Правила, которые здесь ЗАШИТЫ, а не оставлены на дисциплину экрана:
 *   · модалка и поповер закрываются крестиком, `Esc` и кликом мимо, держат фокус
 *     внутри и возвращают его открывателю;
 *   · уровней вложенности слоя ровно два — третий не выразим типом (AR-82);
 *   · ни одного литерального цвета: всё через классы на CSS-переменных.
 *
 * Правило «кнопка, недоступная роли, НЕ рендерится» (AR-69) живёт НЕ здесь:
 * библиотека не знает прав, их знает экран. Экран получает право из `session`
 * и не передаёт кнопку в `action`/разметку — `disabled` означает «нельзя
 * сейчас», отсутствие означает «не ваша роль». Держится это перечислением
 * гейтов `can(...)` в экранах и живой проверкой смока G-53 на сессии педагога.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { MARK_VALUES, type MarkValue } from "@edustore/shared";

// ─────────────────────────── кнопки (реестр §4) ───────────────────────────

export type ButtonKind =
  | "primary"
  | "accent"
  | "secondary"
  | "ghost"
  | "danger"
  | "off"
  | "icon"
  | "fab"
  | "chip";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: ButtonKind;
  loading?: boolean;
  testId?: string;
}

export function Button({ kind = "primary", loading, testId, children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`sch-btn sch-btn--${kind}`}
      data-testid={testId}
      data-kind={kind}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {/* loading: спиннер ВМЕСТО текста, ширина кнопки не меняется (§5) */}
      {loading ? <span className="sch-spinner" aria-label="загрузка" /> : children}
    </button>
  );
}

// ─────────────────────────── поля ───────────────────────────

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  testId?: string;
  hint?: string;
}

export function Field({ label, error, testId, hint, ...rest }: FieldProps) {
  const id = useId();
  return (
    <div className="sch-field">
      <label className="sch-field-label" htmlFor={id}>
        {label}
        {hint ? <span className="sch-muted"> · {hint}</span> : null}
      </label>
      <input
        id={id}
        className="sch-input"
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        {...rest}
      />
      {/* Ошибка поля — рамка И текст причины: цвет один смысла не кодирует (AR-80). */}
      {error ? (
        <span className="sch-field-error" id={`${id}-err`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

// ─────────────────────────── модалка (§3) ───────────────────────────

export interface ModalProps {
  title: string;
  width: number;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
  /** Уровень вложенности: максимум два (AR-82). Третий — дефект конструкции. */
  level?: 1 | 2;
}

export function Modal({ title, width, onClose, children, footer, testId, level = 1 }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    opener.current = document.activeElement;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden"; // контент под блюром не скроллится
    // фокус на первый интерактивный элемент
    const first = ref.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => {
      body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.(); // возврат фокуса открывателю
    };
  }, []);

  /**
   * Фокус не уходит из модалки, даже когда исчезает элемент, на котором он был.
   * Мастер меняет шаг — кнопка «Далее» размонтируется вместе с содержимым, и
   * фокус падает на `body`. `Esc` и `Tab`-ловушка висят на карточке и ждут
   * события ИЗНУТРИ — а изнутри больше ничего не приходит. Дефект найден смоком
   * G-53: со второго шага мастера расписания `Esc` переставал закрывать `M-08`.
   *
   * Проверка идёт ПОСЛЕ КАЖДОГО рендера, а не по событию: браузер не обещает
   * `focusout`, когда сфокусированный узел удалён, — на это событие полагаться
   * нельзя. Два условия, при которых модалка фокус НЕ отнимает: окно потеряло
   * фокус целиком (человек ушёл в адресную строку) и открыт вложенный слой
   * (AR-82) — забирает верхняя из открытых модалок.
   */
  useEffect(() => {
    const card = ref.current;
    if (!card || !document.hasFocus()) return;
    const active = document.activeElement;
    if (active && card.contains(active)) return;
    const overlays = document.querySelectorAll('.sch-overlay');
    if (overlays[overlays.length - 1] !== card.parentElement) return;
    card.focus();
  });

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // ловушка фокуса: Tab не выводит за пределы карточки
      const nodes = ref.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes || nodes.length === 0) return;
      const list = Array.from(nodes);
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    },
    [onClose],
  );

  return (
    <div
      className="sch-overlay"
      data-level={level}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(); // клик по фону
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className="sch-modal"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        ref={ref}
        tabIndex={-1}
      >
        <div className="sch-modal-head">
          <h2 id={titleId}>{title}</h2>
          <Button kind="icon" onClick={onClose} aria-label="Закрыть" testId={testId ? `${testId}.close` : undefined}>
            ✕
          </Button>
        </div>
        <div className="sch-modal-body">{children}</div>
        {footer ? <div className="sch-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/**
 * Поповер — второй способ показать слой (`S-51`, `S-52`): якорится к клетке
 * таблицы, но подчиняется тем же правилам §0, что и модалка — ловушка фокуса,
 * `Esc` закрывает, фокус возвращается открывателю. Разница лишь в геометрии:
 * поповер не затемняет экран и не блокирует прокрутку, потому что журнал под
 * ним остаётся контекстом действия.
 */
export function Popover({
  anchor,
  onClose,
  children,
  testId,
  label,
}: {
  anchor: DOMRect;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const el = ref.current;
    if (el) {
      const box = el.getBoundingClientRect();
      // Поповер не выходит за окно: если снизу/справа не хватает места —
      // разворачивается вверх/влево от якоря.
      const below = anchor.bottom + 8;
      const top = below + box.height > window.innerHeight ? Math.max(8, anchor.top - box.height - 8) : below;
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8));
      setPos({ top, left });
    }
    return () => {
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [anchor]);

  /**
   * Фокус ставится ОТДЕЛЬНЫМ проходом — после того, как позиция посчитана и
   * слой перестал быть `visibility: hidden`. Скрытый элемент сфокусировать
   * нельзя: браузер молча отказывает, и вместе с фокусом пропадают обе гарантии
   * §0 — `Esc` закрывает (обработчик висит на слое и ждёт события изнутри) и
   * `Tab` не уводит наружу. Дефект найден смоком G-53: после сохранения темы
   * `Esc` не закрывал `S-51`.
   */
  useEffect(() => {
    if (!pos) return;
    ref.current?.querySelector<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')?.focus();
  }, [pos]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [onClose]);

  return (
    <div
      className="sch-popover"
      role="dialog"
      aria-label={label}
      data-testid={testId}
      ref={ref}
      style={pos ? { top: pos.top, left: pos.left } : { top: anchor.bottom + 8, left: anchor.left, visibility: "hidden" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
          return;
        }
        if (e.key !== "Tab") return;
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!nodes || nodes.length === 0) return;
        const list = Array.from(nodes);
        const firstEl = list[0];
        const lastEl = list[list.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────── состояния экрана (§5) ───────────────────────────

export function Skeletons({ count, kind = "card" }: { count: number; kind?: "card" | "row" | "qr" }) {
  return (
    <div className={kind === "card" ? "sch-cards--4" : "sch-stack"} data-testid="state.loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`sch-skeleton sch-skeleton--${kind}`} />
      ))}
    </div>
  );
}

/**
 * Пустое состояние: иллюстрация + заголовок + ОДНА primary-кнопка, ведущая к
 * следующему шагу онбординга. У роли без права кнопка НЕ рендерится, и текст
 * другой: «появятся, когда модератор их создаст» (AR-69, красная линия 7).
 */
export function EmptyState({
  title,
  hint,
  action,
  testId,
  glyph = "◇",
}: {
  title: string;
  hint: string;
  action?: ReactNode;
  testId?: string;
  glyph?: string;
}) {
  return (
    <div className="sch-state" data-testid={testId}>
      <div className="sch-state-illustration" aria-hidden="true">
        {glyph}
      </div>
      <h2>{title}</h2>
      <p className="sch-muted">{hint}</p>
      {action}
    </div>
  );
}

/** Ошибка экрана: причина СЛОВАМИ и кнопка «Повторить». «Произошла ошибка» — дефект. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="sch-error-card" role="alert" data-testid="state.error">
      <strong>Не получилось загрузить</strong>
      <span>{message}</span>
      <Button kind="secondary" onClick={onRetry} testId="state.error.retry">
        Повторить
      </Button>
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return (
    <div className="sch-toast" role="status" data-testid="toast">
      {text}
    </div>
  );
}

/** Тост живёт 4 секунды, одновременно — максимум один (§5). */
export function useToast() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 4000);
    return () => clearTimeout(t);
  }, [text]);
  return { toast: text, showToast: setText };
}

// ─────────────────────────── мелкие элементы ───────────────────────────

export function Avatar({ name, url, large }: { name: string | null; url?: string | null; large?: boolean }) {
  const cls = large ? "sch-avatar sch-avatar--lg" : "sch-avatar";
  if (url) return <img className={cls} src={url} alt={name ?? ""} />;
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className={cls} aria-hidden={name ? undefined : true}>
      {initials || "·"}
    </span>
  );
}

export function Badge({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <span className={muted ? "sch-badge sch-badge--muted" : "sch-badge"}>{children}</span>;
}

/**
 * Чип отметки: символ на подложке. Смысл несёт СИМВОЛ, цвет только помогает —
 * человек с дальтонизмом различает все шесть значений (AR-80, красная линия 4).
 */
export function MarkChip({ value }: { value: MarkValue }) {
  const key = value === "н" ? "n" : value === "б" ? "b" : `m${value}`;
  return <span className={`sch-mark sch-mark--${key}`}>{value}</span>;
}

export const MARK_ORDER = MARK_VALUES;

/** Ключ чипа отметки для `data-testid`: `S-52.chip.m5` … `S-52.chip.b`. */
export const markKey = (m: MarkValue): string => (m === "н" ? "n" : m === "б" ? "b" : `m${m}`);

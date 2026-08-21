/**
 * Навигационная оболочка десктопа (AR-81, `75-adaptive.md` §2.1):
 * левый сайдбар 240px со сворачиванием до 72 + топбар 64px.
 *
 * Два правила, которые здесь не «оформление», а решение:
 *   · «Кабинет» виден ТОЛЬКО модератору — не «серый и некликабельный», а
 *     отсутствует (AR-69);
 *   · сайдбар не скрывается при открытии модалки — он уходит под блюр вместе с
 *     контентом; скролл только в контентной области.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ROLE_LABELS, type SchoolRole } from "@edustore/shared";
import { Avatar, Button } from "./ui";
import { useSession } from "./session";
import { navigate } from "./router";

const COLLAPSE_KEY = "schoolium.sidebar.collapsed";

/** Пять разделов — одинаковых для всех шести ролей (AR-81). */
const NAV: { key: string; path: string; label: string; glyph: string }[] = [
  { key: "classes", path: "/classes", label: "Классы", glyph: "▣" },
  { key: "subjects", path: "/subjects", label: "Предметы", glyph: "◈" },
  { key: "staff", path: "/staff", label: "Персонал", glyph: "☰" },
  { key: "schedule", path: "/schedule", label: "Расписание", glyph: "▦" },
  { key: "journal", path: "/journal", label: "Журнал", glyph: "✎" },
];

export interface ShellProps {
  active: string;
  title: string;
  breadcrumb?: { label: string; to: string; current: string } | null;
  children: ReactNode;
}

export function Shell({ active, title, breadcrumb, children }: ShellProps) {
  const { state, logout } = useSession();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* приватный режим — просто не запоминаем выбор */
    }
  }, [collapsed]);

  if (state.status !== "authed") return null;
  const me = state.me;
  const isModerator = me.roles.includes("moderator");

  return (
    <div className="sch sch-shell">
      <nav className="sch-sidebar" data-collapsed={collapsed} data-testid="L.sidebar">
        <button className="sch-logo" data-testid="L.sidebar.logo" onClick={() => navigate(me.startScreen)}>
          {collapsed ? "S" : "Schoolium"}
        </button>
        <div className="sch-sidebar-sep" />
        <div className="sch-nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className="sch-nav-item"
              data-testid={`L.sidebar.item.${n.key}`}
              aria-current={active === n.key ? "page" : undefined}
              onClick={() => navigate(n.path)}
              title={collapsed ? n.label : undefined}
            >
              <span className="sch-nav-icon" aria-hidden="true">
                {n.glyph}
              </span>
              <span className="sch-nav-label">{n.label}</span>
            </button>
          ))}
          {/* Кабинет модератора: отсутствует у остальных ролей, а не задизейблен. */}
          {isModerator ? (
            <>
              <div className="sch-sidebar-sep" />
              <button
                className="sch-nav-item"
                data-testid="L.sidebar.item.admin"
                aria-current={active === "admin" ? "page" : undefined}
                onClick={() => navigate("/admin")}
                title={collapsed ? "Кабинет" : undefined}
              >
                <span className="sch-nav-icon" aria-hidden="true">
                  ⚙
                </span>
                <span className="sch-nav-label">Кабинет</span>
              </button>
            </>
          ) : null}
        </div>

        <button className="sch-user" data-testid="L.sidebar.user" onClick={() => setMenu((v) => !v)}>
          <Avatar name={me.name} url={me.avatarUrl} />
          <span className="sch-user-text">
            <span className="sch-user-name">{me.name}</span>
            <br />
            <span className="sch-user-roles">{me.roles.map((r) => ROLE_LABELS[r as SchoolRole]).join(', ')}</span>
          </span>
        </button>
        <Button
          kind="icon"
          testId="L.sidebar.collapse"
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "»" : "«"}
        </Button>
      </nav>

      <div className="sch-main">
        <header className="sch-topbar">
          <span className="sch-topbar-title" data-testid="L.topbar.title">
            {title}
          </span>
          {breadcrumb ? (
            <span className="sch-breadcrumb" data-testid="L.topbar.breadcrumb">
              <button onClick={() => navigate(breadcrumb.to)}>{breadcrumb.label}</button> / {breadcrumb.current}
            </span>
          ) : null}
          <span className="sch-topbar-spacer" />
          {/* Сканер — всем ролям, КРОМЕ модератора: он показывает коды, а не сканирует. */}
          {!isModerator ? (
            <Button kind="icon" testId="L.topbar.scan" aria-label="Сканер QR" onClick={() => navigate("/scan")}>
              ⛶
            </Button>
          ) : null}
        </header>
        <main className="sch-content">
          <div className="sch-page">{children}</div>
        </main>
      </div>

      {/* M-15 — меню пользователя: поповер 240px (реестр §3). */}
      {menu ? <UserMenu onClose={() => setMenu(false)} onLogout={logout} /> : null}
    </div>
  );
}

function UserMenu({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sch-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sch-modal" style={{ width: 240 }} role="dialog" aria-label="Меню пользователя" data-testid="M-15">
        <div className="sch-modal-body sch-stack">
          <Button kind="ghost" testId="M-15.devices" onClick={() => { onClose(); navigate("/settings/devices"); }}>
            Устройства
          </Button>
          <Button kind="ghost" testId="M-15.logout" onClick={onLogout}>
            Выйти
          </Button>
        </div>
      </div>
    </div>
  );
}

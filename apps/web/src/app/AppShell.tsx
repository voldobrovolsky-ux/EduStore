import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { NotificationDto, TeacherClass, TeacherProfile } from "@edustore/shared";
import { api } from "@/lib/api";
import { usePrefs } from "@/app/prefs";
import { NAV_SECTIONS } from "@/app/nav";
import { LeftSidebar } from "@/app/LeftSidebar";
import { TopPanel } from "@/app/TopPanel";
import { RightSidebar } from "@/app/RightSidebar";
import { SECTIONS, DEFAULT_SECTION, getSection } from "@/sections/registry";
import type { SectionContext, SectionDescriptor, ToastInput } from "@/sections/types";
import { ToastStack, type Toast } from "@/components/Toasts";
import { NotificationPanel } from "@/components/NotificationPanel";
import { Personalize } from "@/app/screens/Personalize";
import { SimplePlaceholder } from "@/app/screens/SimplePlaceholder";

let TOAST_SEQ = 0;

export function AppShell() {
  const { autoCollapse } = usePrefs();

  const [nav, setNav] = useState("workspace");
  const [workSection, setWorkSection] = useState(DEFAULT_SECTION);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [activeClass, setActiveClass] = useState<TeacherClass | null>(null);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // первичная загрузка
  useEffect(() => {
    api.getProfile().then(setProfile).catch(() => {});
    api.getNotifications().then(setNotifications).catch(() => {});
    api
      .getClasses()
      .then((cs) => {
        setClasses(cs);
        setActiveClass(cs.find((c) => c.label === "8А") ?? cs[0] ?? null);
      })
      .catch(() => {});
  }, []);

  const removeToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const pushToast = useCallback((t: ToastInput) => {
    const id = ++TOAST_SEQ;
    setToasts((ts) => [...ts, { ...t, id }]);
    if (t.type !== "urgent") setTimeout(() => removeToast(id), 5000);
  }, [removeToast]);

  const ctx: SectionContext = { assignment: activeClass, pushToast, searchQuery };

  // ── левая навигация: персонализация и прочие экраны ──
  if (nav === "personalize") {
    return (
      <Frame>
        <div className="app">
          <LeftSidebar active={nav} onSelect={setNav} expanded profile={profile} />
          <div className="middle"><Personalize /></div>
        </div>
        <ToastStack toasts={toasts} remove={removeToast} />
      </Frame>
    );
  }
  if (nav !== "workspace") {
    const item = NAV_SECTIONS.find((s) => s.id === nav)!;
    return (
      <Frame>
        <div className="app">
          <LeftSidebar active={nav} onSelect={setNav} expanded profile={profile} />
          <div className="middle"><SimplePlaceholder label={item.label} icon={item.icon} /></div>
        </div>
        <ToastStack toasts={toasts} remove={removeToast} />
      </Frame>
    );
  }

  // ── рабочее пространство (кабинет) ──
  const lsExpanded = !autoCollapse;
  const descriptor = getSection(workSection);

  return (
    <Frame>
      <div className="app">
        <LeftSidebar active={nav} onSelect={setNav} expanded={lsExpanded} profile={profile} />
        <div className="middle">
          <TopPanel
            classes={classes}
            activeClassId={activeClass?.classId ?? null}
            onSelectClass={setActiveClass}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onBell={() => setNotifOpen(true)}
            notifCount={notifications.length}
          />
          <div className="middle-row">
            <SectionShell
              key={workSection + ":" + (activeClass?.classId ?? "")}
              descriptor={descriptor}
              ctx={ctx}
              active={workSection}
              onSelectSection={setWorkSection}
            />
          </div>
        </div>
      </div>

      {notifOpen && (
        <NotificationPanel items={notifications} onClose={() => setNotifOpen(false)} pushToast={pushToast} />
      )}
      <ToastStack toasts={toasts} remove={removeToast} />
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="viewport">{children}</div>;
}

const PassThrough = ({ children }: { ctx: SectionContext; children: ReactNode }) => <>{children}</>;

/**
 * Композирует зоны раздела: общий провайдер раздела оборачивает Nav (зона 2),
 * Work (зона 3) и правый сайдбар (зона 4) — так Nav/Work/RightTools делят состояние.
 */
function SectionShell({
  descriptor,
  ctx,
  active,
  onSelectSection,
}: {
  descriptor: SectionDescriptor;
  ctx: SectionContext;
  active: string;
  onSelectSection: (id: string) => void;
}) {
  const Provider: ComponentType<{ ctx: SectionContext; children: ReactNode }> = descriptor.Provider ?? PassThrough;
  const { Nav, Work, RightTools } = descriptor;
  return (
    <Provider ctx={ctx}>
      {descriptor.hasMetro && Nav && <Nav ctx={ctx} />}
      <Work ctx={ctx} />
      <RightSidebar sections={SECTIONS} active={active} onSelect={onSelectSection}>
        {RightTools && <RightTools ctx={ctx} />}
      </RightSidebar>
    </Provider>
  );
}

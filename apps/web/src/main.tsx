import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/design/styles.css";
import "@/admin/ds/ds.css";
import { PrefsProvider } from "@/app/prefs";
import { AppShell } from "@/app/AppShell";
import { AdminApp } from "@/admin/AdminApp";
import { CurrentUserProvider, useCurrentUser, resolveCabinet } from "@/cabinets/CurrentUser";
import { MINIMAL_CABINETS, type MinimalKey } from "@/cabinets/roleRegistry";
import { MinimalCabinet } from "@/cabinets/MinimalCabinet";
import { RoleSwitch } from "@/cabinets/RoleSwitch";

// Роутинг кабинета по роли (ADR-0005). teacher и admin — готовые кабинеты,
// остальные роли — минимальные кабинеты (навигация + главная).
function Shell() {
  const { user } = useCurrentUser();
  const cab = resolveCabinet(user.florusRole, user.subRole);
  if (cab === "admin") return <AdminApp />;
  if (cab === "teacher") return <AppShell />;
  return <MinimalCabinet def={MINIMAL_CABINETS[cab as MinimalKey]} user={user} />;
}

function Root() {
  return (
    <CurrentUserProvider>
      <PrefsProvider>
        <Shell />
      </PrefsProvider>
      {!import.meta.env.PROD && <RoleSwitch />}
    </CurrentUserProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// PWA: регистрируем service worker (офлайн-кеш журнала/расписания/материалов).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

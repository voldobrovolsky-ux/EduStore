import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/design/styles.css";
import { PrefsProvider } from "@/app/prefs";
import { AppShell } from "@/app/AppShell";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrefsProvider>
      <AppShell />
    </PrefsProvider>
  </StrictMode>,
);

// PWA: регистрируем service worker (офлайн-кеш журнала/расписания/материалов).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

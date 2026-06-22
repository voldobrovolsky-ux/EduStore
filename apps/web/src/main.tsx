import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@/design/styles.css";
import "@/admin/ds/ds.css";
import { PrefsProvider } from "@/app/prefs";
import { AppShell } from "@/app/AppShell";
import { AdminApp } from "@/admin/AdminApp";

type Cabinet = "teacher" | "admin";
const readHash = (): Cabinet => (location.hash.startsWith("#/admin") ? "admin" : "teacher");

function Root() {
  const [mode, setMode] = useState<Cabinet>(readHash);
  useEffect(() => {
    const on = () => setMode(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return (
    <PrefsProvider>
      {mode === "admin" ? <AdminApp /> : <AppShell />}
      <CabinetSwitch mode={mode} />
    </PrefsProvider>
  );
}

// Переключатель кабинетов (учитель ↔ администратор) — для демо/онбординга.
function CabinetSwitch({ mode }: { mode: Cabinet }) {
  const go = (m: Cabinet) => { location.hash = m === "admin" ? "#/admin" : ""; };
  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 95, display: "flex", gap: 3, background: "rgba(255,255,255,.82)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,.8)", borderRadius: 11, padding: 4, boxShadow: "0 8px 24px rgba(38,79,140,.18)" }}>
      {(["teacher", "admin"] as const).map((m) => (
        <button key={m} onClick={() => go(m)} style={{ height: 30, padding: "0 12px", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "'Golos Text', sans-serif", fontSize: 12, fontWeight: 600, background: mode === m ? "#2563EB" : "transparent", color: mode === m ? "#fff" : "#515B6B" }}>
          {m === "teacher" ? "Учитель" : "Администратор"}
        </button>
      ))}
    </div>
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

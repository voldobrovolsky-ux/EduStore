import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Роли как их несёт Флёрус (см. ADR-0005). staff EduStore маппит локально → sub-роль.
export type FlorRole = "owner" | "admin" | "teacher" | "staff" | "parent" | "student";
export type SubRole = "zavuch" | "methodist" | "psychologist" | null;
export type CabinetKey =
  | "owner" | "admin" | "teacher" | "parent" | "student"
  | "zavuch" | "methodist" | "psychologist";

export interface CurrentUser {
  name: string;
  florusRole: FlorRole;
  subRole: SubRole;
  orgName: string;
}

/** Роутинг кабинета по роли (ADR-0005). staff → конкретная sub-роль (назначает админ). */
export function resolveCabinet(florusRole: FlorRole, subRole: SubRole): CabinetKey {
  if (florusRole === "staff") return subRole ?? "methodist";
  return florusRole;
}

const DEFAULT_USER: CurrentUser = {
  name: "Анна Соколова",
  florusRole: "teacher",
  subRole: null,
  orgName: "Гимназия №5",
};

interface Ctx {
  user: CurrentUser;
  // DEV: пока вход через Флёрус не подключён — переключаем роль локально для предпросмотра.
  setUser: (u: CurrentUser) => void;
}
const C = createContext<Ctx | null>(null);
const KEY = "edustore-dev-user";

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser>(() => {
    try {
      return { ...DEFAULT_USER, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    } catch {
      return DEFAULT_USER;
    }
  });
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(user));
  }, [user]);

  // ПРОД: роль из Флёруса (/api/auth/flor/me); нет сессии → редирект на вход.
  // DEV: используем переключатель ролей (RoleSwitch).
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    fetch("/api/auth/flor/me", { credentials: "include" })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          window.location.href = "/api/auth/flor/login";
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((m: { name: string; role: FlorRole; subRole: SubRole; orgName?: string } | null) => {
        if (m) setUser({ name: m.name, florusRole: m.role, subRole: m.subRole, orgName: m.orgName ?? "Школа" });
      })
      .catch(() => undefined);
  }, []);

  return <C.Provider value={{ user, setUser }}>{children}</C.Provider>;
}

export function useCurrentUser(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error("useCurrentUser must be used within CurrentUserProvider");
  return c;
}

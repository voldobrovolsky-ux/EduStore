/**
 * Маршрутизация Schoolium по ПУТИ (AR-41: раздел отражается в URL), без
 * тяжёлого роутера. Карта маршрутов — из `30-spec.md` «Карта сайта» (AR-95):
 * аноним на маршруте приложения уходит на `/login?next=<путь>`, вошедший на
 * `/login` — на стартовый экран роли.
 */
import { useCallback, useEffect, useState } from "react";

export interface Route {
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
}

/** Маршруты приложения — те, что требуют сессии. */
export const APP_PREFIXES = ["/classes", "/subjects", "/staff", "/schedule", "/journal", "/admin", "/scan", "/settings"];

/** Публичные маршруты контура входа — показываются БЕЗ оболочки (§2.3). */
export const PUBLIC_PATHS = ["/", "/login", "/login/code", "/join", "/bootstrap"];

export function parse(pathname: string, search: string): Route {
  const query = new URLSearchParams(search);
  const params: Record<string, string> = {};
  let path = pathname.replace(/\/+$/, "") || "/";

  const join = path.match(/^\/join\/([^/]+)(\/photo)?$/);
  if (join) {
    params.token = join[1];
    path = join[2] ? "/join/:token/photo" : "/join/:token";
  }
  const boot = path.match(/^\/bootstrap\/([^/]+)$/);
  if (boot) {
    params.token = boot[1];
    path = "/bootstrap/:token";
  }
  const cls = path.match(/^\/classes\/([^/]+)(?:\/student\/([^/]+))?$/);
  if (cls) {
    params.classId = cls[1];
    if (cls[2]) params.studentId = cls[2];
    path = cls[2] ? "/classes/:classId/student/:studentId" : "/classes/:classId";
  }
  const subj = path.match(/^\/subjects\/([^/]+)$/);
  if (subj) {
    params.subjectId = subj[1];
    path = "/subjects/:subjectId";
  }
  const staff = path.match(/^\/staff\/([^/]+)$/);
  if (staff) {
    params.personId = staff[1];
    path = "/staff/:personId";
  }
  return { path, params, query };
}

/** Переход без перезагрузки: URL отражает раздел, «назад» браузера работает. */
export function navigate(to: string): void {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(): Route {
  const read = useCallback(() => parse(window.location.pathname, window.location.search), []);
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const onPop = () => setRoute(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);
  return route;
}

export const isAppPath = (path: string): boolean => APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Загрузка данных экрана с тремя состояниями (`70-screens.md` §0): `loading`,
 * `error`, данные. Экран без всех трёх не принимается, поэтому состояние здесь
 * одно и то же для всех экранов, а не выдумывается каждым заново.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SchoolApiError } from "./api";

export type Async<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): [Async<T>, () => void, (d: T) => void] {
  const [state, setState] = useState<Async<T>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const fn = useRef(load);
  fn.current = load;

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fn.current()
      .then((data) => alive && setState({ status: "ready", data }))
      .catch((e: unknown) =>
        alive &&
        setState({
          status: "error",
          // Причина СЛОВАМИ: «произошла ошибка» — дефект (§0).
          message: e instanceof SchoolApiError ? e.message : "Неизвестная ошибка",
        }),
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const patch = useCallback((data: T) => setState({ status: "ready", data }), []);
  return [state, reload, patch];
}

/** Поллинг раз в 2 секунды, пока карточка открыта (AR-87). WebSocket не вводится. */
export function usePolling(fn: () => void | Promise<void>, ms: number, active: boolean): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => void ref.current(), ms);
    return () => clearInterval(id);
  }, [ms, active]);
}

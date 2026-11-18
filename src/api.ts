// Access to the local server API.
import { useCallback, useEffect, useState } from "react";

// ?date=YYYY-MM-DD in the address simulates another day (tests)
export const forcedDate = new URLSearchParams(location.search).get("date");

/** Loads an API route when `enabled` is true, then every 5 minutes and when the tab becomes visible again. */
export function useApi<T>(route: string, enabled = true): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = route + (forcedDate ? `${route.includes("?") ? "&" : "?"}date=${forcedDate}` : "");
  const reload = useCallback(async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(await response.text());
      setData(await response.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Serveur injoignable");
    }
  }, [url]);
  useEffect(() => {
    if (!enabled) return;
    reload();
    const timer = setInterval(reload, 5 * 60_000);
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, reload]);
  return { data, error, reload };
}

/** POST with a JSON body. */
export function post(route: string, body: unknown = {}): Promise<Response> {
  return fetch(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const postOk = (route: string, body: unknown) =>
  post(route, body).then(
    (r) => r.ok,
    () => false,
  );

/** Opens a note in Obsidian through the server (fallback: the browser tries by itself). */
export async function openNote(link: string): Promise<void> {
  if (!(await postOk("/api/open-note", { link }))) location.href = link;
}

/** Opens a code folder in the editor (folders known by the Cockpit only). */
export const openFolder = (path: string) => postOk("/api/open-folder", { path });

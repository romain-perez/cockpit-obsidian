// Google panel of the calendar: connection, status and manual sync of the two calendars.
import { useCallback, useEffect, useState } from "react";
import type { GoogleStatus } from "../../shared/types.ts";
import { post } from "../api.ts";
import { useConfig } from "../config.tsx";
import { Icon } from "./Icon.tsx";

const POLL_MS = 1500;

export function GooglePanel() {
  const { google, language } = useConfig();
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  // Message sent back by the connection (?google=…), shown once then removed from the address
  const [message] = useState(() => new URLSearchParams(location.search).get("google"));
  useEffect(() => {
    if (!message) return;
    const params = new URLSearchParams(location.search);
    params.delete("google");
    history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
  }, [message]);

  const load = useCallback(async () => {
    const response = await fetch("/api/google").catch(() => null);
    if (response?.ok) setStatus(await response.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [status?.running, load]);

  const sync = async () => {
    await post("/api/google/sync");
    setTimeout(load, 300);
  };
  if (!status) return null;
  const lastSync = status.lastSync
    ? new Date(status.lastSync).toLocaleString(language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className={`google-panel${status.running ? " busy" : ""}`}>
      <div className="google-title">
        <b>Calendrier du téléphone via Google</b>
        <span className="muted small">
          « {google.coursesCalendar} » et « {google.personalCalendar} »
        </span>
      </div>
      {message && <p className={`message ${/impossible/i.test(message) ? "error" : "ok"}`}>{message}</p>}
      {!status.hasClient ? (
        <p className="muted small">Fichier client Google absent : voir le README (section Google Agenda).</p>
      ) : !status.connected ? (
        <a className="button peach" href="/api/google/connect">
          <Icon name="external" size={14} /> Connecter Google
        </a>
      ) : (
        <>
          <p className="muted small">
            {status.running ? "Synchronisation en cours…" : lastSync ? `Synchronisé le ${lastSync}` : "Pas encore synchronisé"}
            {status.summary && !status.running && (
              <>
                <br />
                {status.summary}
              </>
            )}
          </p>
          {status.error && <p className="message error">{status.error}</p>}
          <button className={`button small${status.running ? " active" : ""}`} onClick={sync} disabled={status.running}>
            <span className={status.running ? "spinning" : ""}>
              <Icon name="refresh" size={13} />
            </span>{" "}
            {status.running ? "Synchronisation…" : "Synchroniser maintenant"}
          </button>
        </>
      )}
    </div>
  );
}

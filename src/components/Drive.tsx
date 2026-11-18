// Drive view: status of the shared drive, animated check, terminal with the script output and confirmed upload.
import { useCallback, useEffect, useRef, useState } from "react";
import type { DriveFiles, DriveStatus, DriveUpload } from "../../shared/types.ts";
import { post } from "../api.ts";
import { useConfig } from "../config.tsx";
import { plural } from "../utils.ts";
import { Icon } from "./Icon.tsx";

interface DriveResponse {
  status: DriveStatus;
  upload: DriveUpload;
}

const POLL_MS = 1000;
const CHECK_REQUEST_TIMEOUT_MS = 8000;
const STATE_CLASS: Record<DriveStatus["state"], string> = {
  upToDate: "up-to-date",
  pending: "pending",
  checking: "busy",
  unknown: "unknown",
};
const LIST_TITLES: Record<keyof DriveFiles, string> = { added: "🆕 Nouveaux", modified: "✏️ Modifiés", deleted: "🗑️ À supprimer du Drive" };

const clockTime = (iso: string | null, language: string) =>
  iso ? new Date(iso).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";

export function DriveView({ onUploaded }: { onUploaded?: () => void }) {
  const { drive: settings, language } = useConfig();
  const [response, setResponse] = useState<DriveResponse | null>(null);
  const [checkRequested, setCheckRequested] = useState(false); // click on "Vérifier", waiting for the server
  const [confirming, setConfirming] = useState(false); // second step before the upload
  const [error, setError] = useState<string | null>(null);
  const terminal = useRef<HTMLPreElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/drive");
      if (r.ok) {
        setResponse(await r.json());
        setError(null);
      }
    } catch {
      setError("Serveur injoignable");
    }
  }, []);

  const busy = !!response && (response.status.running || response.upload.running);
  useEffect(() => {
    load();
  }, [load]);
  // While something runs: ask the server every second
  useEffect(() => {
    if (!busy && !checkRequested) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [busy, checkRequested, load]);
  useEffect(() => {
    if (checkRequested && response?.status.running) setCheckRequested(false);
  }, [checkRequested, response]);
  // Follow the end of the terminal
  useEffect(() => {
    terminal.current?.scrollTo({ top: terminal.current.scrollHeight });
  }, [response?.upload.lines.length, response?.status.output]);
  // End of an upload: tell the rest of the Cockpit
  const wasUploading = useRef(false);
  useEffect(() => {
    if (wasUploading.current && response && !response.upload.running) onUploaded?.();
    wasUploading.current = !!response?.upload.running;
  }, [response, onUploaded]);

  const check = async () => {
    setCheckRequested(true);
    await post("/api/drive/check");
    setTimeout(() => setCheckRequested(false), CHECK_REQUEST_TIMEOUT_MS); // safety net if the check was already over
    load();
  };
  const upload = async () => {
    setConfirming(false);
    const r = await post("/api/drive/upload");
    if (r.status === 409) setError("Une vérification ou un envoi tourne déjà, réessaie dans quelques secondes.");
    load();
  };

  if (!settings.enabled)
    return (
      <section className="panel narrow">
        <h2>Drive</h2>
        <p className="muted">
          Fonction Drive désactivée (section <code>drive</code> de la configuration).
        </p>
      </section>
    );
  if (!response)
    return (
      <section className="panel narrow">
        <h2>Drive</h2>
        <p className="muted">{error ?? "Lecture de l'état du Drive…"}</p>
      </section>
    );
  const { status, upload: run } = response;
  const checking = status.running || checkRequested;
  const command = settings.commandName;
  const text = run.running
    ? "Envoi en cours…"
    : checking
      ? "Vérification en cours…"
      : {
          upToDate: "Le Drive est identique à ton dossier.",
          pending: `Changements à envoyer : ${status.detail}.`,
          checking: "Vérification en cours…",
          unknown: "État inconnu pour l'instant.",
        }[status.state];
  const fileCount = status.files.added.length + status.files.modified.length + status.files.deleted.length;
  const lines = run.lines.length
    ? run.lines
    : status.output
      ? [`$ ${command} -n`, ...status.output.split("\n")]
      : [`$ ${command} -n`, "(pas encore de vérification)"];

  return (
    <section className="panel narrow drive">
      <h2>
        Drive <span className="muted">{settings.remoteLabel}</span>
      </h2>

      <div className={`drive-status ${checking || run.running ? "busy" : STATE_CLASS[status.state]}`} aria-live="polite">
        <span className={`status-icon${checking || run.running ? " spinning" : ""}`}>
          <Icon
            name={checking || run.running ? "refresh" : status.state === "upToDate" ? "ok" : status.state === "pending" ? "alert" : "drive"}
            size={28}
          />
        </span>
        <div>
          <b>{text}</b>
          <small>
            {status.checkedAt ? `Dernière vérification à ${clockTime(status.checkedAt, language)}` : "Pas encore vérifié"}
            {run.finishedAt && !run.running
              ? ` · dernier envoi à ${clockTime(run.finishedAt, language)}${run.exitCode === 0 ? "" : " (en erreur)"}`
              : ""}
          </small>
        </div>
      </div>

      {status.state === "pending" && !checking && fileCount > 0 && (
        <details className="drive-files">
          <summary>Voir les {plural(fileCount, "fichier")}</summary>
          {(Object.keys(LIST_TITLES) as (keyof DriveFiles)[]).map(
            (list) =>
              status.files[list].length > 0 && (
                <div key={list}>
                  <b>{LIST_TITLES[list]}</b>
                  <ul>
                    {status.files[list].map((f) => (
                      <li key={f} className="mono">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
        </details>
      )}

      <div className="actions-drive">
        <button className={`button${checking ? " active" : ""}`} onClick={check} disabled={checking || run.running}>
          <span className={checking ? "spinning" : ""}>
            <Icon name="refresh" size={14} />
          </span>{" "}
          {checking ? "Vérification…" : "Vérifier maintenant"}
        </button>
        {!confirming ? (
          <button
            className="button peach"
            onClick={() => setConfirming(true)}
            disabled={run.running || checking || status.state !== "pending"}
          >
            <Icon name="drive" size={14} /> Envoyer sur le Drive{status.state === "pending" ? ` (${status.detail})` : ""}
          </button>
        ) : (
          <span className="confirmation">
            {status.files.deleted.length > 0 && (
              <small className="warning">
                {plural(status.files.deleted.length, "fichier")} {status.files.deleted.length > 1 ? "seront supprimés" : "sera supprimé"} du
                Drive.
              </small>
            )}
            <button className="button" onClick={() => setConfirming(false)}>
              Annuler
            </button>
            <button className="button peach" onClick={upload}>
              Confirmer l'envoi
            </button>
          </span>
        )}
        {settings.webUrl && (
          <a className="button" href={settings.webUrl} target="_blank" rel="noreferrer">
            <Icon name="external" size={14} /> Ouvrir dans Google Drive
          </a>
        )}
      </div>
      {error && <p className="message error">{error}</p>}

      <div className="terminal">
        <div className="terminal-bar">
          <i />
          <i />
          <i />
          <span className="mono">{command}</span>
          {(run.running || checking) && <span className="live">en cours</span>}
        </div>
        <pre ref={terminal} className="mono" aria-label={`Sortie de ${command}`}>
          {lines.map((line, i) => (
            <span
              key={i}
              className={line.startsWith("$") ? "prompt" : /^\s*✓|✅/.test(line) ? "ok" : /✗|⚠️|erreur/i.test(line) ? "fail" : ""}
            >
              {line}
              {"\n"}
            </span>
          ))}
          {(run.running || checking) && <span className="cursor">▌</span>}
        </pre>
      </div>
      <p className="muted small">
        Le Cockpit ne peut lancer que <code>{command}</code> : vérification (<code>-n</code>, rien n'est modifié) ou envoi après
        confirmation (<code>-y</code>). Pour le reste, le terminal habituel.
      </p>
    </section>
  );
}

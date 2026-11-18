// Local server of the Cockpit (listens on 127.0.0.1 only).
//   GET  /api/config                    public configuration for the interface (no secret, no absolute path)
//   GET  /api/today[?date=]             "Aujourd'hui" space (school of the day, active projects, tasks, journal)
//   GET  /api/school[?date=]            "École" space
//   GET  /api/projects                  dev projects + code folders without a sheet
//   GET  /api/personal                  personal folders + recent notes
//   GET  /api/activity                  journal + activity over 90 days
//   GET  /api/search?q=                 search in the vault (never excluded nor private folders)
//   GET  /api/calendar?from=&to=        courses, exams and appointments over a period (120 days max)
//   GET  /api/schedule                  source of the course schedule
//   GET  /api/drive                     Drive status + upload in progress (live output)
//   GET  /api/google                    Google sync status; /connect → OAuth consent; /callback ← Google's answer
//   POST /api/agenda                    { date, start, end, type: "appointment"|"exam", title, place, module, note }
//   POST /api/agenda/update             { id, date, start, end, type, title, place, module, note }
//   POST /api/agenda/remove             { id }
//   POST /api/open-note                 { link: "obsidian://open?vault=…" } → opens the note and shows Obsidian
//   POST /api/open-folder               { path: "~/github/portfolio" } → opens a known code folder in the editor
//   POST /api/google/sync               synchronizes now
//   POST /api/drive/check               runs the Drive check again (command -n)
//   POST /api/drive/upload              uploads (command -y), the only command the Cockpit can run
//   anything else                       compiled interface (dist/)
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { ConfigError, config, expandHome, loadConfigFromDisk, PROJECT_ROOT, publicConfig, setConfig } from "./config.ts";
import { isIsoDate } from "./core/dates.ts";
import { isAllowedNoteLink } from "./core/markdown.ts";

// The configuration is loaded BEFORE any other module of the Cockpit runs.
try {
  const { config: loaded, warnings } = loadConfigFromDisk();
  setConfig(loaded);
  for (const warning of warnings) console.warn(`Attention : ${warning}`);
} catch (e) {
  console.error(e instanceof ConfigError ? e.message : e);
  process.exit(1);
}

const { addEvent, removeEvent, updateEvent } = await import("./agenda.ts");
const { releasePhoneRow } = await import("./google/files.ts");
const { buildCalendar } = await import("./calendar.ts");
const { openInEditor, openInObsidian } = await import("./desktop.ts");
const { checkDrive, driveStatus, startUpload, uploadStatus } = await import("./drive.ts");
const { authorizationUrl, completeAuthorization } = await import("./google/auth.ts");
const { googleStatus, syncGoogle, syncGoogleSoon } = await import("./google/sync.ts");
const { allowedFolders, buildProjects } = await import("./projects/projects.ts");
const { buildSchoolData } = await import("./school/school-data.ts");
const { refreshSchedule, scheduleSource } = await import("./school/schedule.ts");
const { buildToday } = await import("./today.ts");
const { buildActivity } = await import("./vault/journal.ts");
const { buildPersonalData } = await import("./vault/personal.ts");
const { search } = await import("./vault/search.ts");

const DIST = join(PROJECT_ROOT, "dist/");
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
};
const MAX_BODY_BYTES = 10_000;

/** Only the Cockpit page can ask for actions (another website open in the browser is refused). */
const originAllowed = (req: IncomingMessage) => !req.headers.origin || config().server.allowedOrigins.includes(req.headers.origin);

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) req.destroy(new Error("corps de requête trop gros"));
    });
    req.on("end", () => {
      try {
        const value = JSON.parse(body || "{}");
        resolve(typeof value === "object" && value ? value : {});
      } catch {
        reject(new HttpError(400, "JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sendJson(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}
function sendText(res: ServerResponse, status: number, text = ""): void {
  res.writeHead(status, text ? { "content-type": "text/plain; charset=utf-8" } : {});
  res.end(text);
}
function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location });
  res.end();
}

async function handleGet(url: URL, res: ServerResponse): Promise<boolean> {
  const date = url.searchParams.get("date");
  const forcedDate = date && isIsoDate(date) ? date : undefined;
  switch (url.pathname) {
    case "/api/config":
      sendJson(res, publicConfig());
      return true;
    case "/api/today":
      sendJson(res, await buildToday(forcedDate));
      return true;
    case "/api/school":
      sendJson(res, buildSchoolData(forcedDate));
      return true;
    case "/api/projects":
      sendJson(res, await buildProjects());
      return true;
    case "/api/personal":
      sendJson(res, buildPersonalData());
      return true;
    case "/api/activity":
      sendJson(res, await buildActivity());
      return true;
    case "/api/search":
      sendJson(res, search(url.searchParams.get("q") ?? ""));
      return true;
    case "/api/schedule":
      sendJson(res, scheduleSource());
      return true;
    case "/api/drive":
      sendJson(res, { status: driveStatus(), upload: uploadStatus() });
      return true;
    case "/api/google":
      sendJson(res, googleStatus());
      return true;
    case "/api/calendar": {
      const from = url.searchParams.get("from") ?? "",
        to = url.searchParams.get("to") ?? "";
      if (!isIsoDate(from) || !isIsoDate(to)) throw new HttpError(400, "from et to au format AAAA-MM-JJ");
      sendJson(res, buildCalendar(from, to));
      return true;
    }
    case "/api/google/connect":
      redirect(res, authorizationUrl());
      return true;
    case "/api/google/callback": {
      const code = url.searchParams.get("code"),
        state = url.searchParams.get("state") ?? "";
      let message = "Google est connecté : la synchronisation démarre.";
      try {
        if (!code) throw new Error(url.searchParams.get("error") ?? "réponse sans code");
        await completeAuthorization(code, state);
        syncGoogle();
      } catch (e) {
        message = `Connexion Google impossible : ${(e as Error).message}`;
      }
      redirect(res, `/?google=${encodeURIComponent(message)}#today/calendar`);
      return true;
    }
  }
  return false;
}

async function handlePost(url: URL, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!originAllowed(req)) throw new HttpError(403, "Origine refusée");
  switch (url.pathname) {
    case "/api/google/sync":
      syncGoogle();
      sendText(res, 202);
      return true;
    case "/api/drive/check":
      checkDrive();
      sendText(res, 202);
      return true;
    case "/api/drive/upload":
      sendText(res, startUpload() ? 202 : 409);
      return true;
    case "/api/agenda": {
      const result = await addEvent(await readBody(req));
      if (!result.ok) throw new HttpError(result.duplicate ? 409 : 400, result.error);
      syncGoogleSoon();
      sendText(res, 201);
      return true;
    }
    case "/api/agenda/update": {
      const { id, ...fields } = await readBody(req);
      const result = await updateEvent(id, fields);
      if (!result.ok) throw new HttpError("notFound" in result ? 404 : result.duplicate ? 409 : 400, result.error);
      if (config().google.enabled) await releasePhoneRow(String(id));
      syncGoogleSoon();
      sendText(res, 200);
      return true;
    }
    case "/api/agenda/remove": {
      const removed = await removeEvent((await readBody(req)).id);
      if (removed) syncGoogleSoon();
      sendText(res, removed ? 204 : 404);
      return true;
    }
    case "/api/open-note": {
      const { link } = await readBody(req);
      if (!isAllowedNoteLink(link)) throw new HttpError(400, "Lien refusé : seulement obsidian://open vers le coffre configuré.");
      openInObsidian(link);
      sendText(res, 204);
      return true;
    }
    case "/api/open-folder": {
      const { path } = await readBody(req);
      const absolute = typeof path === "string" ? expandHome(path) : "";
      if (!absolute || !(await allowedFolders()).has(absolute))
        throw new HttpError(400, "Dossier refusé : seulement les dossiers de code connus du Cockpit.");
      await openInEditor(absolute);
      sendText(res, 204);
      return true;
    }
  }
  return false;
}

/** Files of the compiled interface (unknown paths fall back to index.html). */
function serveInterface(url: URL, res: ServerResponse): void {
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, requested);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  if (!existsSync(file)) return sendText(res, 503, "Interface pas encore compilée : lance « npm run build » dans le dossier du projet.");
  res.writeHead(200, { "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (req.method === "GET" && (await handleGet(url, res))) return;
    if (req.method === "POST" && (await handlePost(url, req, res))) return;
    if (url.pathname.startsWith("/api/")) return sendText(res, 404, "Route inconnue");
    serveInterface(url, res);
  } catch (e) {
    if (e instanceof HttpError) return sendText(res, e.status, e.message);
    console.error(e);
    sendText(res, 500, `Erreur du Cockpit : ${(e as Error).message}`);
  }
});

// Online schedule and Google sync: at startup, then every N hours; phone events read every few minutes
const { schedule, google, server: settings } = config();
refreshSchedule().then(syncGoogle);
setInterval(() => refreshSchedule().then(syncGoogle), schedule.refreshHours * 3_600_000);
if (google.enabled) setInterval(syncGoogle, google.pollMinutes * 60_000);
server.listen(settings.port, settings.host, () => console.log(`Cockpit : http://localhost:${settings.port}`));

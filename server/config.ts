// Configuration of the Cockpit: one JSON file (comments allowed) + a few environment variables.
//
//   cockpit.config.json          your values (ignored by git) — copy cockpit.config.example.json
//   COCKPIT_CONFIG=/path.json    use another configuration file
//   COCKPIT_PORT=4321            override server.port
//   COCKPIT_VAULT=~/vault        override vault.path
//
// Every value has a default except vault.path. The file is validated at startup: errors stop the
// server with a clear message, optional features (drive, google, desktop) are switched off with a warning.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PublicConfig } from "../shared/types.ts";

const HOME = homedir();
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** "~/vault" → "/home/user/vault" */
export const expandHome = (path: string): string => path.trim().replace(/^~(?=\/|$)/, HOME);
/** "/home/user/vault" → "~/vault" (for display) */
export const toTilde = (path: string): string => (path.startsWith(HOME) ? `~${path.slice(HOME.length)}` : path);

// ---------------------------------------------------------------- shape

export interface CodeRoot {
  path: string;
  depth: 1 | 2;
}
export interface CodeRule {
  pattern: RegExp;
  code: string;
}
export interface NonModuleCourse {
  label: string;
  note: string;
}

export interface Config {
  configFile: string | null;
  server: { host: string; port: number; allowedOrigins: string[] };
  locale: { language: string; timeZone: string };
  vault: {
    path: string;
    name: string;
    excludedFolders: string[];
    privateFolderName: string;
    schoolFolder: string;
    assistantFolder: string; // notes written by the assistant (journal, project sheets…)
    personalFolder: string;
    journalFolder: string;
    projectsFolder: string;
    agendaFile: string;
    gradesFile: string;
  };
  school: {
    yearFolderPattern: RegExp;
    finishedFolderName: string;
    moduleNotePattern: RegExp; // capture group 1 = module code
    sequenceFilePattern: RegExp; // capture group 1 = sequence number
    examLinePattern: RegExp; // groups: 1 = checkbox, 2 = exam name, 3 = French date text
    frontmatter: { category: string; color: string; examDone: string };
    daysShown: number;
    activeWindowDays: { past: number; future: number };
    downloadsFolder: string;
    coursePdfPattern: RegExp; // groups: 1 = title, 2 = module code
    neutralColor: string;
    fallbackColors: Record<string, string>;
    nonModuleCourses: Record<string, NonModuleCourse>;
  };
  schedule: {
    url: string | null;
    cacheFile: string;
    fallbackFile: string | null;
    refreshHours: number;
    periodMinutes: number;
    excludedCodes: string[];
    codeRules: CodeRule[];
    roomPrefixPattern: RegExp | null; // removed from the start of the room name
  };
  journal: { requestLabel: string; nextStepLabel: string };
  projects: {
    codeRoots: CodeRoot[];
    frontmatter: {
      space: string;
      spaceValue: string;
      folder: string;
      linkedFolders: string;
      nextStep: string;
      knowledgeBase: string;
      repository: string;
      status: string;
      updated: string;
    };
    archivedStatusPattern: RegExp;
    sheetSuffix: string; // removed from the sheet file name to get the project name
  };
  drive: { enabled: boolean; command: string; remoteLabel: string; checkEveryMinutes: number };
  desktop: {
    enabled: boolean; // Hyprland window handling (only if HYPRLAND_INSTANCE_SIGNATURE is set)
    launcher: string; // prefix used to start apps through Hyprland, e.g. "app2unit --"
    obsidian: { command: string; windowClass: string; workspace: number | null };
    editor: { command: string; windowClass: string };
  };
  google: {
    enabled: boolean;
    secretsFolder: string;
    pastDays: number;
    futureDays: number;
    pollMinutes: number;
    calendars: { courses: { name: string; description: string }; personal: { name: string; description: string } };
  };
}

// ---------------------------------------------------------------- defaults

const DEFAULTS = {
  server: { host: "127.0.0.1", port: 4321, allowedOrigins: [] as string[] },
  locale: { language: "fr-CH", timeZone: "Europe/Zurich" },
  vault: {
    path: "",
    name: "",
    excludedFolders: [] as string[],
    privateFolderName: "_privé",
    schoolFolder: "École",
    assistantFolder: "-Perso/Claude",
    personalFolder: "-Perso",
    journalFolder: "-Perso/Claude/Journal",
    projectsFolder: "-Perso/Claude/Projets",
    agendaFile: "-Perso/Agenda.md",
    gradesFile: "École/_privé/Notes d'examen.md",
  },
  school: {
    yearFolderPattern: "\\d+(ère|ème) année$",
    finishedFolderName: "_Terminés",
    moduleNotePattern: "^-(M\\d+).*\\.md$",
    sequenceFilePattern: "^Séquence (\\d+).*\\.md$",
    examLinePattern: "^- \\[( |x|X)\\] (Test \\d+)\\s*[—–-]\\s*(.*)$",
    frontmatter: { category: "catégorie", color: "couleur", examDone: "examen passé" },
    daysShown: 14,
    activeWindowDays: { past: 14, future: 30 },
    downloadsFolder: "~/Downloads",
    coursePdfPattern: "^(.*?) - (M\\d+) — ",
    neutralColor: "#94aca8",
    fallbackColors: {} as Record<string, string>,
    nonModuleCourses: {} as Record<string, NonModuleCourse>,
  },
  schedule: {
    url: null as string | null,
    cacheFile: "~/.cache/cockpit/schedule.ics",
    fallbackFile: null as string | null,
    refreshHours: 6,
    periodMinutes: 45,
    excludedCodes: [] as string[],
    codeRules: [] as { pattern: string; flags?: string; code: string }[],
    roomPrefixPattern: "",
  },
  journal: { requestLabel: "Demande", nextStepLabel: "Prochaine[s]? étape" },
  projects: {
    codeRoots: [] as CodeRoot[],
    frontmatter: {
      space: "espace",
      spaceValue: "projets",
      folder: "dossier",
      linkedFolders: "dossiers-lies",
      nextStep: "prochaine-etape",
      knowledgeBase: "kb",
      repository: "depot",
      status: "statut",
      updated: "updated",
    },
    archivedStatusPattern: "archiv",
    sheetSuffix: " — contexte",
  },
  drive: { enabled: false, command: "", remoteLabel: "", checkEveryMinutes: 15 },
  desktop: {
    enabled: true,
    launcher: "app2unit --",
    obsidian: { command: "obsidian", windowClass: "^(md\\.obsidian\\.Obsidian)$", workspace: null as number | null },
    editor: { command: "code", windowClass: "^([Cc]ode(-url-handler)?)$" },
  },
  google: {
    enabled: false,
    secretsFolder: "~/.config/cockpit",
    pastDays: 30,
    futureDays: 400,
    pollMinutes: 3,
    calendars: {
      courses: { name: "Cours", description: "Horaire de cours synchronisé par le Cockpit." },
      personal: { name: "Perso", description: "Rendez-vous et examens du Cockpit." },
    },
  },
};

/** Folders that are never read, whatever the configuration says. */
const ALWAYS_EXCLUDED = [".obsidian/", ".trash/", ".git/"];

// ---------------------------------------------------------------- JSONC + merge

/** JSON with // and /* *\/ comments and trailing commas (comments inside strings are kept). */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i++;
      } else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep merge: objects are merged, everything else (arrays included) is replaced. */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override === undefined ? base : override) as T;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) result[key] = key in result ? deepMerge(result[key], value) : value;
  return result as T;
}

// ---------------------------------------------------------------- validation

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Configuration invalide :\n${problems.map((p) => `  • ${p}`).join("\n")}`);
    this.problems = problems;
  }
}

export interface LoadResult {
  config: Config;
  warnings: string[];
}

/** Builds and validates the configuration from a raw object (the parsed file). Pure: used by tests too. */
export function buildConfig(
  raw: unknown,
  options: { env?: NodeJS.ProcessEnv; configFile?: string | null; checkPaths?: boolean } = {},
): LoadResult {
  const env = options.env ?? {};
  const checkPaths = options.checkPaths ?? true;
  const problems: string[] = [];
  const warnings: string[] = [];
  if (raw !== undefined && !isPlainObject(raw)) throw new ConfigError(["le fichier doit contenir un objet JSON { … }"]);
  const merged = deepMerge(structuredClone(DEFAULTS), raw ?? {});
  if (env.COCKPIT_PORT) merged.server.port = Number(env.COCKPIT_PORT);
  if (env.COCKPIT_VAULT) merged.vault.path = env.COCKPIT_VAULT;

  const regex = (key: string, source: string, flags = ""): RegExp => {
    try {
      return new RegExp(source, flags);
    } catch (e) {
      problems.push(`${key} : expression régulière invalide (${(e as Error).message})`);
      return /$^/;
    }
  };
  const positive = (key: string, value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      problems.push(`${key} : nombre positif attendu (reçu ${JSON.stringify(value)})`);
    return Number(value);
  };
  const text = (key: string, value: unknown, required = true): string => {
    if (typeof value !== "string" || (required && !value.trim())) problems.push(`${key} : texte attendu`);
    return typeof value === "string" ? value : "";
  };
  const color = (key: string, value: unknown): string => {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) problems.push(`${key} : couleur au format #RRGGBB attendue`);
    return String(value);
  };

  // server
  const port = merged.server.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    problems.push(`server.port : port entre 1 et 65535 attendu (reçu ${JSON.stringify(port)})`);

  // vault (the only required value)
  const vaultPath = expandHome(text("vault.path", merged.vault.path));
  if (vaultPath && checkPaths && !existsSync(vaultPath)) problems.push(`vault.path : dossier introuvable (${vaultPath})`);
  const folder = (key: string, value: unknown) => text(key, value).replace(/^\/+|\/+$/g, "");
  const excluded = [
    ...new Set([...ALWAYS_EXCLUDED, ...(Array.isArray(merged.vault.excludedFolders) ? merged.vault.excludedFolders : [])]),
  ].map((f) => String(f).replace(/^\/+/, "").replace(/\/?$/, "/"));

  // school
  const s = merged.school;
  for (const [code, c] of Object.entries(s.fallbackColors)) color(`school.fallbackColors.${code}`, c);
  for (const [code, c] of Object.entries(s.nonModuleCourses)) {
    text(`school.nonModuleCourses.${code}.label`, c?.label);
    text(`school.nonModuleCourses.${code}.note`, c?.note);
  }

  // schedule
  const sc = merged.schedule;
  if (sc.url !== null && !/^https?:\/\//.test(String(sc.url))) problems.push("schedule.url : adresse http(s) attendue, ou null");
  const fallback = sc.fallbackFile ? expandHome(sc.fallbackFile) : null;
  if (!sc.url && !fallback) warnings.push("schedule : ni « url » ni « fallbackFile » : aucun horaire ne sera affiché");
  const codeRules = (Array.isArray(sc.codeRules) ? sc.codeRules : []).map((r, i) => ({
    pattern: regex(`schedule.codeRules[${i}].pattern`, text(`schedule.codeRules[${i}].pattern`, r?.pattern), r?.flags ?? "i"),
    code: text(`schedule.codeRules[${i}].code`, r?.code),
  }));

  // projects
  const roots = (Array.isArray(merged.projects.codeRoots) ? merged.projects.codeRoots : []).map((r, i) => {
    if (r?.depth !== 1 && r?.depth !== 2) problems.push(`projects.codeRoots[${i}].depth : 1 ou 2 attendu`);
    return { path: expandHome(text(`projects.codeRoots[${i}].path`, r?.path)), depth: r?.depth === 2 ? 2 : 1 } as CodeRoot;
  });

  // optional features: switched off with a warning when they cannot work
  const drive = { ...merged.drive, command: merged.drive.command ? expandHome(merged.drive.command) : "" };
  if (drive.enabled && (!drive.command || (checkPaths && !existsSync(drive.command)))) {
    warnings.push(`drive : commande introuvable (${drive.command || "drive.command vide"}), fonction Drive désactivée`);
    drive.enabled = false;
  }
  const google = { ...merged.google, secretsFolder: expandHome(merged.google.secretsFolder) };

  const config: Config = {
    configFile: options.configFile ?? null,
    server: {
      host: text("server.host", merged.server.host),
      port,
      allowedOrigins: [`http://localhost:${port}`, `http://127.0.0.1:${port}`, "http://localhost:5173", ...merged.server.allowedOrigins],
    },
    locale: { language: text("locale.language", merged.locale.language), timeZone: text("locale.timeZone", merged.locale.timeZone) },
    vault: {
      path: vaultPath,
      name: merged.vault.name || basename(vaultPath),
      excludedFolders: excluded,
      privateFolderName: text("vault.privateFolderName", merged.vault.privateFolderName),
      schoolFolder: folder("vault.schoolFolder", merged.vault.schoolFolder),
      assistantFolder: folder("vault.assistantFolder", merged.vault.assistantFolder),
      personalFolder: folder("vault.personalFolder", merged.vault.personalFolder),
      journalFolder: folder("vault.journalFolder", merged.vault.journalFolder),
      projectsFolder: folder("vault.projectsFolder", merged.vault.projectsFolder),
      agendaFile: text("vault.agendaFile", merged.vault.agendaFile),
      gradesFile: text("vault.gradesFile", merged.vault.gradesFile),
    },
    school: {
      yearFolderPattern: regex("school.yearFolderPattern", s.yearFolderPattern),
      finishedFolderName: text("school.finishedFolderName", s.finishedFolderName),
      moduleNotePattern: regex("school.moduleNotePattern", s.moduleNotePattern),
      sequenceFilePattern: regex("school.sequenceFilePattern", s.sequenceFilePattern),
      examLinePattern: regex("school.examLinePattern", s.examLinePattern, "gm"),
      frontmatter: {
        category: text("school.frontmatter.category", s.frontmatter.category),
        color: text("school.frontmatter.color", s.frontmatter.color),
        examDone: text("school.frontmatter.examDone", s.frontmatter.examDone),
      },
      daysShown: positive("school.daysShown", s.daysShown),
      activeWindowDays: {
        past: positive("school.activeWindowDays.past", s.activeWindowDays.past),
        future: positive("school.activeWindowDays.future", s.activeWindowDays.future),
      },
      downloadsFolder: expandHome(text("school.downloadsFolder", s.downloadsFolder)),
      coursePdfPattern: regex("school.coursePdfPattern", s.coursePdfPattern),
      neutralColor: color("school.neutralColor", s.neutralColor),
      fallbackColors: Object.fromEntries(Object.entries(s.fallbackColors).map(([k, v]) => [k.toUpperCase(), v])),
      nonModuleCourses: s.nonModuleCourses,
    },
    schedule: {
      url: sc.url,
      cacheFile: expandHome(text("schedule.cacheFile", sc.cacheFile)),
      fallbackFile: fallback,
      refreshHours: positive("schedule.refreshHours", sc.refreshHours),
      periodMinutes: positive("schedule.periodMinutes", sc.periodMinutes),
      excludedCodes: Array.isArray(sc.excludedCodes) ? sc.excludedCodes.map(String) : [],
      codeRules,
      roomPrefixPattern: sc.roomPrefixPattern ? regex("schedule.roomPrefixPattern", String(sc.roomPrefixPattern)) : null,
    },
    journal: {
      requestLabel: text("journal.requestLabel", merged.journal.requestLabel),
      nextStepLabel: text("journal.nextStepLabel", merged.journal.nextStepLabel),
    },
    projects: {
      codeRoots: roots,
      frontmatter: merged.projects.frontmatter,
      archivedStatusPattern: regex("projects.archivedStatusPattern", merged.projects.archivedStatusPattern, "i"),
      sheetSuffix: String(merged.projects.sheetSuffix ?? ""),
    },
    drive: {
      enabled: !!drive.enabled,
      command: drive.command,
      remoteLabel: String(drive.remoteLabel ?? ""),
      checkEveryMinutes: positive("drive.checkEveryMinutes", drive.checkEveryMinutes),
    },
    desktop: {
      enabled: !!merged.desktop.enabled,
      launcher: String(merged.desktop.launcher ?? ""),
      obsidian: {
        command: text("desktop.obsidian.command", merged.desktop.obsidian.command),
        windowClass: regex("desktop.obsidian.windowClass", merged.desktop.obsidian.windowClass).source,
        workspace:
          merged.desktop.obsidian.workspace === null ? null : positive("desktop.obsidian.workspace", merged.desktop.obsidian.workspace),
      },
      editor: {
        command: text("desktop.editor.command", merged.desktop.editor.command),
        windowClass: regex("desktop.editor.windowClass", merged.desktop.editor.windowClass).source,
      },
    },
    google: {
      enabled: !!google.enabled,
      secretsFolder: google.secretsFolder,
      pastDays: positive("google.pastDays", google.pastDays),
      futureDays: positive("google.futureDays", google.futureDays),
      pollMinutes: positive("google.pollMinutes", google.pollMinutes),
      calendars: {
        courses: {
          name: text("google.calendars.courses.name", google.calendars.courses.name),
          description: String(google.calendars.courses.description ?? ""),
        },
        personal: {
          name: text("google.calendars.personal.name", google.calendars.personal.name),
          description: String(google.calendars.personal.description ?? ""),
        },
      },
    },
  };
  if (problems.length) throw new ConfigError(problems);
  return { config, warnings };
}

/** Reads the configuration file (COCKPIT_CONFIG or ./cockpit.config.json). */
export function loadConfigFromDisk(env: NodeJS.ProcessEnv = process.env): LoadResult {
  const file = env.COCKPIT_CONFIG ? resolve(expandHome(env.COCKPIT_CONFIG)) : resolve(PROJECT_ROOT, "cockpit.config.json");
  if (!existsSync(file)) {
    throw new ConfigError([
      `fichier de configuration introuvable : ${file}`,
      "copie cockpit.config.example.json en cockpit.config.json et remplis au moins vault.path",
    ]);
  }
  let raw: unknown;
  try {
    raw = parseJsonc(readFileSync(file, "utf8"));
  } catch (e) {
    throw new ConfigError([`${file} : JSON illisible (${(e as Error).message})`]);
  }
  return buildConfig(raw, { env, configFile: file });
}

// ---------------------------------------------------------------- current configuration

let current: Config | null = null;

/** Configuration in use (loaded once at startup by main.ts, or injected by tests). */
export function config(): Config {
  if (!current) throw new Error("Configuration not loaded: call setConfig() first");
  return current;
}
export const setConfig = (c: Config): void => {
  current = c;
};

export function publicConfig(c: Config = config()): PublicConfig {
  return {
    vaultName: c.vault.name,
    language: c.locale.language,
    agendaFile: c.vault.agendaFile,
    gradesFile: c.vault.gradesFile,
    projectsFolder: c.vault.projectsFolder,
    drive: { enabled: c.drive.enabled, remoteLabel: c.drive.remoteLabel, commandName: basename(c.drive.command || "") },
    google: {
      enabled: c.google.enabled,
      personalCalendar: c.google.calendars.personal.name,
      coursesCalendar: c.google.calendars.courses.name,
    },
  };
}

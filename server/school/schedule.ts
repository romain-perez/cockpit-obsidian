// Course schedule: an online .ics calendar kept in a local cache, with a local fallback file.
import { existsSync, readFileSync, statSync } from "node:fs";
import { config } from "../config.ts";
import { formatClock } from "../core/dates.ts";
import { writeFileAtomic } from "../core/safe-write.ts";
import type { ScheduleSource } from "../../shared/types.ts";

export interface Period {
  code: string; // "M165", "MATH"
  date: string; // "2026-11-17"
  start: string; // "07:55"
  end: string; // "08:40"
  room: string;
  teacher: string;
}

let lastError: string | null = null;
let cache: { file: string; mtime: number; periods: Period[] } | null = null;

/** Downloads the online calendar into the cache (silent when offline: the existing cache stays). */
export async function refreshSchedule(): Promise<void> {
  const { url, cacheFile } = config().schedule;
  if (!url) return;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (!text.includes("BEGIN:VCALENDAR") || !text.includes("BEGIN:VEVENT")) throw new Error("la réponse n'est pas un calendrier");
    writeFileAtomic(cacheFile, text);
    cache = null;
    lastError = null;
  } catch (e) {
    lastError = (e as Error).message;
    console.error("Horaire en ligne indisponible :", lastError);
  }
}

/** File actually used: the cache of the online calendar, else the fallback file. */
export function scheduleSource(): ScheduleSource {
  const { cacheFile, fallbackFile } = config().schedule;
  const file = existsSync(cacheFile) ? cacheFile : fallbackFile && existsSync(fallbackFile) ? fallbackFile : null;
  return {
    file,
    online: file === cacheFile,
    updatedAt: file ? statSync(file).mtime.toISOString() : null,
    error: lastError,
  };
}

/** Course title → short code: "M165 Utiliser des bases…" → M165, then the configured rules, then the title itself. */
export function courseCode(title: string): string {
  const module = title.match(/^(M\d{3})\b/)?.[1];
  if (module) return module;
  for (const rule of config().schedule.codeRules) if (rule.pattern.test(title)) return rule.code;
  return title.split(" /")[0].trim(); // older export format: "M165 / class1, class2"
}

const unescapeIcs = (value: string) =>
  value
    .replace(/\\n/g, " ")
    .replace(/\\([,;\\])/g, "$1")
    .trim();

/** Parses .ics text into periods (excluded courses removed), sorted by date and time. Pure: used by tests. */
export function parseIcs(text: string): Period[] {
  const { excludedCodes, periodMinutes, roomPrefixPattern } = config().schedule;
  const excluded = new Set(excludedCodes);
  // Long .ics lines are folded: the next line starts with a space
  const unfolded = text.replace(/\r/g, "").replace(/\n[ \t]/g, "");
  const periods: Period[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const field = (name: string) => block.match(new RegExp(`^${name}[^:\\n]*:(.*)$`, "m"))?.[1].trim() ?? "";
    const start = field("DTSTART"); // 20261117T075500
    if (!/^\d{8}T\d{4}/.test(start)) continue; // whole-day events are not courses
    const code = courseCode(unescapeIcs(field("SUMMARY")));
    if (!code || excluded.has(code)) continue;
    const end = field("DTEND");
    const startClock = start.slice(9, 13);
    // Description of the school calendar: "Teacher Name \; F119 - F119 Labo ICT"
    const description = unescapeIcs(field("DESCRIPTION")).replace(/_{3,}.*$/, "");
    const teacher = description.includes(";")
      ? description.split(";")[0].trim()
      : /^[A-ZÀ-Ý][\p{L}-]+ [A-ZÀ-Ý][\p{L}-]+$/u.test(description)
        ? description
        : "";
    periods.push({
      code,
      date: `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`,
      start: formatClock(startClock),
      end: /^\d{8}T\d{4}/.test(end) ? formatClock(end.slice(9, 13)) : formatClock(startClock, periodMinutes),
      room: unescapeIcs(field("LOCATION"))
        .replace(roomPrefixPattern ?? /$^/, "")
        .split(" [")[0],
      teacher,
    });
  }
  return periods.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** Every period of the schedule (parsed once per file version). */
export function readPeriods(): Period[] {
  const { file } = scheduleSource();
  if (!file) return [];
  const mtime = statSync(file).mtimeMs;
  if (cache && cache.file === file && cache.mtime === mtime) return cache.periods;
  const periods = parseIcs(readFileSync(file, "utf8"));
  cache = { file, mtime, periods };
  return periods;
}

/** Merges consecutive periods of the same course on one day into blocks. */
export function blocksOfDay(periods: Period[], date: string): Period[] {
  const blocks: Period[] = [];
  for (const period of periods) {
    if (period.date !== date) continue;
    const last = blocks.at(-1);
    if (last && last.code === period.code) last.end = period.end;
    else blocks.push({ ...period });
  }
  return blocks;
}

// Google Calendar sync, both ways for the personal calendar:
//   Cockpit → Google : courses ("Cours…") and agenda + module exams ("Perso"), events marked as created by the Cockpit
//   phone → Cockpit  : events created on the phone in "Perso" become agenda rows (added, changed, removed)
// The Cockpit never changes on Google an event it did not create.
import { config } from "../config.ts";
import { addDays, oneHourLater, today } from "../core/dates.ts";
import { sha1Hex } from "../core/hash.ts";
import { updateJson, writeJsonAtomic } from "../core/safe-write.ts";
import { lastDay, readAgenda, removeEvent, upsertEvent } from "../agenda.ts";
import { readModules } from "../school/modules.ts";
import { blocksOfDay, readPeriods } from "../school/schedule.ts";
import { getAccessToken } from "./auth.ts";
import {
  googleFile,
  hasClient,
  isConnected,
  readCalendarIds,
  readPhoneEvents,
  RELEASED_PREFIX,
  type CalendarKey,
  type PhoneEvents,
} from "./files.ts";
import type { AgendaEvent, GoogleStatus } from "../../shared/types.ts";

const API = "https://www.googleapis.com/calendar/v3";
const COCKPIT_MARK = { private: { cockpit: "1" } };
const PARALLEL_REQUESTS = 3;

let state = { running: false, lastSync: null as string | null, summary: "", error: null as string | null };

export const googleStatus = (): GoogleStatus => ({
  ...state,
  enabled: config().google.enabled,
  hasClient: hasClient(),
  connected: isConnected(),
});

// ---------------------------------------------------------------- API calls

interface ApiResult {
  status: number;
  json: any;
}
const succeeded = (status: number) => status >= 200 && status < 300;

/** Calendar API call. Retries (5 times, growing delay) on rate limits and temporary errors. */
async function api(method: string, path: string, body?: unknown): Promise<ApiResult> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${await getAccessToken()}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    const throttled = response.status === 429 || response.status >= 500 || (response.status === 403 && /rate|quota|limit/i.test(text));
    if (!throttled || attempt >= 5) return { status: response.status, json };
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 300));
  }
}

async function listEvents(calendarId: string, from: string, timeZone?: string): Promise<any[]> {
  const events: any[] = [];
  let page: string | undefined;
  do {
    const query = new URLSearchParams({
      maxResults: "2500",
      timeMin: `${from}T00:00:00Z`,
      singleEvents: "true",
      ...(timeZone ? { timeZone } : {}),
      ...(page ? { pageToken: page } : {}),
    });
    const result = await api("GET", `/calendars/${encodeURIComponent(calendarId)}/events?${query}`);
    if (result.status !== 200) throw new Error(`Lecture du calendrier impossible (${result.status})`);
    events.push(...(result.json.items ?? []));
    page = result.json.nextPageToken;
  } while (page);
  return events;
}

/** Id of one of the two calendars, created if missing. */
async function calendarId(key: CalendarKey): Promise<string> {
  const ids = await readCalendarIds();
  const known = ids[key];
  if (known && (await api("GET", `/calendars/${encodeURIComponent(known)}`)).status === 200) return known;
  const { name, description } = config().google.calendars[key];
  const created = await api("POST", "/calendars", { summary: name, description, timeZone: config().locale.timeZone });
  if (created.status !== 200) throw new Error(`Création du calendrier « ${name} » impossible (${created.status})`);
  await updateJson<Record<string, string>>(googleFile.calendars(), (current) => ({ ...(current ?? {}), [key]: created.json.id }));
  return created.json.id;
}

// ---------------------------------------------------------------- wanted events

export interface WantedEvent {
  id: string;
  summary: string;
  location?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
}

const at = (date: string, clock: string) => ({ dateTime: `${date}T${clock}:00`, timeZone: config().locale.timeZone });
// WARNING: the texts hashed below ("cours|…", "agenda|…", "test|…") are the ids of events already on Google: never change them.
const eventId = (text: string) => sha1Hex(text);

function wantedCourses(from: string, to: string): WantedEvent[] {
  const periods = readPeriods().filter((p) => p.date >= from && p.date <= to);
  const titles = new Map(readModules().map((m) => [m.code, m.title]));
  const labels = Object.fromEntries(Object.entries(config().school.nonModuleCourses).map(([code, c]) => [code, c.label]));
  return [...new Set(periods.map((p) => p.date))].flatMap((date) =>
    blocksOfDay(periods, date).map((block) => ({
      id: eventId(`cours|${date}|${block.code}|${block.start}`),
      summary: titles.has(block.code) ? `${block.code} · ${titles.get(block.code)}` : (labels[block.code] ?? block.code),
      location: block.room,
      description: block.teacher ? `Prof : ${block.teacher}` : undefined,
      start: at(date, block.start),
      end: at(date, block.end),
    })),
  );
}

/** Agenda row → Google event (over several days: up to its last day). Pure: used by tests. */
export const agendaToWanted = (e: AgendaEvent): WantedEvent => ({
  id: eventId(`agenda|${e.id}`),
  summary: e.type === "exam" ? `📝 ${e.title}${e.module ? ` · ${e.module}` : ""}` : e.title,
  location: e.place || undefined,
  description: e.note || undefined,
  start: e.start ? at(e.date, e.start) : { date: e.date },
  end: e.start ? at(lastDay(e), e.end || oneHourLater(e.start)) : { date: addDays(lastDay(e), 1) }, // Google: whole-day end is exclusive
});

function wantedPersonal(from: string, phoneRows: Set<string>): WantedEvent[] {
  const events: WantedEvent[] = readAgenda()
    .filter((e) => lastDay(e) >= from && !phoneRows.has(e.id)) // rows from the phone stay owned by the phone
    .map(agendaToWanted);
  const periods = readPeriods();
  for (const module of readModules())
    for (const exam of module.exams) {
      if (!exam.date || exam.done || exam.date < from) continue;
      const course = periods.find((p) => p.date === exam.date && p.code === module.code);
      events.push({
        id: eventId(`test|${module.code}|${exam.name}|${exam.date}`),
        summary: `📝 ${exam.name} · ${module.code}`,
        location: course?.room,
        description: module.title,
        start: course ? at(exam.date, course.start) : { date: exam.date },
        end: course ? at(exam.date, oneHourLater(course.start)) : { date: addDays(exam.date, 1) },
      });
    }
  return events;
}

/** Created by the Cockpit? (private mark, or sha1 id of the first version) */
export const isCockpitEvent = (event: any): boolean =>
  event?.extendedProperties?.private?.cockpit === "1" || /^[0-9a-f]{40}$/.test(event?.id ?? "");

export const sameEvent = (wanted: WantedEvent, existing: any): boolean =>
  wanted.summary === existing.summary &&
  (wanted.location ?? "") === (existing.location ?? "") &&
  (wanted.description ?? "") === (existing.description ?? "") &&
  (wanted.start.dateTime ?? wanted.start.date) === (existing.start?.dateTime?.slice(0, 19) ?? existing.start?.date) &&
  (wanted.end.dateTime ?? wanted.end.date) === (existing.end?.dateTime?.slice(0, 19) ?? existing.end?.date);

interface Tally {
  added: number;
  updated: number;
  deleted: number;
  failed: number;
  lastError: string;
}

/** Makes the calendar match the wanted events (add, update, delete), only for events created by the Cockpit. */
async function align(calendar: string, wanted: WantedEvent[], from: string): Promise<Tally> {
  const marked = wanted.map((w) => ({ ...w, extendedProperties: COCKPIT_MARK }));
  const existing = new Map((await listEvents(calendar, from)).filter(isCockpitEvent).map((e) => [e.id, e]));
  const tally: Tally = { added: 0, updated: 0, deleted: 0, failed: 0, lastError: "" };
  const fail = (r: ApiResult) => {
    tally.failed++;
    tally.lastError = `${r.status} ${r.json?.error?.message ?? ""}`.trim();
  };
  const base = `/calendars/${encodeURIComponent(calendar)}/events`;
  const jobs: (() => Promise<void>)[] = [];
  for (const event of marked) {
    const current = existing.get(event.id);
    if (!current)
      jobs.push(async () => {
        let r = await api("POST", base, event);
        if (r.status === 409) r = await api("PUT", `${base}/${event.id}`, { ...event, status: "confirmed" }); // id of a deleted event: restore it
        if (succeeded(r.status)) tally.added++;
        else fail(r);
      });
    else if (!sameEvent(event, current))
      jobs.push(async () => {
        const r = await api("PUT", `${base}/${event.id}`, event);
        if (succeeded(r.status)) tally.updated++;
        else fail(r);
      });
  }
  const wantedIds = new Set(marked.map((e) => e.id));
  for (const id of existing.keys())
    if (!wantedIds.has(id))
      jobs.push(async () => {
        const r = await api("DELETE", `${base}/${id}`);
        if (succeeded(r.status) || r.status === 410) tally.deleted++;
        else fail(r);
      });
  for (let i = 0; i < jobs.length; i += PARALLEL_REQUESTS) await Promise.all(jobs.slice(i, i + PARALLEL_REQUESTS).map((job) => job()));
  return tally;
}

// ---------------------------------------------------------------- phone → agenda

/** Google event → agenda row fields (times in the configured time zone). Pure: used by tests. */
export function phoneEventToRow(event: any): Record<string, string> | null {
  const start: string | undefined = event.start?.dateTime ?? event.start?.date;
  if (!start || !event.summary) return null;
  const date = start.slice(0, 10);
  const wholeDay = !event.start?.dateTime;
  const end: string | undefined = event.end?.dateTime;
  let endDate = "";
  let endClock = "";
  if (wholeDay) {
    // whole-day end is exclusive: the day before is the last day
    const last = event.end?.date ? addDays(event.end.date, -1) : date;
    if (last > date) endDate = last;
  } else if (end) {
    const endDay = end.slice(0, 10);
    const clock = end.slice(11, 16);
    if (endDay === date) endClock = clock;
    else if (!(endDay === addDays(date, 1) && clock === "00:00")) [endDate, endClock] = [endDay, clock]; // ending at midnight: same day
  }
  // Exam: "📝" first, the word "examen", or "Test 3" (a number after "test")
  const isExam = /^📝|examen|\btest\s*\d/i.test(event.summary);
  return {
    date,
    start: wholeDay ? "" : start.slice(11, 16),
    end: endClock,
    endDate,
    type: isExam ? "exam" : "appointment",
    title: String(event.summary).replace(/^📝\s*/, ""),
    place: event.location ?? "",
    module: (String(event.summary).match(/\bM\d{3}\b/) ?? [""])[0],
    note: String(event.description ?? "")
      .split("\n")[0]
      .slice(0, 140),
  };
}

async function importFromPhone(calendar: string, from: string): Promise<{ added: number; updated: number; removed: number }> {
  const known: PhoneEvents = await readPhoneEvents();
  const tally = { added: 0, updated: 0, removed: 0 };
  const phone = new Map(
    (await listEvents(calendar, from, config().locale.timeZone)).filter((e) => !isCockpitEvent(e)).map((e) => [e.id, e]),
  );
  const rows = new Map(readAgenda().map((e) => [e.id, e]));
  for (const [id, event] of phone) {
    const link = known[id];
    if (link?.row.startsWith(RELEASED_PREFIX)) {
      // edited in the Cockpit: the phone event gives way to the Cockpit's version
      const r = await api("DELETE", `/calendars/${encodeURIComponent(calendar)}/events/${id}`);
      if (succeeded(r.status) || r.status === 410) {
        delete known[id];
        tally.removed++;
      }
      continue;
    }
    const row = phoneEventToRow(event);
    if (!row) continue;
    if (!link) {
      // new on the phone
      const rowId = await upsertEvent(row);
      if (rowId) {
        known[id] = { row: rowId, updated: event.updated };
        tally.added++;
      }
    } else if (link.updated !== event.updated) {
      // changed on the phone: the row follows (one atomic write)
      const rowId = await upsertEvent(row, link.row);
      if (rowId) {
        known[id] = { row: rowId, updated: event.updated };
        tally.updated++;
      }
    } else if (!rows.has(link.row)) {
      // row removed in the Cockpit / Obsidian: remove the phone event too
      const r = await api("DELETE", `/calendars/${encodeURIComponent(calendar)}/events/${id}`);
      if (succeeded(r.status) || r.status === 410) {
        delete known[id];
        tally.removed++;
      }
    }
  }
  for (const [id, link] of Object.entries(known)) {
    // deleted on the phone (unless simply too old to be listed)
    if (phone.has(id)) continue;
    const row = rows.get(link.row);
    if (row && lastDay(row) >= from) {
      await removeEvent(link.row);
      tally.removed++;
    }
    delete known[id];
  }
  await writeJsonAtomic(googleFile.phoneEvents(), known);
  return tally;
}

// ---------------------------------------------------------------- sync

let rerun: ReturnType<typeof setTimeout> | null = null;

/** Synchronizes both calendars (does nothing if Google is disabled or not connected). */
export async function syncGoogle(): Promise<void> {
  if (!config().google.enabled || !isConnected() || !hasClient()) return;
  if (state.running) {
    rerun ??= setTimeout(() => {
      rerun = null;
      syncGoogle();
    }, 5000);
    return;
  }
  state = { ...state, running: true, error: null };
  try {
    const { pastDays, futureDays } = config().google;
    const from = addDays(today(), -pastDays),
      to = addDays(today(), futureDays);
    const personal = await calendarId("personal");
    const fromPhone = await importFromPhone(personal, from); // the phone first, then the Cockpit
    const phoneRows = new Set(Object.values(await readPhoneEvents()).map((v) => v.row));
    const courses = wantedCourses(from, to),
      mine = wantedPersonal(from, phoneRows);
    const a = await align(await calendarId("courses"), courses, from);
    const b = await align(personal, mine, from);
    const total = { added: a.added + b.added, updated: a.updated + b.updated, deleted: a.deleted + b.deleted, failed: a.failed + b.failed };
    const error = total.failed
      ? `${total.failed} événement${total.failed > 1 ? "s" : ""} refusé${total.failed > 1 ? "s" : ""} par Google (${a.lastError || b.lastError}) : réessayé à la prochaine synchro.`
      : null;
    const phoneText =
      fromPhone.added + fromPhone.updated + fromPhone.removed
        ? ` · depuis le téléphone : ${fromPhone.added} ajouté(s), ${fromPhone.updated} modifié(s), ${fromPhone.removed} retiré(s)`
        : "";
    state = {
      running: false,
      error,
      lastSync: new Date().toISOString(),
      summary: `${courses.length} cours, ${mine.length} perso (${total.added} ajoutés, ${total.updated} modifiés, ${total.deleted} supprimés)${phoneText}`,
    };
  } catch (e) {
    state = { ...state, running: false, error: (e as Error).message };
    console.error("Synchro Google :", (e as Error).message);
  }
}

/** After an agenda change: sync 2 s later (groups close clicks). */
let debounce: ReturnType<typeof setTimeout> | null = null;
export function syncGoogleSoon(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    syncGoogle();
  }, 2000);
}

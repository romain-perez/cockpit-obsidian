// Agenda: a Markdown table in a vault note (config: vault.agendaFile).
// It is the ONLY note the Cockpit writes, always through safe-write (atomic, isolated, durable).
// The file stays readable and editable by hand in Obsidian: French header, types "rdv" / "examen".
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { isIsoDate } from "./core/dates.ts";
import { colorFor, stableNumber } from "./core/hash.ts";
import { updateFile } from "./core/safe-write.ts";
import type { AgendaEvent, AgendaEventType } from "../shared/types.ts";

// ---------------------------------------------------------------- file format (user data, in French)

export const HEADER = "| Date | Début | Fin | Type | Titre | Lieu | Module | Remarque |";
const SEPARATOR = "|---|---|---|---|---|---|---|---|";
const TYPE_IN_FILE: Record<AgendaEventType, string> = { appointment: "rdv", exam: "examen" };
const EXAM_COLOR = "#f87171";
const APPOINTMENT_COLORS = ["#7DCFFF", "#F2B58C", "#A78BFA", "#5EEAD4", "#FBBF24"];

const template = () => `---
tags:
  - agenda
---
# Agenda

Rendez-vous et examens ajoutés depuis le Cockpit (espace Aujourd'hui, vue Calendrier).
Tu peux aussi ajouter une ligne à la main : date \`AAAA-MM-JJ\`, heures \`HH:MM\` (vides = toute la journée), type \`rdv\` ou \`examen\`, module facultatif (\`M295\`).

${HEADER}
${SEPARATOR}
`;

/** One row of the table, without the computed fields (id, color). */
export type AgendaRow = Omit<AgendaEvent, "id" | "color">;

/** Stable id of a row. WARNING: stored in the phone sync mapping, must not change. */
export const rowId = (row: AgendaRow): string =>
  stableNumber([row.date, row.start, TYPE_IN_FILE[row.type], row.title, row.place].join("|")).toString(36);

const withComputed = (row: AgendaRow): AgendaEvent => ({
  ...row,
  id: rowId(row),
  color: row.type === "exam" ? EXAM_COLOR : colorFor(row.title, APPOINTMENT_COLORS),
});

const byDateTime = (a: AgendaRow, b: AgendaRow) => (a.date + a.start).localeCompare(b.date + b.start);

/** Rows of the agenda table (other lines of the note are ignored). Pure: used by tests. */
export function parseAgenda(text: string): AgendaEvent[] {
  const events: AgendaEvent[] = [];
  for (const line of text.split("\n")) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 5 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue;
    events.push(
      withComputed({
        date: cells[0],
        start: cells[1] ?? "",
        end: cells[2] ?? "",
        type: /exam/i.test(cells[3]) ? "exam" : "appointment",
        title: cells[4] ?? "",
        place: cells[5] ?? "",
        module: (cells[6] ?? "").toUpperCase(),
        note: cells[7] ?? "",
      }),
    );
  }
  return events.sort(byDateTime);
}

/** Rewrites ONLY the table of the note: everything written around it is kept. Pure: used by tests. */
export function renderAgenda(currentText: string | null, rows: AgendaRow[]): string {
  const lines = (currentText ?? template()).split("\n");
  const start = lines.findIndex((l) => l.trim().startsWith("| Date |"));
  if (start < 0) throw new Error("Tableau de l'agenda introuvable dans la note (ligne « | Date | Début | … »).");
  let end = start + 2;
  while (end < lines.length && lines[end].trim().startsWith("|")) end++;
  const body = [...rows]
    .sort(byDateTime)
    .map((r) => `| ${r.date} | ${r.start} | ${r.end} | ${TYPE_IN_FILE[r.type]} | ${r.title} | ${r.place} | ${r.module} | ${r.note} |`);
  return [...lines.slice(0, start), HEADER, SEPARATOR, ...body, ...lines.slice(end)].join("\n");
}

// ---------------------------------------------------------------- input from the user / from Google

const clean = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .replace(/[|\r\n]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/** Cleans received fields: no "|" nor line break (they would break the table), bounded lengths. */
export function normalizeRow(raw: Record<string, unknown>): AgendaRow {
  return {
    date: clean(raw.date, 10),
    start: clean(raw.start, 5),
    end: clean(raw.end, 5),
    type: raw.type === "exam" ? "exam" : "appointment",
    title: clean(raw.title, 80),
    place: clean(raw.place, 60),
    module: clean(raw.module, 6).toUpperCase(),
    note: clean(raw.note, 140),
  };
}

/** Error message for the user, or null if the row is valid. */
export function validateRow(row: AgendaRow): string | null {
  if (!isIsoDate(row.date)) return "Date invalide (format AAAA-MM-JJ).";
  if (row.start && !/^\d{2}:\d{2}$/.test(row.start)) return "Heure de début invalide (HH:MM).";
  if (row.end && !/^\d{2}:\d{2}$/.test(row.end)) return "Heure de fin invalide (HH:MM).";
  if (row.start && row.end && row.end <= row.start) return "La fin doit être après le début.";
  if (!row.title) return "Il faut un titre.";
  if (row.module && !/^M\d{3}$/.test(row.module)) return "Module invalide (ex. M295).";
  return null;
}

// ---------------------------------------------------------------- reading and writing the note

const agendaPath = () => join(config().vault.path, config().vault.agendaFile);
const stripComputed = ({ id: _id, color: _color, ...row }: AgendaEvent): AgendaRow => row;
/** The written note must still contain the table and every row must be readable. */
const checkTable = (content: string) => (content.includes(HEADER) ? null : "Écriture refusée : le tableau de l'agenda serait cassé.");

export function readAgenda(): AgendaEvent[] {
  const path = agendaPath();
  return existsSync(path) ? parseAgenda(readFileSync(path, "utf8")) : [];
}

export type AddResult = { ok: true; id: string } | { ok: false; error: string; duplicate?: boolean };

/** Validates and adds an event. The duplicate check runs inside the file lock (isolation). */
export async function addEvent(raw: Record<string, unknown>): Promise<AddResult> {
  const row = normalizeRow(raw);
  const error = validateRow(row);
  if (error) return { ok: false, error };
  const id = rowId(row);
  const { value } = await updateFile<AddResult>(
    agendaPath(),
    (current) => {
      const rows = current === null ? [] : parseAgenda(current);
      if (rows.some((r) => r.id === id))
        return { content: null, value: { ok: false, error: "Cet événement existe déjà.", duplicate: true } };
      return { content: renderAgenda(current, [...rows.map(stripComputed), row]), value: { ok: true, id } };
    },
    { validate: checkTable },
  );
  return value;
}

export type UpdateResult = AddResult | { ok: false; error: string; notFound: true };

/** Replaces a row (edit in the calendar). The row id changes if the date, start, type, title or place change. */
export async function updateEvent(id: unknown, raw: Record<string, unknown>): Promise<UpdateResult> {
  if (typeof id !== "string") return { ok: false, error: "Événement introuvable.", notFound: true };
  const row = normalizeRow(raw);
  const error = validateRow(row);
  if (error) return { ok: false, error };
  const newId = rowId(row);
  const { value } = await updateFile<UpdateResult>(
    agendaPath(),
    (current) => {
      const rows = current === null ? [] : parseAgenda(current);
      if (!rows.some((r) => r.id === id)) return { content: null, value: { ok: false, error: "Événement introuvable.", notFound: true } };
      if (newId !== id && rows.some((r) => r.id === newId))
        return { content: null, value: { ok: false, error: "Cet événement existe déjà.", duplicate: true } };
      const kept = rows.map((r) => (r.id === id ? row : stripComputed(r)));
      return { content: renderAgenda(current, kept), value: { ok: true, id: newId } };
    },
    { validate: checkTable },
  );
  return value;
}

/** Removes a row. Returns false if the id is unknown. */
export async function removeEvent(id: unknown): Promise<boolean> {
  if (typeof id !== "string") return false;
  const { value } = await updateFile<boolean>(
    agendaPath(),
    (current) => {
      if (current === null) return { content: null, value: false };
      const rows = parseAgenda(current);
      if (!rows.some((r) => r.id === id)) return { content: null, value: false };
      return { content: renderAgenda(current, rows.filter((r) => r.id !== id).map(stripComputed)), value: true };
    },
    { validate: checkTable },
  );
  return value;
}

/**
 * Adds or replaces a row in ONE atomic write (used for events created on the phone).
 * Returns the id of the row (the existing one if identical), or null if the data is invalid.
 */
export async function upsertEvent(raw: Record<string, unknown>, replacedId: string | null = null): Promise<string | null> {
  const row = normalizeRow(raw);
  if (validateRow(row)) return null;
  const id = rowId(row);
  const { value } = await updateFile<string>(
    agendaPath(),
    (current) => {
      const rows = (current === null ? [] : parseAgenda(current)).filter((r) => r.id !== replacedId);
      if (rows.some((r) => r.id === id) && replacedId === null) return { content: null, value: id };
      const kept = rows.filter((r) => r.id !== id).map(stripComputed);
      return { content: renderAgenda(current, [...kept, row]), value: id };
    },
    { validate: checkTable },
  );
  return value;
}

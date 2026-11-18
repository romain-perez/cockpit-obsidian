// Date helpers working on local "YYYY-MM-DD" strings (no time zone surprises).

/** Local date → "YYYY-MM-DD" */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const today = (): string => toIsoDate(new Date());

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d + days));
}

/** Number of days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

const SHORT_WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Text shown to the user: "aujourd'hui", "demain", "ven. 20", "en retard" */
export function relativeDayLabel(reference: string, date: string): string {
  const gap = daysBetween(reference, date);
  if (gap < 0) return "en retard";
  if (gap === 0) return "aujourd'hui";
  if (gap === 1) return "demain";
  const [y, m, d] = date.split("-").map(Number);
  return `${SHORT_WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d}`;
}

/** French date in a sentence: "vendredi 6 novembre 2026" → "2026-11-06" (null if not found). */
export function parseFrenchDate(text: string): string | null {
  const match = text.toLowerCase().match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2]);
  return month < 0 ? null : toIsoDate(new Date(Number(match[3]), month, Number(match[1])));
}

/** "0755" (+ minutes) → "07:55" */
export function formatClock(hhmm: string, plusMinutes = 0): string {
  const total = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4)) + plusMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "14:00" → "15:00" (one hour later, capped at 23:xx) */
export const oneHourLater = (clock: string): string =>
  `${String(Math.min(23, Number(clock.slice(0, 2)) + 1)).padStart(2, "0")}:${clock.slice(3, 5)}`;

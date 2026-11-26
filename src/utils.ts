// Interface helpers: French dates and generative waves.

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const SHORT_WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
export const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** "YYYY-MM-DD" → local Date */
export function parseDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local Date → "YYYY-MM-DD" */
export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const daysBetween = (from: string, to: string): number =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
export const shortWeekday = (isoDate: string) => SHORT_WEEKDAYS[parseDate(isoDate).getDay()];
export const weekdayName = (date: Date) => WEEKDAYS[date.getDay()];
export const dayOfMonth = (isoDate: string) => parseDate(isoDate).getDate();

/** Date a number of days later (or earlier) */
export const addDaysIso = (isoDate: string, days: number): string => {
  const date = parseDate(isoDate);
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
};

/** "du 21 au 27 décembre", "du 30 novembre au 2 décembre" */
export function periodLabel(from: string, to: string): string {
  const [a, b] = [parseDate(from), parseDate(to)];
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return `du ${a.getDate()}${sameMonth ? "" : ` ${MONTHS[a.getMonth()]}`} au ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/** "mardi 17 novembre" */
export const longDate = (date: Date): string => `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;

/** "Aujourd'hui", "Demain", "Jeudi 19" */
export function relativeDayName(today: string, isoDate: string): string {
  const gap = daysBetween(today, isoDate);
  if (gap === 0) return "Aujourd'hui";
  if (gap === 1) return "Demain";
  const date = parseDate(isoDate);
  const name = WEEKDAYS[date.getDay()];
  return `${name.charAt(0).toUpperCase() + name.slice(1)} ${date.getDate()}`;
}

export const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count > 1 ? pluralForm : singular}`;

// ---------------------------------------------------------------- waves
type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb;
const rgba = (c: Rgb, alpha = 1) => `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;

/** Stable seed from a text (same module = same drawing). */
export function seedOf(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash) % 233280;
}

/** Draws layers of waves in the given color. */
export function drawWaves(canvas: HTMLCanvasElement, color: string, seed: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = (canvas.width = Math.max(10, Math.round(canvas.clientWidth * dpr)));
  const h = (canvas.height = Math.max(10, Math.round(canvas.clientHeight * dpr)));
  const g = canvas.getContext("2d");
  if (!g) return;
  let s = seed || 1;
  const random = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const base = toRgb(color),
    ink: Rgb = [10, 24, 27],
    cream: Rgb = [240, 226, 205];

  g.fillStyle = rgba(mix(ink, base, 0.18));
  g.fillRect(0, 0, w, h);
  const layers = 9;
  for (let layer = 0; layer < layers; layer++) {
    const t = layer / (layers - 1);
    const y0 = h * (0.12 + t * 0.95),
      amplitude = h * (0.05 + random() * 0.09),
      frequency = 1.2 + random() * 2.2,
      phase = random() * 6.3;
    const c = layer % 3 === 2 ? mix(base, cream, 0.55) : mix(ink, base, 0.35 + t * 0.6);
    const gradient = g.createLinearGradient(0, y0 - amplitude, 0, h);
    gradient.addColorStop(0, rgba(c, 0.96));
    gradient.addColorStop(1, rgba(mix(c, ink, 0.6), 0.96));
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      const y =
        y0 +
        Math.sin((x / w) * Math.PI * frequency + phase) * amplitude +
        Math.sin((x / w) * Math.PI * frequency * 2.7 + phase * 2) * amplitude * 0.25 -
        ((w - x) / w) * h * 0.22;
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = gradient;
    g.fill();
    g.strokeStyle = rgba(mix(c, cream, 0.6), 0.35);
    g.lineWidth = 1.2 * dpr;
    g.stroke();
  }
  for (let k = 0; k < 7; k++) {
    g.beginPath();
    g.arc(w * (0.45 + random() * 0.5), h * (0.1 + random() * 0.5), (4 + random() * 16) * dpr, 0, Math.PI * 2);
    g.fillStyle = rgba(mix(base, cream, 0.7), 0.75);
    g.fill();
  }
}

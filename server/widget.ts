// Compact data for the desktop bar widget (extras/caelestia): current or next course, the following ones,
// the next exam within a week and the number of tasks. Read every minute by the bar: keep it light.
import { config } from "./config.ts";
import { addDays, daysBetween, relativeDayLabel, toIsoDate } from "./core/dates.ts";
import { readAgenda } from "./agenda.ts";
import { modulesByCode } from "./school/modules.ts";
import { blocksOfDay, readPeriods } from "./school/schedule.ts";
import { courseMapper } from "./school/school-data.ts";
import { buildToday } from "./today.ts";
import type { Course, WidgetCourse, WidgetData } from "../shared/types.ts";

const LOOKAHEAD_DAYS = 14;
const FOLLOWING_COURSES = 3;
const EXAM_WINDOW_DAYS = 7;

const toMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

export interface WidgetInput {
  today: string; // "2026-11-18"
  clock: string; // "14:55"
  coursesOf: (date: string) => Course[];
  exams: { title: string; date: string }[];
  tasks: number;
  url: string;
}

/** Pure: used by tests. */
export function widgetFrom({ today, clock, coursesOf, exams, tasks, url }: WidgetInput): WidgetData {
  const now = toMinutes(clock);
  const coming: WidgetCourse[] = [];
  for (let offset = 0; offset <= LOOKAHEAD_DAYS && coming.length < FOLLOWING_COURSES + 2; offset++) {
    const date = addDays(today, offset);
    for (const c of coursesOf(date)) {
      if (offset === 0 && toMinutes(c.end) <= now) continue; // already over
      coming.push({
        code: c.code,
        label: c.label,
        date,
        day: relativeDayLabel(today, date),
        start: c.start,
        end: c.end,
        room: c.room,
        roomShort: c.room.split(/\s+/)[0] ?? "",
        teacher: c.teacher,
        color: c.color,
      });
    }
  }
  const first = coming[0];
  const ongoing = first && first.date === today && toMinutes(first.start) <= now;
  const current = ongoing
    ? {
        ...first,
        progress: Math.min(1, (now - toMinutes(first.start)) / Math.max(1, toMinutes(first.end) - toMinutes(first.start))),
        remainingMinutes: toMinutes(first.end) - now,
      }
    : null;
  const next = ongoing ? (coming[1] ?? null) : (first ?? null);

  const exam = exams
    .map((e) => ({ ...e, inDays: daysBetween(today, e.date) }))
    .filter((e) => e.inDays >= 0 && e.inDays <= EXAM_WINDOW_DAYS)
    .sort((a, b) => a.inDays - b.inDays)[0];

  return {
    now: current,
    next,
    following: coming.slice(1, 1 + FOLLOWING_COURSES), // after the first course shown (current or next)
    exam: exam ? { title: exam.title, date: exam.date, day: relativeDayLabel(today, exam.date), inDays: exam.inDays } : null,
    tasks,
    url,
  };
}

export async function buildWidget(date = new Date()): Promise<WidgetData> {
  const today = toIsoDate(date);
  const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const byCode = modulesByCode();
  const toCourse = courseMapper(byCode);
  const periods = readPeriods();
  const exams = [
    ...[...byCode.values()].flatMap((m) =>
      m.exams.filter((e) => e.date && !e.done).map((e) => ({ title: `${e.name} · ${m.code}`, date: e.date! })),
    ),
    ...readAgenda()
      .filter((e) => e.type === "exam")
      .map((e) => ({ title: e.module ? `${e.title} · ${e.module}` : e.title, date: e.date })),
  ];
  return widgetFrom({
    today,
    clock,
    coursesOf: (day) => blocksOfDay(periods, day).map(toCourse),
    exams,
    tasks: (await buildToday()).tasks.length,
    url: `http://localhost:${config().server.port}`,
  });
}

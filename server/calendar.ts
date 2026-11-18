// Calendar over a period: courses (schedule), exams (module notes + agenda) and appointments (agenda).
import { config } from "./config.ts";
import { addDays, daysBetween } from "./core/dates.ts";
import { obsidianLink } from "./core/markdown.ts";
import { readAgenda } from "./agenda.ts";
import { modulesByCode } from "./school/modules.ts";
import { blocksOfDay, readPeriods } from "./school/schedule.ts";
import { courseMapper, EXAM_COLOR } from "./school/school-data.ts";
import type { CalendarData, CalendarDay, CalendarExam } from "../shared/types.ts";

export const MAX_CALENDAR_DAYS = 120;

export function buildCalendar(from: string, to: string): CalendarData {
  const dayCount = Math.min(Math.max(daysBetween(from, to) + 1, 1), MAX_CALENDAR_DAYS);
  const byCode = modulesByCode();
  const toCourse = courseMapper(byCode);
  const periods = readPeriods();
  const agenda = readAgenda();

  const exams = new Map<string, CalendarExam[]>();
  const addExam = (date: string, exam: CalendarExam) => exams.set(date, [...(exams.get(date) ?? []), exam]);
  for (const m of byCode.values())
    for (const e of m.exams)
      if (e.date && !e.done) {
        const course = periods.find((p) => p.date === e.date && p.code === m.code);
        addExam(e.date, {
          title: `${e.name} · ${m.code}`,
          code: m.code,
          start: course?.start ?? "",
          color: EXAM_COLOR,
          link: m.link,
          agendaId: null,
        });
      }
  for (const e of agenda.filter((x) => x.type === "exam"))
    addExam(e.date, {
      title: e.module ? `${e.title} · ${e.module}` : e.title,
      code: e.module || null,
      start: e.start,
      color: EXAM_COLOR,
      link: byCode.get(e.module)?.link ?? null,
      agendaId: e.id,
    });

  const days: CalendarDay[] = Array.from({ length: dayCount }, (_, i) => {
    const date = addDays(from, i);
    return {
      date,
      courses: blocksOfDay(periods, date).map(toCourse),
      exams: exams.get(date) ?? [],
      events: agenda.filter((e) => e.type === "appointment" && e.date === date),
    };
  });
  // Modules offered for a new exam: those with courses in the period first
  const withCourses = new Set(days.flatMap((d) => d.courses.map((c) => c.code)));
  const modules = [...byCode.values()]
    .filter((m) => !m.finished)
    .sort((a, b) => Number(withCourses.has(b.code)) - Number(withCourses.has(a.code)) || a.code.localeCompare(b.code))
    .map((m) => ({ code: m.code, title: m.title }));
  return { days, modules, agendaLink: obsidianLink(config().vault.agendaFile) };
}

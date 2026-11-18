// "École" space: week of courses, modules, tasks, grades, Drive status.
import { config } from "../config.ts";
import { addDays, daysBetween, relativeDayLabel, today as todayDate } from "../core/dates.ts";
import { obsidianLink } from "../core/markdown.ts";
import { readAgenda } from "../agenda.ts";
import { driveStatus } from "../drive.ts";
import { readSemesters } from "./grades.ts";
import { computeCfcGrade } from "./cfc.ts";
import { modulesByCode, pendingCoursePdfs, type ModuleRecord } from "./modules.ts";
import { readDismissed, splitDismissed, withFingerprints, type ComputedTask } from "../tasks.ts";
import { blocksOfDay, readPeriods, type Period } from "./schedule.ts";
import type { AgendaEvent, Course, SchoolData, SchoolDay, SchoolModule, Semester, Task } from "../../shared/types.ts";

export const EXAM_COLOR = "#f87171";
const OVERDUE_COLOR = "#f2b58c";

/** Schedule period → course shown to the user (module color and note). */
export function courseMapper(byCode: Map<string, Pick<ModuleRecord, "color" | "link">>) {
  const { school } = config();
  return (p: Pick<Period, "code" | "start" | "end" | "room" | "teacher">): Course => {
    const module = byCode.get(p.code);
    const other = school.nonModuleCourses[p.code];
    return {
      code: p.code,
      label: other?.label ?? p.code,
      start: p.start,
      end: p.end,
      room: p.room,
      teacher: p.teacher,
      color: module?.color ?? school.neutralColor,
      link: module?.link ?? (other ? obsidianLink(other.note) : null),
    };
  };
}

const severityOrder = { urgent: 0, warning: 1, info: 2 } as const;
export const bySeverity = (a: Pick<Task, "severity">, b: Pick<Task, "severity">) => severityOrder[a.severity] - severityOrder[b.severity];

export function buildSchoolData(forcedDate?: string): SchoolData {
  const { school } = config();
  const today = forcedDate ?? todayDate();
  const periods = readPeriods();
  const byCode = modulesByCode();
  const toCourse = courseMapper(byCode);
  const agenda = readAgenda();

  // Known exams: unticked lines of the module notes + exams of the agenda
  const examsByDate = new Map<string, string[]>();
  const addExam = (date: string, label: string) => examsByDate.set(date, [...(examsByDate.get(date) ?? []), label]);
  for (const m of byCode.values()) for (const e of m.exams) if (e.date && !e.done) addExam(e.date, `${e.name} · ${m.code}`);
  for (const e of agenda) if (e.type === "exam") addExam(e.date, e.module ? `${e.title} · ${e.module}` : e.title);

  const week: SchoolDay[] = Array.from({ length: school.daysShown }, (_, i) => {
    const date = addDays(today, i);
    return { date, courses: blocksOfDay(periods, date).map(toCourse), exams: examsByDate.get(date) ?? [] };
  });

  // Active module: a course in the last N days or in the next M days
  const inWindow = (date: string) => {
    const gap = daysBetween(today, date);
    return gap >= -school.activeWindowDays.past && gap <= school.activeWindowDays.future;
  };
  const modules: SchoolModule[] = [...byCode.values()]
    .map(({ notePath: _notePath, ...m }) => {
      const next = periods.find((p) => p.code === m.code && p.date >= today);
      return {
        ...m,
        active: !m.finished && periods.some((p) => p.code === m.code && inWindow(p.date)),
        nextCourse: next ? { date: next.date, start: next.start, room: next.room } : null,
      };
    })
    .sort((a, b) => (a.nextCourse?.date ?? "9999").localeCompare(b.nextCourse?.date ?? "9999") || a.code.localeCompare(b.code));

  const semesters = readSemesters((code) => byCode.get(code)?.link ?? null);
  const tasks = splitDismissed(withFingerprints(schoolTasks(today, modules, semesters, agenda)), readDismissed());
  return {
    generatedAt: new Date().toISOString(),
    today,
    week,
    modules,
    tasks: tasks.visible,
    hiddenTasks: tasks.hidden,
    drive: driveStatus(),
    semesters,
    cfc: school.cfc.enabled ? computeCfcGrade(semesters, school.cfc) : null,
  };
}

function schoolTasks(today: string, modules: SchoolModule[], semesters: Semester[], agenda: AgendaEvent[]): ComputedTask[] {
  const tasks: ComputedTask[] = [];
  const moduleLink = (code: string) => modules.find((m) => m.code === code)?.link;

  // Agenda: exam within 7 days (urgent), appointment today or tomorrow
  for (const e of agenda) {
    const gap = daysBetween(today, e.date);
    if (e.type === "exam" && gap >= 0 && gap <= 7)
      tasks.push({
        id: `agenda-${e.id}`,
        title: e.module ? `${e.title} · ${e.module}` : e.title,
        detail: [e.start && `à ${e.start}`, e.place, e.note].filter(Boolean).join(" · ") || "Examen ajouté dans l'agenda",
        when: relativeDayLabel(today, e.date),
        severity: "urgent",
        color: EXAM_COLOR,
        link: moduleLink(e.module),
      });
    if (e.type === "appointment" && gap >= 0 && gap <= 1)
      tasks.push({
        id: `agenda-${e.id}`,
        title: e.title,
        detail: [e.start && `${e.start}${e.end ? `–${e.end}` : ""}`, e.place, e.note].filter(Boolean).join(" · ") || "Rendez-vous",
        when: relativeDayLabel(today, e.date),
        severity: "info",
        color: e.color,
      });
  }

  // Subject below 4 in a semester in progress
  for (const semester of semesters.filter((s) => s.inProgress))
    for (const s of semester.subjects.filter((x) => x.average < 4))
      tasks.push({
        id: `grade-${semester.name}-${s.subject}`,
        title: `${s.subject} sous la moyenne (${s.average})`,
        detail: `${semester.name} : à remonter avant la fin du semestre`,
        when: "en cours",
        severity: "urgent",
        color: EXAM_COLOR,
        link: s.link ?? undefined,
      });

  for (const m of modules) {
    for (const exam of m.exams) {
      if (!exam.date || exam.done) continue;
      const gap = daysBetween(today, exam.date);
      if (gap < 0) {
        tasks.push({
          id: `tick-${m.code}-${exam.name}`,
          title: `Cocher le ${exam.name} de ${m.code}`,
          detail: `Passé, encore ouvert dans la note -${m.code}`,
          when: "en retard",
          severity: "warning",
          color: OVERDUE_COLOR,
          link: m.link,
          tick: { module: m.code, exam: exam.name },
        });
      } else if (gap <= 7) {
        const toReview = m.sequences.filter((s) => !s.examDone);
        const detail = toReview.length
          ? `Réviser ${toReview.length > 1 ? `les séquences ${toReview[0].number} à ${toReview.at(-1)!.number}` : `la séquence ${toReview[0].number}`}${m.refcard ? " · refcard prête" : ""}`
          : "Toutes les séquences sont marquées comme passées";
        tasks.push({
          id: `exam-${m.code}-${exam.name}`,
          title: `${exam.name} de ${m.code}`,
          detail,
          when: relativeDayLabel(today, exam.date),
          severity: "urgent",
          color: EXAM_COLOR,
          link: m.refcard ?? m.link,
        });
      }
    }
    if (m.active && m.sequences.length === 0 && m.nextCourse && daysBetween(today, m.nextCourse.date) <= 7)
      tasks.push({
        id: `empty-${m.code}`,
        title: `${m.code} · aucune séquence`,
        detail: "Rien dans le vault avant le prochain cours",
        when: relativeDayLabel(today, m.nextCourse.date),
        severity: "info",
        color: m.color,
        link: m.link,
      });
  }

  for (const pdf of pendingCoursePdfs()) {
    const m = modules.find((x) => x.code === pdf.code);
    tasks.push({
      id: `pdf-${pdf.code}-${pdf.title}`,
      title: `${pdf.code} · « ${pdf.title} »`,
      detail: "PDF de cours dans Téléchargements : séquence à rédiger",
      when: "à traiter",
      severity: "warning",
      color: m?.color ?? config().school.neutralColor,
      link: m?.link,
    });
  }
  return tasks.sort(bySeverity);
}

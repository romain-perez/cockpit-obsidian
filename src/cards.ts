// Builds the carousel cards for the chosen day.
import type { Project, SchoolData, SchoolDay, SchoolModule, TodayData } from "../shared/types.ts";
import { daysBetween, plural, relativeDayName } from "./utils.ts";

export interface Card {
  id: string;
  label: string; // "Aujourd'hui", "Prochain examen", "Module en cours"
  kicker: string[]; // ["07:55 – 12:00", "F119 Labo ICT"]
  title: string;
  meta: { value: string; caption: string }[];
  color: string;
  seed: string;
  action?: { text: string; link: string };
  folder?: string; // code folder: "Ouvrir dans VS Code" button
  urgent?: boolean;
}

const NEUTRAL_COLOR = "#94aca8";

function moduleMeta(m: SchoolModule, today: string): Card["meta"] {
  const count = m.sequences.length;
  // Next exam to come (past exams not ticked are listed in "À faire")
  const exam = m.exams.filter((e) => !e.done && e.date && e.date >= today).sort((a, b) => a.date!.localeCompare(b.date!))[0];
  return [
    { value: count ? plural(count, "séquence") : "Aucune séquence", caption: count ? "rédigées dans le vault" : "à rédiger" },
    exam
      ? { value: exam.name, caption: "prochain test" }
      : { value: m.refcard ? "Refcard" : "Pas de refcard", caption: m.refcard ? "prête" : "pour l'instant" },
    { value: m.category || "Module", caption: "catégorie" },
  ];
}

function moduleAction(m: SchoolModule): Card["action"] {
  const last = m.sequences.at(-1);
  return last ? { text: `Ouvrir la séquence ${last.number}`, link: last.link } : { text: `Ouvrir ${m.code}`, link: m.link };
}

export function schoolCards(data: SchoolData, day: SchoolDay): Card[] {
  const cards: Card[] = [];
  const byCode = new Map(data.modules.map((m) => [m.code, m]));
  const shown = new Set<string>();
  const when = relativeDayName(data.today, day.date);

  // 1. Courses of the chosen day
  for (const course of day.courses) {
    const m = byCode.get(course.code);
    shown.add(course.code);
    cards.push({
      id: `course-${day.date}-${course.code}-${course.start}`,
      label: when,
      kicker: [`${course.start} – ${course.end}`, course.room, ...(course.teacher ? [course.teacher] : [])],
      title: m ? `${m.code} · ${m.title}` : course.label,
      meta: m ? moduleMeta(m, data.today) : [{ value: course.label, caption: "cours sans module" }],
      color: course.color,
      seed: course.code,
      action: m ? moduleAction(m) : course.link ? { text: `Ouvrir ${course.label}`, link: course.link } : undefined,
    });
  }
  if (day.courses.length === 0) {
    const next = data.week.find((d) => d.date > day.date && d.courses.length);
    cards.push({
      id: `free-${day.date}`,
      label: when,
      kicker: ["Pas de cours"],
      title: "Journée libre",
      meta: next
        ? [
            {
              value: `${next.courses[0].label} · ${next.courses[0].start}`,
              caption: `prochain cours ${relativeDayName(data.today, next.date).toLowerCase()}`,
            },
          ]
        : [],
      color: NEUTRAL_COLOR,
      seed: `free-${day.date}`,
    });
  }

  // 2. Next exam (within 10 days after the chosen day)
  const exams = data.modules
    .flatMap((m) => m.exams.filter((e) => !e.done && e.date && e.date >= data.today).map((e) => ({ m, e, date: e.date! })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = exams.find((x) => daysBetween(day.date, x.date) >= 0 && daysBetween(day.date, x.date) <= 10);
  if (next) {
    const gap = daysBetween(data.today, next.date);
    const course = data.week.find((d) => d.date === next.date)?.courses.find((c) => c.code === next.m.code);
    const toReview = next.m.sequences.filter((s) => !s.examDone).length;
    cards.push({
      id: `exam-${next.m.code}-${next.e.name}`,
      label: "Prochain examen",
      kicker: [relativeDayName(data.today, next.date), ...(course ? [course.start, course.room] : [])],
      title: `${next.e.name} · ${next.m.code}`,
      meta: [
        { value: gap === 0 ? "C'est aujourd'hui" : `Dans ${plural(gap, "jour")}`, caption: next.m.title },
        { value: plural(toReview, "séquence"), caption: "à réviser" },
        { value: next.m.refcard ? "Refcard prête" : "Pas de refcard", caption: next.m.refcard ? "à relire" : "à préparer" },
      ],
      color: next.m.color,
      seed: `examen-${next.m.code}`,
      action: { text: next.m.refcard ? "Ouvrir la refcard" : `Ouvrir ${next.m.code}`, link: next.m.refcard ?? next.m.link },
      urgent: true,
    });
  }

  // 3. Other active modules, in the order of their next course
  for (const m of data.modules.filter((x) => x.active && !shown.has(x.code))) {
    const course = m.nextCourse;
    cards.push({
      id: `module-${m.code}`,
      label: "Module en cours",
      kicker: course
        ? [`Prochain cours ${relativeDayName(data.today, course.date).toLowerCase()}`, course.start, course.room]
        : ["Pas de cours prévu"],
      title: `${m.code} · ${m.title}`,
      meta: moduleMeta(m, data.today),
      color: m.color,
      seed: m.code,
      action: moduleAction(m),
    });
  }
  return cards;
}

/** Card of a dev project. */
export function projectCard(p: Project, label = "Projet"): Card {
  const folder = p.folders.find((f) => f.git) ?? p.folders[0];
  const git = folder?.git;
  const uncommitted = p.folders.reduce((sum, f) => sum + (f.git?.uncommitted ?? 0), 0);
  return {
    id: `project-${p.name}`,
    label,
    kicker: git
      ? [git.branch, git.lastCommit ? `${git.lastCommit.date} · ${git.lastCommit.message.slice(0, 48)}` : "aucun commit"]
      : folder
        ? [folder.path]
        : ["pas de dossier de code"],
    title: p.name,
    meta: [
      { value: p.status || "Sans statut", caption: "statut" },
      ...(p.nextStep ? [{ value: "Prochaine étape", caption: p.nextStep }] : []),
      ...(git
        ? [
            {
              value: uncommitted ? plural(uncommitted, "fichier") : "Tout est commité",
              caption: uncommitted ? "pas commités" : `${plural(git.commitsLast30Days, "commit")} en 30 jours`,
            },
          ]
        : []),
    ],
    color: p.color,
    seed: `projet-${p.name}`,
    action: { text: "Ouvrir la fiche", link: p.sheet },
    folder: folder?.path,
  };
}

/** "Aujourd'hui" carousel: courses and exam of the chosen day, then active projects. */
export function todayCards(data: TodayData, day: SchoolDay): Card[] {
  const school = schoolCards(data.school, day).filter((c) => !c.id.startsWith("module-"));
  return [...school, ...data.projects.map((p) => projectCard(p, "Projet actif"))];
}

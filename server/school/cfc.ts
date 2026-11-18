// Final CFC grade, as defined by the VET ordinance (informaticien·ne CFC, art. 19):
//   final = weighted mean of the qualification areas, rounded to a tenth
//   IT skills = 80 % school modules + 20 % inter-company courses, each average rounded to a half grade, result to a tenth
//   extended basics (maths + English) = mean of the semester grades, rounded to a half grade
// Exempted areas are not counted: the other areas keep their weights and the mean is taken over them.
// Pure module: used by school-data.ts and by the tests.
import type { CfcSettings } from "../config.ts";
import type { CfcDomain, CfcGrade, CfcRequirement, Semester } from "../../shared/types.ts";

const EPSILON = 1e-9;
const MIN_GRADE = 1;
const MAX_GRADE = 6;
const PASS_GRADE = 4;

/** Whole or half grade: 4.74 → 4.5, 4.75 → 5. */
export const roundToHalf = (n: number): number => Math.round(n * 2 + EPSILON) / 2;
/** Tenth of a grade: 4.849 → 4.8, 4.85 → 4.9. */
export const roundToTenth = (n: number): number => Math.round(n * 10 + EPSILON) / 10;
const ceilToTenth = (n: number): number => Math.ceil(n * 10 - EPSILON) / 10;
const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;
const format = (n: number): string => String(roundToTenth(n * 100) / 100);
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
/** ["a", "b", "c"] → "a, b et c" */
const listInFrench = (items: string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} et ${items.at(-1)}` : (items[0] ?? "");

interface ModuleGrade {
  code: string;
  grade: number;
  inProgress: boolean;
  semesters: number;
}

/** One grade per module code (a module graded over two semesters gets the mean of both). */
export function moduleGrades(semesters: Semester[]): ModuleGrade[] {
  const byCode = new Map<string, { grades: number[]; inProgress: boolean }>();
  for (const semester of semesters)
    for (const subject of semester.subjects) {
      if (!subject.code) continue;
      const entry = byCode.get(subject.code) ?? { grades: [], inProgress: false };
      entry.grades.push(subject.average);
      entry.inProgress ||= !subject.final;
      byCode.set(subject.code, entry);
    }
  return [...byCode].map(([code, e]) => ({ code, grade: mean(e.grades), inProgress: e.inProgress, semesters: e.grades.length }));
}

/** Semester grades of the "extended basics" area (maths + English), combined with the configured weights. */
export function extendedBasicsGrades(semesters: Semester[], subjects: Record<string, number>): { grades: number[]; incomplete: string[] } {
  const weightOf = new Map(Object.entries(subjects).map(([name, w]) => [name.toLowerCase(), w]));
  const grades: number[] = [];
  const incomplete: string[] = [];
  for (const semester of semesters) {
    const parts = semester.subjects.filter((s) => weightOf.has(s.subject.toLowerCase()));
    if (!parts.length) continue;
    const total = parts.reduce((sum, s) => sum + weightOf.get(s.subject.toLowerCase())!, 0);
    grades.push(parts.reduce((sum, s) => sum + s.average * weightOf.get(s.subject.toLowerCase())!, 0) / total);
    if (parts.length < weightOf.size) incomplete.push(`${semester.name} (seulement ${parts.map((s) => s.subject).join(", ")})`);
  }
  return { grades, incomplete };
}

export function computeCfcGrade(semesters: Semester[], settings: CfcSettings): CfcGrade | null {
  const interCompany = new Set(settings.interCompanyModules);
  const modules = moduleGrades(semesters);
  const school = modules.filter((m) => !interCompany.has(m.code));
  const courses = modules.filter((m) => interCompany.has(m.code));
  const { grades: basics, incomplete } = extendedBasicsGrades(semesters, settings.extendedBasicsSubjects);
  if (!modules.length && !basics.length) return null;

  const assumptions: string[] = [];
  const warnings: string[] = [];

  // IT skills: school modules (80 %) + inter-company courses (20 %)
  const schoolAverage = school.length ? roundToHalf(mean(school.map((m) => m.grade))) : null;
  const coursesAverage = courses.length ? roundToHalf(mean(courses.map((m) => m.grade))) : null;
  const { schoolModules, interCompanyCourses } = settings.itSkillsShares;
  let itSkills: number | null = null;
  if (schoolAverage !== null && coursesAverage !== null)
    itSkills = roundToTenth((schoolModules * schoolAverage + interCompanyCourses * coursesAverage) / (schoolModules + interCompanyCourses));
  else if (schoolAverage !== null || coursesAverage !== null) {
    itSkills = roundToTenth((schoolAverage ?? coursesAverage)!);
    assumptions.push(
      schoolAverage === null
        ? "Pas encore de module d'école noté : compétences informatiques calculées avec les cours interentreprises seuls."
        : "Pas encore de cours interentreprises noté : compétences informatiques calculées avec les modules d'école seuls.",
    );
  }
  const inProgress = modules.filter((m) => m.inProgress);
  if (inProgress.length)
    assumptions.push(
      `${plural(inProgress.length, "module")} encore en cours (${inProgress.map((m) => m.code).join(", ")}) : leur moyenne actuelle est comptée.`,
    );
  for (const m of modules.filter((x) => x.semesters > 1))
    assumptions.push(`${m.code} est noté sur ${m.semesters} semestres : moyenne des deux (${format(m.grade)}).`);

  // Extended basics: mean of the semester grades
  const basicsGrade = basics.length ? roundToHalf(mean(basics)) : null;
  const subjectNames = Object.keys(settings.extendedBasicsSubjects);
  if (subjectNames.length > 1) {
    const equal = new Set(Object.values(settings.extendedBasicsSubjects)).size === 1;
    assumptions.push(
      `${subjectNames.join(" + ")} : ${equal ? "moyenne simple" : "moyenne pondérée"} des branches à chaque semestre (l'école ne donne qu'une note semestrielle pour ce domaine).`,
    );
  }
  for (const semester of incomplete) assumptions.push(`Semestre incomplet : ${semester}.`);

  const w = settings.weights;
  const draft: Omit<CfcDomain, "weight">[] = [
    {
      key: "practicalWork",
      label: "Travail pratique (TPI)",
      writtenWeight: w.practicalWork,
      grade: null,
      status: "pending",
      eliminatory: true,
      detail: "en fin de formation",
    },
    settings.generalEducationExempt
      ? {
          key: "generalEducation",
          label: "Culture générale",
          writtenWeight: w.generalEducation,
          grade: null,
          status: "exempt",
          eliminatory: false,
          detail: "dispensé : non comptée",
        }
      : {
          key: "generalEducation",
          label: "Culture générale",
          writtenWeight: w.generalEducation,
          grade: null,
          status: "pending",
          eliminatory: false,
          detail: "en fin de formation",
        },
    {
      key: "itSkills",
      label: "Compétences informatiques",
      writtenWeight: w.itSkills,
      grade: itSkills,
      status: itSkills === null ? "pending" : "known",
      eliminatory: true,
      detail: [
        `modules d'école ${schoolAverage ?? "pas encore notés"}${school.length ? ` (${plural(school.length, "module")})` : ""}`,
        `cours interentreprises ${coursesAverage ?? "pas encore notés"}${courses.length ? ` (${plural(courses.length, "module")})` : ""}`,
      ].join(" · "),
    },
    {
      key: "extendedBasics",
      label: "Maths + anglais",
      writtenWeight: w.extendedBasics,
      grade: basicsGrade,
      status: basicsGrade === null ? "pending" : "known",
      eliminatory: false,
      detail: `${basics.length} / ${settings.extendedBasicsSemesters} semestres notés`,
    },
  ];
  const counted = draft.filter((d) => d.status !== "exempt");
  const totalWeight = counted.reduce((sum, d) => sum + d.writtenWeight, 0);
  const domains: CfcDomain[] = draft.map((d) => ({
    ...d,
    weight: d.status === "exempt" ? 0 : roundToTenth((d.writtenWeight / totalWeight) * 100),
  }));

  for (const d of domains)
    if (d.eliminatory && d.grade !== null && d.grade < PASS_GRADE) warnings.push(`${d.label} sous 4 : c'est une note éliminatoire.`);

  const known = counted.filter((d) => d.grade !== null);
  const pending = counted.filter((d) => d.grade === null);
  const knownWeight = known.reduce((sum, d) => sum + d.writtenWeight, 0);
  const knownSum = known.reduce((sum, d) => sum + d.writtenWeight * d.grade!, 0);
  const provisional = knownWeight ? roundToTenth(knownSum / knownWeight) : null;

  // Grade needed on every pending domain (same grade on each) to reach each target after rounding
  const pendingWeight = pending.reduce((sum, d) => sum + d.writtenWeight, 0);
  const floor = pending.some((d) => d.eliminatory) ? PASS_GRADE : MIN_GRADE;
  const required: CfcRequirement[] = pendingWeight
    ? settings.targets.map((target) => {
        const raw = ((target - 0.05) * totalWeight - knownSum) / pendingWeight;
        const grade = Math.max(ceilToTenth(raw), floor);
        return { target, grade: grade > MAX_GRADE ? null : grade, alreadySure: raw <= floor };
      })
    : [];

  return {
    provisional,
    domains,
    remaining: listInFrench(pending.map((d) => (d.key === "practicalWork" ? "TPI" : d.label.toLowerCase()))),
    required,
    warnings,
    assumptions,
  };
}

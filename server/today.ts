// "Aujourd'hui" space: school of the day + active projects + tasks of the whole vault + open next steps of the journal.
import { daysBetween } from "./core/dates.ts";
import { buildProjects } from "./projects/projects.ts";
import { buildSchoolData, bySeverity } from "./school/school-data.ts";
import { readJournal } from "./vault/journal.ts";
import { readDismissed, splitDismissed, withFingerprints, type ComputedTask } from "./tasks.ts";
import type { TodayData } from "../shared/types.ts";

const STALE_CHANGES_DAYS = 3;

export async function buildToday(forcedDate?: string): Promise<TodayData> {
  const school = buildSchoolData(forcedDate);
  const today = school.today;
  const active = (await buildProjects()).projects.filter((p) => !p.archived);
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

  const tasks: ComputedTask[] = []; // project tasks (school tasks come already split from buildSchoolData)
  // One task per project (all its folders grouped)
  for (const p of active) {
    const stale = p.folders.filter(
      (f) => f.git && f.git.uncommitted > 0 && (f.git.lastCommit ? daysBetween(f.git.lastCommit.date, today) : 99) > STALE_CHANGES_DAYS,
    );
    if (stale.length) {
      const count = stale.reduce((sum, f) => sum + f.git!.uncommitted, 0);
      tasks.push({
        id: `commit-${p.name}`,
        title: `${p.name} · ${plural(count, "fichier")} pas commité${count > 1 ? "s" : ""}`,
        detail: `${stale.map((f) => `${f.name} (${f.git!.uncommitted})`).join(", ")} · dernier commit il y a plus de ${STALE_CHANGES_DAYS} jours`,
        when: "à commiter",
        severity: "warning",
        color: p.color,
        link: p.sheet,
      });
    }
    const unpushed = p.folders.reduce((sum, f) => sum + (f.git?.unpushed ?? 0), 0);
    if (unpushed)
      tasks.push({
        id: `push-${p.name}`,
        title: `${p.name} · ${plural(unpushed, "commit")} pas poussé${unpushed > 1 ? "s" : ""}`,
        detail: p.folders
          .filter((f) => f.git?.unpushed)
          .map((f) => `${f.name} (${f.git!.branch})`)
          .join(", "),
        when: "à pousser",
        severity: "info",
        color: p.color,
        link: p.sheet,
      });
  }
  for (const p of active.slice(0, 2).filter((x) => x.nextStep))
    tasks.push({
      id: `step-${p.name}`,
      title: `${p.name} · prochaine étape`,
      detail: p.nextStep,
      when: "projet",
      severity: "info",
      color: p.color,
      link: p.sheet,
    });

  // Open next steps of the journal (last 14 days, except "aucune…")
  const journal = readJournal()
    .filter((e) => e.nextStep && !/^aucun/i.test(e.nextStep) && daysBetween(e.date, today) <= 14)
    .slice(0, 6);
  const projectTasks = splitDismissed(withFingerprints(tasks), readDismissed());
  return {
    school,
    projects: active.slice(0, 3),
    tasks: [...school.tasks, ...projectTasks.visible].sort(bySeverity),
    hiddenTasks: [...school.hiddenTasks, ...projectTasks.hidden],
    journal,
  };
}

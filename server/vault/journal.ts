// Assistant journal (one note per day: YYYY-MM-DD.md) and activity over 90 days.
import { config } from "../config.ts";
import { addDays, toIsoDate, today as todayDate } from "../core/dates.ts";
import { buildProjects } from "../projects/projects.ts";
import { vaultIndex } from "./vault-index.ts";
import type { ActivityData, ActivityDay, CommitEntry, JournalEntry, ProjectActivity } from "../../shared/types.ts";

/** Text of a bullet "- **Label** : value", without Markdown formatting. Pure: used by tests. */
export function bulletValue(section: string, labelPattern: string): string {
  const match = section.match(new RegExp(`^- \\*\\*(?:${labelPattern})[^*]*\\*\\*\\s*:?\\s*(.*)$`, "mi"));
  return match
    ? match[1]
        .replace(/\*\*|`|\[\[([^\]|]*\|)?|\]\]/g, "")
        .trim()
        .slice(0, 240)
    : "";
}

/** Journal sections ("## title") of a day note. Pure: used by tests. */
export function parseJournalNote(text: string, date: string, link: string): JournalEntry[] {
  const { requestLabel, nextStepLabel } = config().journal;
  return text
    .split(/^## /m)
    .slice(1)
    .map((section) => ({
      date,
      title: section
        .split("\n")[0]
        .replace(/\*\*|`/g, "")
        .trim(),
      request: bulletValue(section, requestLabel),
      nextStep: bulletValue(section, nextStepLabel),
      link,
    }));
}

export function readJournal(): JournalEntry[] {
  const folder = config().vault.journalFolder;
  const pattern = new RegExp(`^${folder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d{4}-\\d{2}-\\d{2})\\.md$`);
  const entries = vaultIndex().flatMap((note) => {
    const date = note.path.match(pattern)?.[1];
    return date ? parseJournalNote(note.text, date, note.link) : [];
  });
  // Most recent first; on the same day, the last written section first
  return entries.reverse().sort((a, b) => b.date.localeCompare(a.date));
}

const OTHER_FOLDER_COLOR = "#94aca8";
const TOP_PROJECTS = 6;
const FEED_LENGTH = 8;
const COMMITS_PER_PROJECT = 3;

export async function buildActivity(today = todayDate()): Promise<ActivityData> {
  const first = addDays(today, -89);
  const days = new Map<string, ActivityDay>();
  for (let i = 0; i < 90; i++) {
    const date = addDays(first, i);
    days.set(date, { date, notes: 0, commits: 0 });
  }
  for (const note of vaultIndex()) {
    const day = days.get(toIsoDate(new Date(note.mtime)));
    if (day) day.notes++;
  }

  // Every git folder once: project folders first (they carry the project's name and color)
  const { projects, otherFolders } = await buildProjects();
  const sources = [
    ...projects.map((p) => ({ name: p.name, color: p.color, link: p.sheet, folders: p.folders })),
    ...otherFolders.map((f) => ({ name: f.name, color: OTHER_FOLDER_COLOR, link: null, folders: [f] })),
  ];
  const seen = new Set<string>();
  const activity: ProjectActivity[] = [];
  const commits: CommitEntry[] = [];
  for (const source of sources) {
    let count = 0;
    const sourceCommits: CommitEntry[] = [];
    for (const folder of source.folders) {
      if (!folder.git || seen.has(folder.path)) continue;
      seen.add(folder.path);
      for (const [date, n] of Object.entries(folder.git.commitsPerDay)) {
        const day = days.get(date);
        if (!day) continue;
        day.commits += n;
        count += n;
      }
      for (const c of folder.git.recentCommits)
        sourceCommits.push({ at: c.at, project: source.name, color: source.color, message: c.message });
    }
    if (count) activity.push({ name: source.name, color: source.color, commits: count, link: source.link });
    // At most a few commits per project, so that the feed shows more than the busiest one
    commits.push(...sourceCommits.sort((a, b) => b.at.localeCompare(a.at)).slice(0, COMMITS_PER_PROJECT));
  }
  return {
    journal: readJournal().slice(0, 40),
    days: [...days.values()],
    projects: activity.sort((a, b) => b.commits - a.commits).slice(0, TOP_PROJECTS),
    commits: commits.sort((a, b) => b.at.localeCompare(a.at)).slice(0, FEED_LENGTH),
  };
}

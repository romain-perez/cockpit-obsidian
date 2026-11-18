// Assistant journal (one note per day: YYYY-MM-DD.md) and activity over 90 days.
import { config } from "../config.ts";
import { addDays, toIsoDate, today as todayDate } from "../core/dates.ts";
import { buildProjects } from "../projects/projects.ts";
import { vaultIndex } from "./vault-index.ts";
import type { ActivityData, ActivityDay, JournalEntry } from "../../shared/types.ts";

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
  const { projects, otherFolders } = await buildProjects();
  const seen = new Set<string>();
  for (const folder of [...projects.flatMap((p) => p.folders), ...otherFolders]) {
    if (!folder.git || seen.has(folder.path)) continue;
    seen.add(folder.path);
    for (const [date, count] of Object.entries(folder.git.commitsPerDay)) {
      const day = days.get(date);
      if (day) day.commits += count;
    }
  }
  return { journal: readJournal().slice(0, 40), days: [...days.values()] };
}

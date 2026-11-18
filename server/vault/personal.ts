// "Perso" space: folders of the personal area and recently modified notes.
import { config } from "../config.ts";
import { vaultIndex, type IndexedNote } from "./vault-index.ts";
import type { NoteSummary, PersonalData } from "../../shared/types.ts";

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const summarize = (note: IndexedNote): NoteSummary => ({
  title: note.title,
  path: note.path,
  link: note.link,
  modifiedAt: dayOf(note.mtime),
});

export function buildPersonalData(): PersonalData {
  const depth = config().vault.personalFolder.split("/").length;
  const index = vaultIndex();
  const byFolder = new Map<string, IndexedNote[]>();
  for (const note of index.filter((n) => n.area === "personal")) {
    const parts = note.path.split("/");
    if (!parts[depth + 1]) continue; // note placed directly in the personal folder
    byFolder.set(parts[depth], [...(byFolder.get(parts[depth]) ?? []), note]);
  }
  const folders = [...byFolder.entries()]
    .map(([name, notes]) => {
      const sorted = [...notes].sort((a, b) => b.mtime - a.mtime);
      // Main note: same name as the folder, possibly with a "-" prefix
      const main = notes.find((n) => n.path.split("/").at(-1)!.replace(/\.md$/, "").replace(/^-\s*/, "") === name);
      return {
        name,
        noteCount: notes.length,
        recent: sorted.slice(0, 5).map(summarize),
        link: main?.link ?? null,
        latest: sorted[0].mtime,
      };
    })
    .sort((a, b) => b.latest - a.latest)
    .map(({ latest: _latest, ...folder }) => folder);
  const recent = index
    .filter((n) => !n.isPrivate)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 20)
    .map(summarize);
  return { folders, recent };
}

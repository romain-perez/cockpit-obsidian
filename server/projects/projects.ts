// Dev projects: project sheets of the vault (front matter « espace: projets ») + git status of their folders.
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { config, expandHome, toTilde } from "../config.ts";
import { colorFor } from "../core/hash.ts";
import { wikiLinkTarget } from "../core/markdown.ts";
import { vaultIndex, type IndexedNote } from "../vault/vault-index.ts";
import { gitStatus } from "./git.ts";
import type { CodeFolder, Project, ProjectsData } from "../../shared/types.ts";

const DEV_PALETTE = ["#60A5FA", "#818CF8", "#C084FC", "#38BDF8", "#A78BFA", "#22D3EE", "#93C5FD", "#E879F9", "#7DD3FC"];

async function codeFolder(path: string): Promise<CodeFolder> {
  const absolute = expandHome(path);
  let modified = 0;
  try {
    modified = statSync(absolute).mtimeMs;
    for (const entry of readdirSync(absolute))
      if (!entry.startsWith(".") && entry !== "node_modules") modified = Math.max(modified, statSync(join(absolute, entry)).mtimeMs);
  } catch {
    /* missing folder */
  }
  return {
    path: toTilde(absolute),
    name: basename(absolute),
    git: await gitStatus(absolute),
    modifiedAt: modified ? new Date(modified).toISOString().slice(0, 10) : "",
  };
}

/** Code folders found under the configured roots (depth 1 or 2). */
export function discoveredFolders(): string[] {
  const folders: string[] = [];
  const subdirectories = (path: string) =>
    readdirSync(path, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => join(path, e.name));
  for (const root of config().projects.codeRoots) {
    if (!existsSync(root.path)) continue;
    const level1 = subdirectories(root.path);
    folders.push(...(root.depth === 1 ? level1 : level1.flatMap(subdirectories)));
  }
  return folders;
}

/** "[[Note name]]" → obsidian:// link of the indexed note. */
function resolveWikiLink(value: string | undefined, index: IndexedNote[]): string | null {
  const target = wikiLinkTarget(value);
  return target ? (index.find((n) => n.path.split("/").at(-1)!.replace(/\.md$/, "") === target || n.title === target)?.link ?? null) : null;
}

export async function buildProjects(): Promise<ProjectsData> {
  const { vault, projects: settings } = config();
  const keys = settings.frontmatter;
  const index = vaultIndex();
  const sheets = index.filter((n) => n.path.startsWith(`${vault.projectsFolder}/`) && n.properties[keys.space] === keys.spaceValue);
  const projects: Project[] = await Promise.all(
    sheets.map(async (sheet) => {
      const paths = [sheet.properties[keys.folder], ...(sheet.properties[keys.linkedFolders] ?? "").split(",")]
        .map((p) => p?.trim())
        .filter(Boolean) as string[];
      let name = sheet.path.split("/").at(-1)!.replace(/\.md$/, "");
      if (settings.sheetSuffix && name.endsWith(settings.sheetSuffix)) name = name.slice(0, -settings.sheetSuffix.length);
      const status = sheet.properties[keys.status] ?? "";
      return {
        name,
        sheet: sheet.link,
        status,
        nextStep: sheet.properties[keys.nextStep] ?? "",
        folders: await Promise.all(paths.map(codeFolder)),
        repository: sheet.properties[keys.repository] || null,
        knowledgeBase: resolveWikiLink(sheet.properties[keys.knowledgeBase], index),
        archived: settings.archivedStatusPattern.test(status),
        color: colorFor(name, DEV_PALETTE),
        updated: sheet.properties[keys.updated] ?? "",
      };
    }),
  );
  // Most active first: last commit or file change (the sheet date only counts for projects without code)
  const activity = (p: Project) =>
    (p.folders.length ? p.folders.map((f) => [f.git?.lastCommit?.date ?? "", f.modifiedAt].sort().at(-1)!) : [p.updated]).sort().at(-1) ??
    "";
  // Order: not archived first, then projects with code, then without
  projects.sort(
    (a, b) =>
      Number(a.archived) - Number(b.archived) ||
      Number(!a.folders.length) - Number(!b.folders.length) ||
      activity(b).localeCompare(activity(a)),
  );

  const known = new Set(projects.flatMap((p) => p.folders.map((f) => expandHome(f.path))));
  const otherFolders = await Promise.all(
    discoveredFolders()
      .filter((f) => !known.has(f))
      .map((f) => codeFolder(toTilde(f))),
  );
  otherFolders.sort((a, b) => (b.git?.lastCommit?.date ?? b.modifiedAt).localeCompare(a.git?.lastCommit?.date ?? a.modifiedAt));
  return { projects, otherFolders };
}

/** Allow-list for "Ouvrir dans VS Code": project folders + discovered folders. */
export async function allowedFolders(): Promise<Set<string>> {
  const { projects, otherFolders } = await buildProjects();
  return new Set([...projects.flatMap((p) => p.folders), ...otherFolders].map((f) => expandHome(f.path)));
}

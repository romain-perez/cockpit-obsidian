// Index of the whole vault (except excluded folders): title, properties, tags, date, text.
// Read only. In-memory cache: only notes modified since the last pass are read again.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { config } from "../config.ts";
import { headingTitle, obsidianLink, parseFrontmatter, parseTags, stripFrontmatter } from "../core/markdown.ts";
import type { VaultArea } from "../../shared/types.ts";

export interface IndexedNote {
  path: string; // relative to the vault
  title: string;
  folder: string;
  properties: Record<string, string>;
  tags: string[];
  mtime: number;
  text: string; // body without front matter (search)
  area: VaultArea;
  isPrivate: boolean; // inside a private folder: never in search results
  link: string;
}

/** True if this path (relative to the vault, "/" separators) must NEVER be read. */
export function isExcluded(relativePath: string, excludedFolders = config().vault.excludedFolders): boolean {
  const path = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return excludedFolders.some((folder) => path === folder.slice(0, -1) || path.startsWith(folder));
}

function areaOf(path: string): VaultArea {
  const { schoolFolder, assistantFolder, personalFolder } = config().vault;
  if (path.startsWith(`${schoolFolder}/`)) return "school";
  if (path.startsWith(`${assistantFolder}/`)) return "assistant";
  if (path.startsWith(`${personalFolder}/`)) return "personal";
  return "other";
}

const cache = new Map<string, IndexedNote>();
let lastPass = 0;

function walk(folder: string, files: { absolute: string; relative: string }[]): void {
  const root = config().vault.path;
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const absolute = join(folder, entry.name);
    const rel = relative(root, absolute).replace(/\\/g, "/");
    if (isExcluded(entry.isDirectory() ? `${rel}/` : rel)) continue;
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push({ absolute, relative: rel });
  }
}

/** Every indexed note. Walks the vault at most every 2 s and only re-reads modified files. */
export function vaultIndex(): IndexedNote[] {
  if (Date.now() - lastPass < 2000) return [...cache.values()];
  const { path: root, privateFolderName } = config().vault;
  const files: { absolute: string; relative: string }[] = [];
  walk(root, files);
  const seen = new Set<string>();
  for (const { absolute, relative: rel } of files) {
    seen.add(rel);
    const mtime = statSync(absolute).mtimeMs;
    if (cache.get(rel)?.mtime === mtime) continue;
    const text = readFileSync(absolute, "utf8");
    cache.set(rel, {
      path: rel,
      title: headingTitle(text) ?? rel.split("/").at(-1)!.replace(/\.md$/, ""),
      folder: rel.split("/").slice(0, -1).join("/"),
      properties: parseFrontmatter(text),
      tags: parseTags(text),
      mtime,
      text: stripFrontmatter(text),
      area: areaOf(rel),
      isPrivate: rel.split("/").includes(privateFolderName),
      link: obsidianLink(rel),
    });
  }
  for (const rel of cache.keys()) if (!seen.has(rel)) cache.delete(rel);
  lastPass = Date.now();
  return [...cache.values()];
}

/** Test hook: forget the cache (e.g. after changing the configuration). */
export const resetVaultIndex = (): void => {
  cache.clear();
  lastPass = 0;
};

// Small Markdown / Obsidian helpers.
import { config } from "../config.ts";

/** Properties of the YAML front matter (simple "key: value" lines; lists are ignored here). */
export function parseFrontmatter(text: string): Record<string, string> {
  const block = text.match(/^---\n([\s\S]*?)\n---/);
  const properties: Record<string, string> = {};
  if (!block) return properties;
  for (const line of block[1].split("\n")) {
    const pair = line.match(/^([^\s:][^:]*):\s*(.*)$/);
    if (pair) properties[pair[1].trim()] = pair[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return properties;
}

/** Tags of the front matter: YAML list (- a / - b) or inline list ([a, b]). */
export function parseTags(text: string): string[] {
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const tags = new Set<string>();
  const list = block.match(/^tags:\s*\n((?:\s+-\s+.*\n?)+)/m)?.[1];
  if (list)
    for (const line of list.split("\n")) {
      const tag = line.replace(/^\s*-\s*/, "").trim();
      if (tag) tags.add(tag);
    }
  const inline = block.match(/^tags:\s*\[(.*)\]/m)?.[1];
  if (inline) for (const tag of inline.split(",")) if (tag.trim()) tags.add(tag.trim());
  return [...tags];
}

export const stripFrontmatter = (text: string): string => text.replace(/^---\n[\s\S]*?\n---\n?/, "");

/** Readable title from the first "# " heading (HTML and leading emojis removed). */
export function headingTitle(text: string): string | null {
  const heading = stripFrontmatter(text).match(/^# (.*)$/m)?.[1];
  const clean = heading
    ?.replace(/<[^>]+>/g, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
  return clean || null;
}

/** Link that opens a note in Obsidian (path relative to the vault). */
export function obsidianLink(relativePath: string, vaultName = config().vault.name): string {
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relativePath.replace(/\.md$/, ""))}`;
}

/** Only links that open a note of the configured vault are accepted (POST /api/open-note). */
export function isAllowedNoteLink(link: unknown, vaultName = config().vault.name): link is string {
  const prefix = `obsidian://open?vault=${encodeURIComponent(vaultName)}`;
  return typeof link === "string" && link.length < 2000 && (link === prefix || link.startsWith(`${prefix}&file=`));
}

/** "[[Note name|alias]]" → "Note name" */
export const wikiLinkTarget = (value: string | undefined): string | null => value?.match(/\[\[([^\]|#]+)/)?.[1]?.trim() ?? null;

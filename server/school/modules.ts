// School modules of the vault: module note (-Mxxx.md), sequences, exams, refcard. Read only.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { config } from "../config.ts";
import { updateFile } from "../core/safe-write.ts";
import { parseFrenchDate } from "../core/dates.ts";
import { headingTitle, obsidianLink, parseFrontmatter, stripFrontmatter } from "../core/markdown.ts";
import type { ModuleExam, Sequence } from "../../shared/types.ts";

export interface ModuleRecord {
  code: string;
  title: string;
  year: string;
  finished: boolean;
  category: string;
  color: string;
  sequences: Sequence[];
  exams: ModuleExam[];
  link: string;
  refcard: string | null;
  notePath: string; // absolute path of the module note (server only, never sent to the browser)
}

const subfolders = (path: string): string[] =>
  existsSync(path)
    ? readdirSync(path)
        .map((name) => join(path, name))
        .filter((p) => statSync(p).isDirectory())
    : [];

/** Sequence title from its heading: HTML, emojis and "Séquence N —" removed. */
function sequenceTitle(text: string, number: number): string {
  const clean = (headingTitle(text) ?? "").replace(/^Séquence\s+\d+\s*[—:–-]\s*/i, "").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : `Séquence ${number}`;
}

export function readModules(): ModuleRecord[] {
  const { vault, school } = config();
  const link = (absolute: string) => obsidianLink(relative(vault.path, absolute));
  const modules: ModuleRecord[] = [];
  for (const yearFolder of subfolders(join(vault.path, vault.schoolFolder)).filter((p) => school.yearFolderPattern.test(p))) {
    const year = yearFolder.split("/").at(-1)!;
    const candidates = subfolders(yearFolder).flatMap((p) =>
      p.endsWith(school.finishedFolderName) ? subfolders(p).map((q) => ({ folder: q, finished: true })) : [{ folder: p, finished: false }],
    );
    for (const { folder, finished } of candidates) {
      const files = readdirSync(folder);
      const note = files.find((f) => school.moduleNotePattern.test(f));
      if (!note) continue;
      const text = readFileSync(join(folder, note), "utf8");
      const properties = parseFrontmatter(text);
      const code = note.match(school.moduleNotePattern)![1];
      const title =
        stripFrontmatter(text)
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l && !l.startsWith("#")) ?? code;

      const sequences: Sequence[] = files
        .filter((f) => school.sequenceFilePattern.test(f))
        .map((f) => {
          const content = readFileSync(join(folder, f), "utf8");
          const number = Number(f.match(school.sequenceFilePattern)![1]);
          return {
            number,
            title: sequenceTitle(content, number),
            examDone: parseFrontmatter(content)[school.frontmatter.examDone] === "true",
            hasSource: /^Source :/m.test(content),
            link: link(join(folder, f)),
          };
        })
        .sort((a, b) => a.number - b.number);

      // Lines like "- [ ] Test 3 — vendredi 20 novembre 2026, 7:55, F119"
      const exams: ModuleExam[] = [...text.matchAll(school.examLinePattern)].map((m) => ({
        name: m[2],
        date: parseFrenchDate(m[3]),
        done: m[1].toLowerCase() === "x",
      }));

      modules.push({
        code,
        title: title.replace(/^\*+|\*+$/g, ""),
        year,
        finished,
        category: properties[school.frontmatter.category] ?? "",
        color: properties[school.frontmatter.color] || school.neutralColor,
        sequences,
        exams,
        link: link(join(folder, note)),
        notePath: join(folder, note),
        refcard: existsSync(join(folder, "refcard.md")) ? link(join(folder, "refcard.md")) : null,
      });
    }
  }
  return modules;
}

/** One record per module code (the unfinished one wins if a code exists twice). */
export function modulesByCode(): Map<string, ModuleRecord> {
  const byCode = new Map<string, ModuleRecord>();
  for (const module of readModules()) if (!byCode.has(module.code) || !module.finished) byCode.set(module.code, module);
  return byCode;
}

/** Course PDFs left in the downloads folder ("Title - M165 — ….pdf"). */
export function pendingCoursePdfs(): { code: string; title: string }[] {
  const { downloadsFolder, coursePdfPattern } = config().school;
  if (!existsSync(downloadsFolder)) return [];
  return readdirSync(downloadsFolder)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => f.match(coursePdfPattern))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ code: m[2], title: m[1].replace(/^_\s*/, "") }));
}

/** Ticks an exam line ("- [ ] Test 3 — …" → "- [x] Test 3 — …") in the module note. Returns false if not found. */
export async function tickExam(code: unknown, examName: unknown): Promise<boolean> {
  if (typeof code !== "string" || typeof examName !== "string") return false;
  const module = modulesByCode().get(code);
  if (!module) return false;
  const pattern = new RegExp(config().school.examLinePattern.source, "gm");
  const { value } = await updateFile<boolean>(module.notePath, (current) => {
    if (current === null) return { content: null, value: false };
    let ticked = false;
    const next = current.replace(pattern, (line: string, box: string, name: string) => {
      if (ticked || name !== examName || box.toLowerCase() === "x") return line;
      ticked = true;
      return line.replace("[ ]", "[x]");
    });
    return { content: ticked ? next : null, value: ticked };
  });
  return value;
}

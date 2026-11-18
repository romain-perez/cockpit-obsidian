// Exam grades (one "## semester" section per semester, one table row per subject) and category colors.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.ts";
import { obsidianLink } from "../core/markdown.ts";
import type { Semester, SubjectGrade } from "../../shared/types.ts";

/** Category color of each module, from the color groups of the Obsidian graph (path:"…/M106" OR …). */
export function graphColors(): Map<string, string> {
  const colors = new Map<string, string>();
  const file = join(config().vault.path, ".obsidian/graph.json");
  if (!existsSync(file)) return colors;
  const graph = JSON.parse(readFileSync(file, "utf8")) as { colorGroups?: { query: string; color: { rgb: number } }[] };
  for (const group of graph.colorGroups ?? []) {
    const hex = `#${group.color.rgb.toString(16).padStart(6, "0")}`;
    for (const match of group.query.matchAll(/path:"[^"]*\/(M\d+)[^"]*"/g)) if (!colors.has(match[1])) colors.set(match[1], hex);
  }
  return colors;
}

/** "4.5, 5 (x2), 5.5" → [4.5, 5, 5, 5.5] (a grade weighted x2 counts twice). */
export function parseGradeList(text: string): number[] {
  return text.split(",").flatMap((part) => {
    const match = part.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:\(x(\d+)\))?$/);
    return match ? Array<number>(Number(match[2] ?? 1)).fill(Number(match[1].replace(",", "."))) : [];
  });
}

/** Parses the grades note. Pure (colors and links injected): used by tests. */
export function parseGrades(
  text: string,
  colorOf: (code: string | null) => string,
  linkOf: (subject: string, code: string | null) => string | null,
): Semester[] {
  const semesters: Semester[] = [];
  for (const section of text.split(/^## /m).slice(1)) {
    const name = section.split("\n")[0].trim();
    const subjects: SubjectGrade[] = [];
    for (const line of section.split("\n")) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length < 2 || !/^\d/.test(cells[1])) continue; // header, separator, empty lines
      const subject = cells[0];
      const code = subject.match(/^M\d+/)?.[0] ?? null;
      subjects.push({
        subject,
        code,
        average: Number(cells[1].replace(",", ".")),
        grades: parseGradeList(cells[2] ?? ""),
        final: /définitive/i.test(cells[3] ?? ""),
        color: colorOf(code),
        link: linkOf(subject, code),
      });
    }
    if (!subjects.length) continue;
    const average = subjects.reduce((sum, s) => sum + s.average, 0) / subjects.length;
    semesters.push({ name, average: Math.round(average * 100) / 100, inProgress: subjects.some((s) => !s.final), subjects });
  }
  return semesters;
}

export function readSemesters(moduleLink: (code: string) => string | null): Semester[] {
  const { vault, school } = config();
  const file = join(vault.path, vault.gradesFile);
  if (!existsSync(file)) return [];
  const colors = graphColors();
  const courseNotes = Object.values(school.nonModuleCourses);
  return parseGrades(
    readFileSync(file, "utf8"),
    (code) => (code && (colors.get(code) ?? school.fallbackColors[code])) || school.neutralColor,
    (subject, code) => {
      if (code) return moduleLink(code);
      const course = courseNotes.find((c) => c.label === subject);
      return course ? obsidianLink(course.note) : null;
    },
  );
}

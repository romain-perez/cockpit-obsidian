// Search in the whole indexed vault (never excluded folders, never private folders).
import { vaultIndex, type IndexedNote } from "./vault-index.ts";
import type { SearchResult } from "../../shared/types.ts";

/** Lower case without accents: "Séquence" → "sequence". */
export const flatten = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const isDiacritic = (char: string) => /\p{Diacritic}/u.test(char);

/** Excerpt around the first occurrence of `term` (positions found by counting base letters). */
function excerpt(source: string, term: string): SearchResult["excerpt"] {
  const decomposed = source.normalize("NFD");
  const position = flatten(source).indexOf(term);
  if (position < 0) return null;
  let index = 0,
    letters = 0;
  while (index < decomposed.length && letters < position) {
    if (!isDiacritic(decomposed[index])) letters++;
    index++;
  }
  let end = index,
    matched = 0;
  while (end < decomposed.length && matched < term.length) {
    if (!isDiacritic(decomposed[end])) matched++;
    end++;
  }
  const tidy = (text: string) => text.normalize("NFC").replace(/\s+/g, " ");
  return {
    before: tidy(decomposed.slice(Math.max(0, index - 70), index)).replace(/^\S*\s/, "…"),
    match: tidy(decomposed.slice(index, end)),
    after: tidy(decomposed.slice(end, end + 90)).replace(/\s\S*$/, "…"),
  };
}

/** Scores: title 10, tag 6, path 4, text up to 3 per term. Every term must appear somewhere. Pure on `notes`. */
export function searchNotes(notes: IndexedNote[], query: string, limit = 20): SearchResult[] {
  const terms = flatten(query)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (!terms.length) return [];
  const results: (SearchResult & { score: number })[] = [];
  for (const note of notes) {
    if (note.isPrivate) continue;
    const source = note.text.replace(/<[^>]+>/g, ""); // without HTML tags (colored titles…)
    const title = flatten(note.title),
      tags = flatten(note.tags.join(" ")),
      path = flatten(note.path),
      text = flatten(source);
    let score = 0;
    let matchesAll = true;
    for (const term of terms) {
      const s =
        (title.includes(term) ? 10 : 0) +
        (tags.includes(term) ? 6 : 0) +
        (path.includes(term) ? 4 : 0) +
        Math.min(3, text.split(term).length - 1);
      if (!s) {
        matchesAll = false;
        break;
      }
      score += s;
    }
    if (matchesAll)
      results.push({ title: note.title, path: note.path, area: note.area, link: note.link, excerpt: excerpt(source, terms[0]), score });
  }
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...r }) => r);
}

export const search = (query: string, limit = 20): SearchResult[] => searchNotes(vaultIndex(), query, limit);

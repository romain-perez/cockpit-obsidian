import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveWikiLink } from "../server/projects/projects.ts";
import type { IndexedNote } from "../server/vault/vault-index.ts";

const note = (path: string, title: string): IndexedNote => ({
  path,
  title,
  folder: path.split("/").slice(0, -1).join("/"),
  properties: {},
  tags: [],
  mtime: 0,
  text: "",
  area: "other",
  isPrivate: false,
  link: `obsidian://${path}`,
});

// The project sheet comes first in the index and has the same displayed title as the knowledge base note.
const index = [
  note("Assistant/Projets/Cockpit — contexte.md", "Cockpit"),
  note("Perso/Dev/Cockpit/Cockpit.md", "Cockpit"),
  note("Perso/Dev/Portfolio/Portfolio KB.md", "Portfolio (React)"),
  note("École/Archives/Cockpit.md", "Ancien cockpit"),
];

test("wiki links are resolved by file name before the displayed title, like Obsidian", () => {
  assert.equal(resolveWikiLink('"[[Cockpit]]"', index.slice(0, 3)), "obsidian://Perso/Dev/Cockpit/Cockpit.md");
  assert.equal(resolveWikiLink("[[Portfolio KB|KB]]", index), "obsidian://Perso/Dev/Portfolio/Portfolio KB.md");
});

test("a path in the link chooses between notes with the same file name", () => {
  assert.equal(resolveWikiLink("[[École/Archives/Cockpit]]", index), "obsidian://École/Archives/Cockpit.md");
  assert.equal(resolveWikiLink("[[Dev/Cockpit/Cockpit.md]]", index), "obsidian://Perso/Dev/Cockpit/Cockpit.md");
});

test("the displayed title is only a fallback; unknown or empty links give null", () => {
  assert.equal(resolveWikiLink("[[Portfolio (React)]]", index), "obsidian://Perso/Dev/Portfolio/Portfolio KB.md");
  assert.equal(resolveWikiLink("[[Nothing like this]]", index), null);
  assert.equal(resolveWikiLink("", index), null);
  assert.equal(resolveWikiLink(undefined, index), null);
});

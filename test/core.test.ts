import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, daysBetween, formatClock, isIsoDate, oneHourLater, parseFrenchDate, relativeDayLabel } from "../server/core/dates.ts";
import { sha1Hex, stableNumber } from "../server/core/hash.ts";
import { headingTitle, isAllowedNoteLink, obsidianLink, parseFrontmatter, parseTags, wikiLinkTarget } from "../server/core/markdown.ts";
import { isExcluded } from "../server/vault/vault-index.ts";

test("dates", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(daysBetween("2026-11-17", "2026-11-20"), 3);
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2); // daylight saving time change
  assert.equal(relativeDayLabel("2026-11-17", "2026-11-16"), "en retard");
  assert.equal(relativeDayLabel("2026-11-17", "2026-11-18"), "demain");
  assert.equal(relativeDayLabel("2026-11-17", "2026-11-20"), "ven. 20");
  assert.equal(parseFrenchDate("vendredi 20 novembre 2026, 7:55, F119"), "2026-11-20");
  assert.equal(parseFrenchDate("bientôt"), null);
  assert.equal(formatClock("0755", 45), "08:40");
  assert.equal(oneHourLater("23:30"), "23:30");
  assert.ok(isIsoDate("2026-11-17") && !isIsoDate("17.11.2026"));
});

test("stable hashes (stored on Google: must never change)", () => {
  assert.equal(stableNumber("M165"), stableNumber("M165"));
  assert.equal(sha1Hex("cours|2026-11-17|M165|07:55"), "24f27c6a93e7842d009f694d77b2b664709bf1e7");
});

test("front matter, tags and titles", () => {
  const note = `---\ntags:\n  - claude\n  - école\ncatégorie: Données\nexamen passé: "true"\n---\n# <span style="color:red">📘 Séquence 2</span>\nTexte`;
  assert.deepEqual(parseFrontmatter(note), { tags: "", catégorie: "Données", "examen passé": "true" });
  assert.deepEqual(parseTags(note), ["claude", "école"]);
  assert.deepEqual(parseTags("---\ntags: [a, b]\n---\n"), ["a", "b"]);
  assert.equal(headingTitle(note), "Séquence 2");
  assert.equal(wikiLinkTarget("[[Portfolio (React) — KB|KB]]"), "Portfolio (React) — KB");
});

test("only links to the configured vault can be opened", () => {
  const link = obsidianLink("École/M165.md", "my vault");
  assert.equal(link, "obsidian://open?vault=my%20vault&file=%C3%89cole%2FM165");
  assert.ok(isAllowedNoteLink(link, "my vault"));
  assert.ok(isAllowedNoteLink("obsidian://open?vault=my%20vault", "my vault"));
  assert.ok(!isAllowedNoteLink("obsidian://open?vault=other&file=x", "my vault"));
  assert.ok(!isAllowedNoteLink("obsidian://open?vault=my%20vaultX", "my vault"));
  assert.ok(!isAllowedNoteLink("https://example.com", "my vault"));
  assert.ok(!isAllowedNoteLink(42, "my vault"));
});

test("excluded folders are never read, whatever the path looks like", () => {
  const excluded = ["Travail/", "Travail - Perso/", ".obsidian/"];
  assert.ok(isExcluded("Travail/notes.md", excluded));
  assert.ok(isExcluded("Travail", excluded));
  assert.ok(isExcluded("./Travail - Perso/a.md", excluded));
  assert.ok(!isExcluded("Travaux/a.md", excluded));
  assert.ok(!isExcluded("École/Travail/a.md", excluded));
});

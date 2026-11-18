import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { blocksOfDay, courseCode, parseIcs } from "../server/school/schedule.ts";
import { createTestVault, type TestVault } from "./helpers.ts";

let vault: TestVault;
before(() => {
  vault = createTestVault({
    schedule: {
      excludedCodes: ["Sport"],
      periodMinutes: 45,
      roomPrefixPattern: "^ECOLE\\s*/\\s*",
      codeRules: [
        { pattern: "éducation physique", code: "Sport" },
        { pattern: "^math", code: "MATH" },
      ],
    },
  });
});
after(() => vault.cleanup());
const ics = readFileSync(new URL("./fixtures/schedule.ics", import.meta.url), "utf8");

test("course titles become short codes", () => {
  assert.equal(courseCode("M165 Utiliser des bases de données NoSQL"), "M165");
  assert.equal(courseCode("Mathématiques"), "MATH");
  assert.equal(courseCode("M295 / 3048, 3049"), "M295");
  assert.equal(courseCode("Atelier libre"), "Atelier libre");
});

test("parseIcs reads periods, teacher and room, skips excluded courses and whole days", () => {
  const periods = parseIcs(ics);
  assert.deepEqual(
    periods.map((p) => `${p.code} ${p.start}-${p.end}`),
    ["M165 07:55-08:40", "M165 08:40-09:25", "MATH 10:30-11:15"],
  );
  assert.equal(periods[0].teacher, "Dupont Marie");
  assert.equal(periods[0].room, "F119 Labo ICT"); // "ECOLE / " prefix removed (schedule.roomPrefixPattern)
  assert.equal(periods[2].room, "B12 Salle");
  assert.equal(periods[0].date, "2026-11-17");
  assert.equal(periods[2].teacher, "Martin Paul"); // folded line, no DTEND: one period of 45 minutes
});

test("consecutive periods of the same course are merged into one block", () => {
  const blocks = blocksOfDay(parseIcs(ics), "2026-11-17");
  assert.deepEqual(
    blocks.map((b) => `${b.code} ${b.start}-${b.end}`),
    ["M165 07:55-09:25", "MATH 10:30-11:15"],
  );
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { cleanTerminalOutput, describeFiles, parseFileLists } from "../server/drive.ts";
import { agendaToWanted, isCockpitEvent, phoneEventToRow, sameEvent } from "../server/google/sync.ts";
import { parseGradeList, parseGrades } from "../server/school/grades.ts";
import { bulletValue, parseJournalNote } from "../server/vault/journal.ts";
import { flatten, searchNotes } from "../server/vault/search.ts";
import type { IndexedNote } from "../server/vault/vault-index.ts";
import { createTestVault, type TestVault } from "./helpers.ts";

let vault: TestVault;
before(() => {
  vault = createTestVault();
});
after(() => vault.cleanup());

test("grades: weights and semesters", () => {
  assert.deepEqual(parseGradeList("4.5, 5 (x2), 5.5"), [4.5, 5, 5, 5.5]); // "," separates grades
  const text = `# Notes\n## 1ère année · 1er semestre\n| Branche | Moyenne | Notes | Statut |\n|---|---|---|---|\n| M106 | 5.5 | 5.5 | définitive |\n| Maths | 4.25 | 4, 4.5 | définitive |\n## 2ème année · 1er semestre\n| Branche | Moyenne | Notes | Statut |\n|---|---|---|---|\n| M295 | 5 | 5 | en cours |\n`;
  const semesters = parseGrades(
    text,
    () => "#000000",
    () => null,
  );
  assert.equal(semesters.length, 2);
  assert.equal(semesters[0].average, 4.88);
  assert.equal(semesters[0].inProgress, false);
  assert.equal(semesters[1].inProgress, true);
  assert.equal(semesters[0].subjects[0].code, "M106");
  assert.equal(semesters[0].subjects[1].code, null);
});

test("journal: sections and bullets", () => {
  const note =
    "# 2026-11-17\n## Cockpit en anglais\n- **Demande** : tout le code en **anglais**\n- **Prochaine étape** : relire [[Cockpit — contexte|la fiche]]\n## Autre\n- **Fait** : rien\n";
  const entries = parseJournalNote(note, "2026-11-17", "obsidian://x");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].request, "tout le code en anglais");
  assert.equal(entries[0].nextStep, "relire la fiche");
  assert.equal(entries[1].nextStep, "");
  assert.equal(bulletValue("- **Prochaines étapes** : a", "Prochaine[s]? étape"), "a"); // plural accepted
});

const note = (path: string, title: string, text: string, isPrivate = false): IndexedNote => ({
  path,
  title,
  folder: "",
  properties: {},
  tags: [],
  mtime: 0,
  text,
  area: "other",
  isPrivate,
  link: `obsidian://${path}`,
});

test("search: accent-insensitive, every term required, private notes never returned", () => {
  assert.equal(flatten("Séquence Éléments"), "sequence elements");
  const notes = [
    note("a.md", "Séquence 2", "Le protocole HTTP et les requêtes"),
    note("b.md", "Autre", "on parle de sequence ici mais pas du reste"),
    note("_privé/c.md", "Séquence secrète", "HTTP", true),
  ];
  const results = searchNotes(notes, "sequence http");
  assert.deepEqual(
    results.map((r) => r.path),
    ["a.md"],
  );
  assert.equal(results[0].excerpt, null); // the excerpt comes from the text, the first term is only in the title
  assert.equal(searchNotes(notes, "x").length, 0); // terms of 2 letters minimum
  const accented = searchNotes([note("d.md", "Notes", "Les élèves de l'école")], "eleves");
  assert.equal(accented[0].excerpt?.match, "élèves");
});

test("drive: lists of the push script and French summary", () => {
  const output =
    "\x1b[1m🔍 Comparaison…\x1b[0m\n\n🆕 Nouveaux (1) :\n   M165/Séquence 3.md\n\n✏️  Modifiés (2) :\n   Anglais/Anglais.md\n   M295/-M295.md\n   (et 0 autres)\n\n(mode -n)";
  const lines = cleanTerminalOutput(output);
  assert.ok(!lines.join("").includes("\x1b"));
  const files = parseFileLists(lines);
  assert.deepEqual(files, { added: ["M165/Séquence 3.md"], modified: ["Anglais/Anglais.md", "M295/-M295.md"], deleted: [] });
  assert.equal(describeFiles(files), "1 nouveau, 2 modifiés");
  assert.deepEqual(cleanTerminalOutput("10%\r50%\r100%"), ["100%"]);
});

test("google: events over several days, both ways", () => {
  const event = (fields: Record<string, string>) => ({
    id: "x",
    date: "2026-12-21",
    start: "",
    end: "",
    endDate: "",
    type: "appointment" as const,
    title: "Vacances",
    place: "",
    module: "",
    note: "",
    color: "",
    ...fields,
  });
  // Cockpit → Google: whole days end the day after the last one (exclusive end), times end on the last day
  assert.deepEqual(agendaToWanted(event({ endDate: "2026-12-27" })).end, { date: "2026-12-28" });
  assert.equal(agendaToWanted(event({ start: "14:00", end: "10:00", endDate: "2026-12-23" })).end.dateTime, "2026-12-23T10:00:00");
  // one-day events are sent exactly as before
  assert.deepEqual(agendaToWanted(event({})).end, { date: "2026-12-22" });
  assert.equal(agendaToWanted(event({ start: "14:00", end: "15:00" })).end.dateTime, "2026-12-21T15:00:00");
  // Google → Cockpit
  const fromPhone = (start: object, end: object) => phoneEventToRow({ summary: "Camp", start, end });
  assert.deepEqual(
    [fromPhone({ date: "2026-12-21" }, { date: "2026-12-28" })].map((r) => [r?.start, r?.end, r?.endDate]),
    [["", "", "2026-12-27"]],
  );
  assert.equal(fromPhone({ date: "2026-12-21" }, { date: "2026-12-22" })?.endDate, "");
  const timed = fromPhone({ dateTime: "2026-12-05T14:00:00+01:00" }, { dateTime: "2026-12-07T10:00:00+01:00" });
  assert.deepEqual([timed?.start, timed?.end, timed?.endDate], ["14:00", "10:00", "2026-12-07"]);
  const untilMidnight = fromPhone({ dateTime: "2026-12-05T22:00:00+01:00" }, { dateTime: "2026-12-06T00:00:00+01:00" });
  assert.deepEqual([untilMidnight?.end, untilMidnight?.endDate], ["", ""]);
});

test("google: phone events become agenda rows, Cockpit events are recognized", () => {
  assert.deepEqual(
    phoneEventToRow({
      summary: "Dentiste",
      location: "Fribourg",
      start: { dateTime: "2026-11-20T14:00:00+01:00" },
      end: { dateTime: "2026-11-20T15:00:00+01:00" },
    }),
    {
      date: "2026-11-20",
      start: "14:00",
      end: "15:00",
      endDate: "",
      type: "appointment",
      title: "Dentiste",
      place: "Fribourg",
      module: "",
      note: "",
    },
  );
  assert.equal(phoneEventToRow({ summary: "📝 Test 3 M295", start: { date: "2026-11-20" } })?.type, "exam");
  assert.equal(phoneEventToRow({ summary: "📝 Test 3 M295", start: { date: "2026-11-20" } })?.module, "M295");
  assert.equal(phoneEventToRow({ summary: "TEST du nouveau calendrier", start: { date: "2026-11-20" } })?.type, "appointment");
  assert.equal(phoneEventToRow({ start: { date: "2026-11-20" } }), null);
  assert.ok(isCockpitEvent({ id: "x", extendedProperties: { private: { cockpit: "1" } } }));
  assert.ok(isCockpitEvent({ id: "24f27c6a93e7842d009f694d77b2b664709bf1e7" }));
  assert.ok(!isCockpitEvent({ id: "abc123_phone" }));
  const wanted = {
    id: "a",
    summary: "M165",
    start: { dateTime: "2026-11-17T07:55:00", timeZone: "Europe/Zurich" },
    end: { dateTime: "2026-11-17T09:25:00", timeZone: "Europe/Zurich" },
  };
  assert.ok(
    sameEvent(wanted, {
      summary: "M165",
      start: { dateTime: "2026-11-17T07:55:00+01:00" },
      end: { dateTime: "2026-11-17T09:25:00+01:00" },
    }),
  );
  assert.ok(
    !sameEvent(wanted, {
      summary: "M165",
      location: "F119",
      start: { dateTime: "2026-11-17T07:55:00+01:00" },
      end: { dateTime: "2026-11-17T09:25:00+01:00" },
    }),
  );
});

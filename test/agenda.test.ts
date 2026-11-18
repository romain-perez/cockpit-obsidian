import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import {
  addEvent,
  HEADER,
  normalizeRow,
  parseAgenda,
  readAgenda,
  removeEvent,
  renderAgenda,
  rowId,
  updateEvent,
  upsertEvent,
  validateRow,
  type AgendaRow,
} from "../server/agenda.ts";
import { createTestVault, type TestVault } from "./helpers.ts";

let vault: TestVault;
before(() => {
  vault = createTestVault();
});
after(() => vault.cleanup());
const agendaText = () => readFileSync(`${vault.config.vault.path}/${vault.config.vault.agendaFile}`, "utf8");

const row = (fields: Partial<AgendaRow> = {}): AgendaRow => ({
  date: "2026-11-20",
  start: "14:00",
  end: "",
  type: "appointment",
  title: "Dentiste",
  place: "Fribourg",
  module: "",
  note: "",
  ...fields,
});

test("row ids never change (they are stored in the phone sync state)", () => {
  // Value produced by the first version of the Cockpit for this row
  assert.equal(rowId(row()), "g3jbni");
  assert.notEqual(rowId(row({ type: "exam" })), rowId(row()));
});

test("the file keeps its French format: types rdv / examen", () => {
  const text = renderAgenda(null, [row(), row({ type: "exam", title: "Test 3", module: "M295", date: "2026-11-21" })]);
  assert.ok(text.includes(HEADER));
  assert.match(text, /\| 2026-11-20 \| 14:00 \|  \| rdv \| Dentiste \| Fribourg \|/);
  assert.match(text, /\| examen \| Test 3 \|/);
  assert.deepEqual(
    parseAgenda(text).map((e) => e.type),
    ["appointment", "exam"],
  );
});

test("rewriting the table keeps everything written around it", () => {
  const original = `# Mon agenda\n\nTexte avant.\n\n${HEADER}\n|---|---|---|---|---|---|---|---|\n| 2026-01-01 |  |  | rdv | Ancien |  |  |  |\n\nTexte après.\n`;
  const text = renderAgenda(original, [row()]);
  assert.ok(text.startsWith("# Mon agenda\n\nTexte avant."));
  assert.ok(text.endsWith("\nTexte après.\n"));
  assert.ok(!text.includes("Ancien"));
});

test("received fields are cleaned and validated (French messages)", () => {
  const clean = normalizeRow({ date: "2026-11-20", title: "A | B\nC", type: "exam", module: "m295" });
  assert.equal(clean.title, "A B C");
  assert.equal(clean.module, "M295");
  assert.equal(validateRow(row({ date: "20.11.2026" })), "Date invalide (format AAAA-MM-JJ).");
  assert.equal(validateRow(row({ start: "14:00", end: "13:00" })), "La fin doit être après le début.");
  assert.equal(validateRow(row({ title: "" })), "Il faut un titre.");
  assert.equal(validateRow(row({ module: "X1" })), "Module invalide (ex. M295).");
  assert.equal(validateRow(row()), null);
});

test("add, refuse a duplicate, remove", async () => {
  const added = await addEvent({ ...row() });
  assert.deepEqual(added, { ok: true, id: "g3jbni" });
  assert.equal((await addEvent({ ...row() })).ok, false);
  assert.equal(readAgenda().length, 1);
  assert.equal(await removeEvent("g3jbni"), true);
  assert.equal(await removeEvent("g3jbni"), false);
  assert.equal(readAgenda().length, 0);
  assert.ok(agendaText().includes(HEADER));
});

test("concurrent additions are all kept (isolation)", async () => {
  await Promise.all(Array.from({ length: 25 }, (_, i) => addEvent({ ...row({ title: `Rendez-vous ${i}` }) })));
  assert.equal(readAgenda().length, 25);
  await Promise.all(readAgenda().map((e) => removeEvent(e.id)));
  assert.equal(readAgenda().length, 0);
});

test("upsert replaces a row in one write (phone event changed)", async () => {
  const first = await upsertEvent({ ...row({ title: "Coiffeur" }) });
  const second = await upsertEvent({ ...row({ title: "Coiffeur", start: "15:00" }) }, first);
  assert.notEqual(first, second);
  assert.deepEqual(
    readAgenda().map((e) => e.start),
    ["15:00"],
  );
  assert.equal(await upsertEvent({ title: "" }), null);
});

test("edit a row: new id, refused if invalid, unknown or a duplicate", async () => {
  const added = await addEvent({ ...row({ title: "Rendez-vous banque", date: "2026-12-01" }) });
  assert.ok(added.ok);
  const other = await addEvent({ ...row({ title: "Dentiste", date: "2026-12-02" }) });
  assert.ok(other.ok);

  const edited = await updateEvent(added.id, {
    ...row({ title: "Rendez-vous banque", date: "2026-12-01", start: "09:00", note: "documents" }),
  });
  assert.ok(edited.ok);
  assert.notEqual(edited.id, added.id); // the start time is part of the id
  const saved = readAgenda().find((e) => e.id === edited.id)!;
  assert.equal(saved.note, "documents");
  assert.equal(readAgenda().filter((e) => e.title === "Rendez-vous banque").length, 1);

  assert.deepEqual(await updateEvent("nope", { ...row() }), { ok: false, error: "Événement introuvable.", notFound: true });
  assert.equal((await updateEvent(edited.id, { ...row({ title: "" }) })).ok, false);
  const duplicate = await updateEvent(edited.id, { ...row({ title: "Dentiste", date: "2026-12-02" }) });
  assert.deepEqual(duplicate, { ok: false, error: "Cet événement existe déjà.", duplicate: true });

  await Promise.all(readAgenda().map((e) => removeEvent(e.id)));
});

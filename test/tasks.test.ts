import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { tickExam } from "../server/school/modules.ts";
import { dismissTask, readDismissed, restoreTask, splitDismissed, taskFingerprint, withFingerprints } from "../server/tasks.ts";
import type { Task } from "../shared/types.ts";
import { createTestVault, type TestVault } from "./helpers.ts";

let vault: TestVault;
let notePath: string;
before(() => {
  vault = createTestVault();
  vault.config.server.stateFolder = join(vault.root, "state");
  mkdirSync(vault.config.server.stateFolder);
  notePath = vault.write(
    "École/2ème année/M999 Test/-M999.md",
    "---\ncatégorie: Test\n---\nModule de test\n\n- [x] Test 1 — vendredi 6 novembre 2026\n- [ ] Test 2 — vendredi 13 novembre 2026\n- [ ] Test 3 — vendredi 20 novembre 2026\n",
  );
});
after(() => vault.cleanup());

const task = (id: string, title: string, detail: string): Task =>
  withFingerprints([{ id, title, detail, when: "", severity: "info", color: "#000000" }])[0];

test("a hidden task comes back when its title or detail changes", () => {
  const original = task("commit-Demo", "Demo · 3 fichiers pas commités", "demo (3)");
  const dismissed = { [original.id]: original.fingerprint };
  assert.deepEqual(
    splitDismissed([original], dismissed).hidden.map((t) => t.id),
    ["commit-Demo"],
  );
  const changed = task("commit-Demo", "Demo · 5 fichiers pas commités", "demo (5)");
  assert.deepEqual(
    splitDismissed([changed], dismissed).visible.map((t) => t.id),
    ["commit-Demo"],
  );
  assert.equal(taskFingerprint(original), taskFingerprint({ title: original.title, detail: original.detail }));
});

test("dismiss and restore are saved, old entries are pruned", async () => {
  assert.equal(await dismissTask("old-task", "x", new Set(["old-task"])), true);
  assert.equal(await dismissTask("step-Demo", "abc", new Set(["step-Demo"])), true);
  assert.deepEqual(readDismissed(), { "step-Demo": "abc" }); // old-task no longer exists: pruned
  assert.equal(await dismissTask("", "abc", new Set()), false);
  assert.equal(await restoreTask("step-Demo"), true);
  assert.deepEqual(readDismissed(), {});
  assert.equal(await restoreTask("step-Demo"), false);
});

test("ticking an exam changes only its line in the module note", async () => {
  assert.equal(await tickExam("M999", "Test 2"), true);
  const text = readFileSync(notePath, "utf8");
  assert.match(text, /^- \[x\] Test 2 — vendredi 13 novembre 2026$/m);
  assert.match(text, /^- \[ \] Test 3 — vendredi 20 novembre 2026$/m);
  assert.equal(await tickExam("M999", "Test 2"), false); // already ticked
  assert.equal(await tickExam("M999", "Test 9"), false);
  assert.equal(await tickExam("M000", "Test 1"), false);
});

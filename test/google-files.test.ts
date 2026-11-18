import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { writeJsonAtomic } from "../server/core/safe-write.ts";
import { googleFile, releasePhoneRow, RELEASED_PREFIX } from "../server/google/files.ts";
import { createTestVault, type TestVault } from "./helpers.ts";

let vault: TestVault;
before(() => {
  vault = createTestVault();
  const secrets = join(vault.root, "secrets");
  mkdirSync(secrets);
  vault.config.google.secretsFolder = secrets;
});
after(() => vault.cleanup());

test("a phone row edited in the Cockpit is released (the next sync replaces the phone event)", async () => {
  await writeJsonAtomic(googleFile.phoneEvents(), {
    phoneEventA: { row: "abc", updated: "2026-11-18T10:00:00Z" },
    phoneEventB: { row: "def", updated: "2026-11-18T10:00:00Z" },
  });
  assert.equal(await releasePhoneRow("abc"), true);
  const known = JSON.parse(readFileSync(googleFile.phoneEvents(), "utf8"));
  assert.equal(known.phoneEventA.row, `${RELEASED_PREFIX}abc`);
  assert.equal(known.phoneEventB.row, "def");
  assert.equal(await releasePhoneRow("not-from-the-phone"), false);
});

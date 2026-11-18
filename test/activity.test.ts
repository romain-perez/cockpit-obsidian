import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { buildActivity } from "../server/vault/journal.ts";
import { createTestVault, type TestVault } from "./helpers.ts";

let vault: TestVault;
let repo: string;
const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });

before(() => {
  vault = createTestVault();
  repo = join(vault.root, "code", "demo");
  mkdirSync(repo, { recursive: true });
  execFileSync("git", ["init", "-q", repo]);
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  for (const message of ["Premier commit", "Deuxième commit"]) {
    writeFileSync(join(repo, "file.txt"), message);
    git("add", ".");
    git("commit", "-q", "-m", message);
  }
  vault.config.projects.codeRoots = [{ path: join(vault.root, "code"), depth: 1, group: "Code" }];
  vault.write(`${vault.config.vault.projectsFolder}/Démo.md`, `---\nespace: projets\ndossier: ${repo}\n---\n# Démo\n`);
});
after(() => vault.cleanup());

test("activity: commits per project and most recent commits first", async () => {
  const activity = await buildActivity();
  assert.deepEqual(
    activity.projects.map((p) => [p.name, p.commits]),
    [["Démo", 2]],
  );
  assert.deepEqual(
    activity.commits.map((c) => [c.project, c.message]),
    [
      ["Démo", "Deuxième commit"],
      ["Démo", "Premier commit"],
    ],
  );
  assert.equal(
    activity.days.reduce((sum, d) => sum + d.commits, 0),
    2,
  );
  assert.ok(activity.days.at(-1)!.notes >= 1); // the project sheet was just written
});

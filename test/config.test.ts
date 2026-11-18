import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig, ConfigError, deepMerge, expandHome, parseJsonc, publicConfig } from "../server/config.ts";
import { createTestVault } from "./helpers.ts";

test("parseJsonc accepts comments and trailing commas, but keeps // inside strings", () => {
  const value = parseJsonc(`{
    // comment
    "url": "http://example.com/a//b", /* block */
    "list": [1, 2,],
  }`);
  assert.deepEqual(value, { url: "http://example.com/a//b", list: [1, 2] });
});

test("deepMerge merges objects and replaces arrays", () => {
  assert.deepEqual(deepMerge({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { c: 3 }, list: [9] }), { a: { b: 1, c: 3 }, list: [9] });
});

test("vault.path is the only required value: everything else has a default", () => {
  const vault = createTestVault();
  const { config, warnings } = buildConfig({ vault: { path: vault.config.vault.path } });
  assert.equal(config.server.port, 4321);
  assert.equal(config.vault.name, "vault"); // name of the folder
  assert.ok(config.vault.excludedFolders.includes(".obsidian/")); // always excluded
  assert.equal(config.drive.enabled, false);
  assert.ok(warnings.some((w) => w.startsWith("schedule"))); // no schedule configured
  vault.cleanup();
});

test("every problem is reported at once, in French", () => {
  assert.throws(
    () =>
      buildConfig({
        vault: { path: "/does/not/exist" },
        server: { port: 70000 },
        school: { neutralColor: "red" },
        schedule: { codeRules: [{ pattern: "(", code: "X" }] },
      }),
    (e: unknown) => {
      assert.ok(e instanceof ConfigError);
      assert.equal(e.problems.length, 4);
      assert.match(e.message, /Configuration invalide/);
      return true;
    },
  );
  assert.throws(() => buildConfig({}), /vault.path : texte attendu/);
});

test("environment variables override the file", () => {
  const vault = createTestVault();
  const { config } = buildConfig(
    { vault: { path: "/nowhere" } },
    { env: { COCKPIT_VAULT: vault.config.vault.path, COCKPIT_PORT: "5000" } },
  );
  assert.equal(config.vault.path, vault.config.vault.path);
  assert.equal(config.server.port, 5000);
  assert.ok(config.server.allowedOrigins.includes("http://localhost:5000"));
  vault.cleanup();
});

test("an optional feature that cannot work is switched off with a warning", () => {
  const vault = createTestVault();
  const { config, warnings } = buildConfig({
    vault: { path: vault.config.vault.path },
    drive: { enabled: true, command: "/no/such/script" },
  });
  assert.equal(config.drive.enabled, false);
  assert.ok(warnings.some((w) => w.includes("Drive désactivée")));
  vault.cleanup();
});

test("the public configuration contains no absolute path nor secret", () => {
  const vault = createTestVault({
    drive: { enabled: false, command: "/home/someone/bin/push" },
    google: { secretsFolder: "/home/someone/.config/cockpit" },
  });
  const text = JSON.stringify(publicConfig(vault.config));
  assert.ok(!text.includes(vault.config.vault.path));
  assert.ok(!text.includes("/home/someone"));
  vault.cleanup();
});

test("drive.webUrl: optional https address, given to the interface", () => {
  const vault = createTestVault();
  const path = vault.config.vault.path;
  assert.equal(buildConfig({ vault: { path } }).config.drive.webUrl, null);
  const url = "https://drive.google.com/drive/folders/abc123";
  const { config } = buildConfig({ vault: { path }, drive: { webUrl: url } });
  assert.equal(publicConfig(config).drive.webUrl, url);
  assert.throws(() => buildConfig({ vault: { path }, drive: { webUrl: "http://drive.google.com" } }), /drive.webUrl : adresse https/);
  assert.throws(() => buildConfig({ vault: { path }, drive: { webUrl: "javascript:alert(1)" } }), /drive.webUrl/);
  vault.cleanup();
});

test("expandHome only replaces a leading ~", () => {
  assert.ok(!expandHome("~/vault").startsWith("~"));
  assert.equal(expandHome("/a/~b"), "/a/~b");
});

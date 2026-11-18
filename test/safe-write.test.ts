import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { ConcurrentModificationError, updateFile, updateJson, writeFileAtomic, writeJsonAtomic } from "../server/core/safe-write.ts";

const dir = mkdtempSync(join(tmpdir(), "cockpit-safe-write-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const temporaryFiles = () => readdirSync(dir).filter((f) => f.endsWith(".tmp"));

test("atomicity: the whole new content or nothing, no temporary file left", () => {
  const file = join(dir, "atomic.txt");
  writeFileAtomic(file, "first");
  writeFileAtomic(file, "second");
  assert.equal(readFileSync(file, "utf8"), "second");
  assert.deepEqual(temporaryFiles(), []);
});

test("isolation: 200 concurrent read-modify-write never lose an update", async () => {
  const file = join(dir, "counter.txt");
  writeFileAtomic(file, "0");
  await Promise.all(
    Array.from({ length: 200 }, () => updateFile(file, (current) => ({ content: String(Number(current) + 1), value: null }))),
  );
  assert.equal(readFileSync(file, "utf8"), "200");
});

test("isolation: a change made by another program meanwhile is not overwritten", async () => {
  const file = join(dir, "external.txt");
  writeFileAtomic(file, "a");
  let calls = 0;
  await updateFile(file, (current) => ({ content: `${current}+mine`, value: null }), {
    beforeCommit: () => {
      if (calls++ === 0) writeFileSync(file, "edited in Obsidian");
    },
  });
  assert.equal(readFileSync(file, "utf8"), "edited in Obsidian+mine");
});

test("isolation: gives up with a clear error if the file keeps changing", async () => {
  const file = join(dir, "busy.txt");
  writeFileAtomic(file, "0");
  let n = 0;
  await assert.rejects(
    updateFile(file, (current) => ({ content: `${current}!`, value: null }), {
      retries: 2,
      beforeCommit: () => writeFileSync(file, String(++n)),
    }),
    ConcurrentModificationError,
  );
  assert.equal(readFileSync(file, "utf8"), String(n)); // the other program's version is kept
});

test("consistency: a content refused by validate is never written", async () => {
  const file = join(dir, "valid.txt");
  writeFileAtomic(file, "| header |");
  await assert.rejects(
    updateFile(file, () => ({ content: "broken", value: null }), { validate: (c) => (c.includes("| header |") ? null : "tableau cassé") }),
    /tableau cassé/,
  );
  assert.equal(readFileSync(file, "utf8"), "| header |");
});

test("a failing update does not block the next ones on the same file", async () => {
  const file = join(dir, "queue.txt");
  writeFileAtomic(file, "x");
  await assert.rejects(
    updateFile(file, () => {
      throw new Error("boom");
    }),
  );
  await updateFile(file, () => ({ content: "y", value: null }));
  assert.equal(readFileSync(file, "utf8"), "y");
});

test("no write when the content does not change", async () => {
  const file = join(dir, "same.txt");
  writeFileAtomic(file, "same");
  const before = statSync(file).mtimeMs;
  const { changed } = await updateFile(file, (c) => ({ content: c, value: null }));
  assert.equal(changed, false);
  assert.equal(statSync(file).mtimeMs, before);
});

test("JSON files are private (0600) and can be updated in place", async () => {
  const file = join(dir, "state.json");
  await writeJsonAtomic(file, { a: 1 });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const result = await updateJson<{ a: number; b?: number }>(file, (current) => ({ ...current!, b: 2 }));
  assert.deepEqual(result, { a: 1, b: 2 });
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { a: 1, b: 2 });
});

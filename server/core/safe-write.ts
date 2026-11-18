// Safe file writes, following the ACID properties of databases:
//
//   Atomicity    the new content is written to a temporary file, flushed, then renamed over the target.
//                rename() is atomic on the same file system: readers see the old OR the new file, never half of it.
//   Consistency  the new content can be validated before it is written, and is read back afterwards.
//   Isolation    writes to the same file go through a queue (one at a time inside this process), and an
//                optimistic check detects changes made by another program (Obsidian…) between read and write:
//                in that case the update is recomputed from the fresh content.
//   Durability   fsync() on the file, then on its directory, before the write is reported as done.
import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export class ConcurrentModificationError extends Error {}

const digest = (content: string | null) => (content === null ? "∅" : createHash("sha256").update(content).digest("hex"));
const readOrNull = (path: string): string | null => (existsSync(path) ? readFileSync(path, "utf8") : null);

function fsyncDirectory(dir: string): void {
  try {
    const fd = openSync(dir, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    /* some file systems do not allow fsync on a directory: the rename is still atomic */
  }
}

/** Atomic + durable write of a whole file. */
export function writeFileAtomic(path: string, content: string, mode = 0o644): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const temp = join(dir, `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  const fd = openSync(temp, "wx", mode);
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    try {
      unlinkSync(temp);
    } catch {
      /* already gone */
    }
    throw e;
  }
  closeSync(fd);
  try {
    renameSync(temp, path);
  } catch (e) {
    try {
      unlinkSync(temp);
    } catch {
      /* already gone */
    }
    throw e;
  }
  fsyncDirectory(dir);
}

// ---------------------------------------------------------------- isolation: one queue per file

const queues = new Map<string, Promise<unknown>>();

/** Runs `task` when every previous task on the same file is finished. */
export function withFileLock<T>(path: string, task: () => Promise<T> | T): Promise<T> {
  const previous = queues.get(path) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tail = run.catch(() => undefined);
  queues.set(path, tail);
  tail.then(() => {
    if (queues.get(path) === tail) queues.delete(path);
  });
  return run;
}

export interface UpdateOptions {
  mode?: number;
  /** Returns an error message if the new content must not be written. */
  validate?: (content: string) => string | null;
  /** Number of recomputations if another program changed the file meanwhile. */
  retries?: number;
  /** Test hook: called between the computation and the write. */
  beforeCommit?: () => void;
}

export interface UpdateResult<T> {
  changed: boolean;
  value: T;
}

/**
 * Read-modify-write of a file, isolated and atomic.
 * `transform` receives the current content (null if the file does not exist) and returns the new content
 * (or null to leave the file untouched) plus a value given back to the caller.
 */
export function updateFile<T = void>(
  path: string,
  transform: (current: string | null) => { content: string | null; value: T },
  options: UpdateOptions = {},
): Promise<UpdateResult<T>> {
  return withFileLock(path, () => {
    const retries = options.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const current = readOrNull(path);
      const before = digest(current);
      const { content, value } = transform(current);
      if (content === null || content === current) return { changed: false, value };
      const problem = options.validate?.(content);
      if (problem) throw new Error(problem);
      options.beforeCommit?.();
      // Optimistic check: has someone else written the file since we read it?
      if (digest(readOrNull(path)) !== before) {
        if (attempt < retries) continue;
        throw new ConcurrentModificationError(`${path} modifié par un autre programme pendant l'écriture`);
      }
      writeFileAtomic(path, content, options.mode);
      if (readOrNull(path) !== content) throw new Error(`${path} : contenu relu différent du contenu écrit`);
      return { changed: true, value };
    }
  });
}

// ---------------------------------------------------------------- JSON helpers (secrets, state files)

export function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

/** Atomic JSON write (0600 by default: these files hold secrets or private state). */
export function writeJsonAtomic(path: string, data: unknown, mode = 0o600): Promise<void> {
  return withFileLock(path, () => writeFileAtomic(path, `${JSON.stringify(data, null, 2)}\n`, mode));
}

/** Isolated read-modify-write of a JSON file. */
export async function updateJson<T>(path: string, change: (current: T | null) => T, mode = 0o600): Promise<T> {
  const { value } = await updateFile<T>(
    path,
    (text) => {
      const next = change(text === null ? null : (JSON.parse(text) as T));
      return { content: `${JSON.stringify(next, null, 2)}\n`, value: next };
    },
    { mode },
  );
  return value;
}

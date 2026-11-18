// Tasks marked as done by the user. Tasks are computed from the vault and git at each request; a task marked as
// done stays hidden while its fingerprint (title + detail) is the same, and comes back when it changes.
// State file: <server.stateFolder>/dismissed-tasks.json, written with safe-write.
import { join } from "node:path";
import { config } from "./config.ts";
import { stableNumber } from "./core/hash.ts";
import { readJson, updateJson } from "./core/safe-write.ts";
import type { Task } from "../shared/types.ts";

/** A task as computed by the rules, before its fingerprint is added. */
export type ComputedTask = Omit<Task, "fingerprint">;

/** Task id → fingerprint at the moment it was marked as done. */
export type Dismissed = Record<string, string>;

const dismissedFile = () => join(config().server.stateFolder, "dismissed-tasks.json");
const MAX_ID_LENGTH = 300;

export const taskFingerprint = (task: Pick<Task, "title" | "detail">): string => stableNumber(`${task.title}|${task.detail}`).toString(36);

/** Adds the fingerprint of every computed task. */
export const withFingerprints = (tasks: ComputedTask[]): Task[] => tasks.map((t) => ({ ...t, fingerprint: taskFingerprint(t) }));

export const readDismissed = (): Dismissed => readJson<Dismissed>(dismissedFile()) ?? {};

/** Visible and hidden tasks. Pure: used by tests. */
export function splitDismissed(tasks: Task[], dismissed: Dismissed): { visible: Task[]; hidden: Task[] } {
  const isHidden = (t: Task) => dismissed[t.id] === t.fingerprint;
  return { visible: tasks.filter((t) => !isHidden(t)), hidden: tasks.filter(isHidden) };
}

const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;

/** Hides a task until it changes. Entries of tasks that no longer exist are pruned at the same time. */
export async function dismissTask(id: unknown, fingerprint: unknown, existingIds: Set<string>): Promise<boolean> {
  if (!validId(id) || !validId(fingerprint)) return false;
  await updateJson<Dismissed>(
    dismissedFile(),
    (current) => ({
      ...Object.fromEntries(Object.entries(current ?? {}).filter(([taskId]) => existingIds.has(taskId))),
      [id]: fingerprint,
    }),
    0o644,
  );
  return true;
}

/** Shows a hidden task again. */
export async function restoreTask(id: unknown): Promise<boolean> {
  if (!validId(id) || !(id in readDismissed())) return false;
  await updateJson<Dismissed>(
    dismissedFile(),
    (current) => Object.fromEntries(Object.entries(current ?? {}).filter(([taskId]) => taskId !== id)),
    0o644,
  );
  return true;
}

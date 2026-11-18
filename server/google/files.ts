// Files of the Google integration, all in config.google.secretsFolder (0600, never in the vault nor the repository).
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.ts";
import { readJson, updateJson, writeJsonAtomic } from "../core/safe-write.ts";

export const googleFile = {
  client: () => join(config().google.secretsFolder, "google-client.json"), // OAuth client (downloaded from Google Cloud)
  token: () => join(config().google.secretsFolder, "google-token.json"), // refresh token
  calendars: () => join(config().google.secretsFolder, "google-calendars.json"), // ids of the two calendars
  phoneEvents: () => join(config().google.secretsFolder, "google-phone-events.json"), // phone event → agenda row
};

export type CalendarKey = "courses" | "personal";
export type CalendarIds = Partial<Record<CalendarKey, string>>;
/** Google event created on the phone → agenda row it was copied to. */
export type PhoneEvents = Record<string, { row: string; updated: string }>;

/**
 * Reads a state file, migrating it from its previous (French) format if needed.
 * The old file is removed only after the new one has been written and read back.
 */
async function readMigrated<T>(path: string, oldName: string, convert: (old: any) => T): Promise<T | null> {
  const current = readJson<T>(path);
  if (current) return current;
  const oldPath = join(config().google.secretsFolder, oldName);
  const old = readJson<unknown>(oldPath);
  if (!old) return null;
  const converted = convert(old);
  await writeJsonAtomic(path, converted);
  if (readJson<T>(path)) unlinkSync(oldPath);
  return converted;
}

export const readCalendarIds = async (): Promise<CalendarIds> =>
  (await readMigrated<CalendarIds>(googleFile.calendars(), "google-calendriers.json", (old) => ({
    courses: old.cours,
    personal: old.perso,
  }))) ?? {};

export const readPhoneEvents = async (): Promise<PhoneEvents> =>
  (await readMigrated<PhoneEvents>(googleFile.phoneEvents(), "google-import.json", (old) =>
    Object.fromEntries(
      Object.entries(old as Record<string, { ligne: string; maj: string }>).map(([id, v]) => [id, { row: v.ligne, updated: v.maj }]),
    ),
  )) ?? {};

/** Marks a phone event whose agenda row was edited in the Cockpit: the next sync deletes it from Google, the Cockpit publishes its own version. */
export const RELEASED_PREFIX = "released:";

/** Returns true if the row came from the phone. */
export async function releasePhoneRow(rowId: string): Promise<boolean> {
  const known = await readPhoneEvents();
  if (!Object.values(known).some((v) => v.row === rowId)) return false;
  await updateJson<PhoneEvents>(googleFile.phoneEvents(), (current) =>
    Object.fromEntries(
      Object.entries(current ?? {}).map(([id, v]) => [id, v.row === rowId ? { ...v, row: `${RELEASED_PREFIX}${rowId}` } : v]),
    ),
  );
  return true;
}

export const hasClient = (): boolean => existsSync(googleFile.client());
export const isConnected = (): boolean => existsSync(googleFile.token());

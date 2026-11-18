// Stable hashes. WARNING: their output is stored (agenda row ids, Google event ids, colors):
// changing these functions would duplicate every event already sent to Google.
import { createHash } from "node:crypto";

/** FNV-1a 32 bits (absolute value): same text → same number. */
export function stableNumber(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash);
}

/** SHA-1 in hexadecimal: valid Google Calendar event id (characters 0-9 a-v). */
export const sha1Hex = (text: string): string => createHash("sha1").update(text).digest("hex");

/** Pick a color from a palette, always the same one for the same name. */
export const colorFor = (name: string, palette: string[]): string => palette[stableNumber(name) % palette.length];

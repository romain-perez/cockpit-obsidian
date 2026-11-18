// Shared drive: check (command -n, read only) and upload (command -y) with live output.
// The Cockpit can only run the configured command: no free shell. Optional feature (config: drive).
import { execFile, spawn } from "node:child_process";
import { config } from "./config.ts";
import type { DriveFiles, DriveStatus, DriveUpload } from "../shared/types.ts";

const NO_FILES: DriveFiles = { added: [], modified: [], deleted: [] };
let status: DriveStatus = { state: "unknown", detail: "pas encore vérifié", checkedAt: null, running: false, files: NO_FILES, output: "" };
let upload: DriveUpload = { running: false, lines: [], exitCode: null, startedAt: null, finishedAt: null };

/** Removes terminal colors and keeps the last version of rewritten lines (\r progress bars). */
export const cleanTerminalOutput = (text: string): string[] =>
  text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .split("\n")
    .map(
      (l) =>
        l
          .split("\r")
          .filter((x) => x.trim())
          .at(-1) ?? "",
    )
    .filter((l) => !/client_id/.test(l));

/** Reads the "🆕 Nouveaux (n) : / ✏️ Modifiés / 🗑️ À supprimer" lists printed by the push script. Pure: used by tests. */
export function parseFileLists(lines: string[]): DriveFiles {
  const lists: DriveFiles = { added: [], modified: [], deleted: [] };
  let currentList: keyof DriveFiles | null = null;
  for (const line of lines) {
    if (/Nouveaux \(\d+\)/.test(line)) currentList = "added";
    else if (/Modifiés \(\d+\)/.test(line)) currentList = "modified";
    else if (/supprimer[^(]*\(\d+\)/.test(line)) currentList = "deleted";
    else if (currentList && /^\s{3}\S/.test(line) && !/^\s{3}\(/.test(line)) lists[currentList].push(line.trim());
    else if (!/^\s/.test(line)) currentList = null;
  }
  return lists;
}

/** "3 nouveaux, 1 modifié" (French, shown to the user). */
export function describeFiles(files: DriveFiles): string {
  const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n > 1 ? pluralForm : singular}`;
  return [
    files.added.length && plural(files.added.length, "nouveau", "nouveaux"),
    files.modified.length && plural(files.modified.length, "modifié", "modifiés"),
    files.deleted.length && `${files.deleted.length} à supprimer`,
  ]
    .filter(Boolean)
    .join(", ");
}

export function driveStatus(): DriveStatus {
  const { drive } = config();
  if (!drive.enabled) return { ...status, state: "unknown", detail: "Drive non configuré" };
  const ageMinutes = status.checkedAt ? (Date.now() - Date.parse(status.checkedAt)) / 60_000 : Infinity;
  if (ageMinutes > drive.checkEveryMinutes && !upload.running) checkDrive();
  return status.running && status.state === "unknown" ? { ...status, state: "checking", detail: "vérification…" } : status;
}

export function checkDrive(): void {
  const { drive } = config();
  if (!drive.enabled || status.running || upload.running) return;
  status = { ...status, running: true };
  execFile(drive.command, ["-n"], { timeout: 120_000 }, (error, stdout, stderr) => {
    const lines = cleanTerminalOutput(stdout + stderr);
    const files = parseFileLists(lines);
    const base = { running: false, checkedAt: new Date().toISOString(), files, output: lines.join("\n").trim() };
    if (/Rien à faire|déjà identique/.test(stdout)) status = { ...base, state: "upToDate", detail: "à jour" };
    else if (files.added.length + files.modified.length + files.deleted.length > 0)
      status = { ...base, state: "pending", detail: describeFiles(files) };
    else status = { ...base, state: "unknown", detail: error ? "vérification impossible" : "état inconnu" };
  });
}

export const uploadStatus = (): DriveUpload => upload;

/** Runs the upload (command -y). Refused if an upload or a check is already running. */
export function startUpload(): boolean {
  const { drive } = config();
  if (!drive.enabled || upload.running || status.running) return false;
  upload = {
    running: true,
    lines: [`$ ${drive.command.split("/").at(-1)} -y`],
    exitCode: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  const child = spawn(drive.command, ["-y"], { stdio: ["ignore", "pipe", "pipe"] });
  let rest = "";
  const read = (chunk: Buffer) => {
    const parts = (rest + chunk.toString()).split("\n");
    rest = parts.pop() ?? "";
    upload.lines.push(...cleanTerminalOutput(parts.join("\n")).filter(Boolean));
    if (upload.lines.length > 400) upload.lines = upload.lines.slice(-400);
  };
  child.stdout.on("data", read);
  child.stderr.on("data", read);
  child.on("close", (code) => {
    if (rest.trim()) upload.lines.push(...cleanTerminalOutput(rest).filter(Boolean));
    upload = { ...upload, running: false, exitCode: code, finishedAt: new Date().toISOString() };
    upload.lines.push(code === 0 ? "✓ terminé" : `✗ terminé avec le code ${code}`);
    status = { ...status, checkedAt: null }; // force a new check
    checkDrive();
  });
  return true;
}

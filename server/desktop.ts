// Desktop integration: open a note in Obsidian / a folder in the editor, and switch to their window (Hyprland).
// Apps are started THROUGH Hyprland (like a keyboard shortcut) so they inherit the session environment:
// started directly by this service, an Electron app ran under XWayland (tiny UI, window rules ignored).
import { execFile, spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface HyprlandInstance {
  signature: string; // folder name in $XDG_RUNTIME_DIR/hypr
  alive: boolean; // its control socket exists
  started: number; // time of the socket (ms), the newest instance wins
}

/**
 * Hyprland instance to talk to: the one inherited from the environment if it is still running, else the newest one.
 * The service can start before Hyprland (at boot, without HYPRLAND_INSTANCE_SIGNATURE) or outlive it (Hyprland restarted).
 */
export function pickHyprlandInstance(inherited: string | undefined, instances: HyprlandInstance[]): string | null {
  const alive = instances.filter((instance) => instance.alive);
  if (inherited && alive.some((instance) => instance.signature === inherited)) return inherited;
  return alive.sort((a, b) => b.started - a.started)[0]?.signature ?? null;
}

/** Looks for the running Hyprland instance at each call (cheap: one small folder). */
function hyprlandInstance(): string | null {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (!runtime) return null;
  const folder = join(runtime, "hypr");
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return null;
  }
  const instances = names.map((signature): HyprlandInstance => {
    try {
      const socket = statSync(join(folder, signature, ".socket.sock"));
      return { signature, alive: socket.isSocket(), started: socket.mtimeMs };
    } catch {
      return { signature, alive: false, started: 0 };
    }
  });
  return pickHyprlandInstance(process.env.HYPRLAND_INSTANCE_SIGNATURE, instances);
}

export const hyprlandAvailable = (): boolean => config().desktop.enabled && hyprlandInstance() !== null;

/** Runs hyprctl against the running instance; resolves with its output (empty on failure). */
function hyprctl(args: string[]): Promise<{ failed: boolean; out: string }> {
  const signature = hyprlandInstance();
  if (!signature) return Promise.resolve({ failed: true, out: "" });
  const env = { ...process.env, HYPRLAND_INSTANCE_SIGNATURE: signature };
  return new Promise((resolve) =>
    execFile("hyprctl", args, { timeout: 3000, env }, (error, out) => resolve({ failed: !!error, out: String(out ?? "") })),
  );
}

/** Sends a Lua command to Hyprland (hyprctl dispatch, Hyprland ≥ 0.57). */
const hyprland = (lua: string): Promise<string> => hyprctl(["dispatch", lua]).then(({ out }) => out);

async function windowExists(classPattern: string): Promise<boolean> {
  const { out } = await hyprctl(["clients", "-j"]);
  try {
    return (JSON.parse(out) as { class: string }[]).some((w) => new RegExp(classPattern).test(w.class));
  } catch {
    return false;
  }
}

/** Escapes a string for a Lua double-quoted string. */
export const luaString = (text: string): string => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
/** Wraps an argument in single quotes for the shell. */
export const shellQuote = (text: string): string => `'${text.replace(/'/g, "'\\''")}'`;

function launchThroughHyprland(command: string, argument: string): Promise<string> {
  const { launcher } = config().desktop;
  return hyprland(`hl.dsp.exec_cmd("${luaString(`${launcher ? `${launcher} ` : ""}${command} ${shellQuote(argument)}`)}")`);
}

/** Focuses a window; retries once if the app is still starting. */
function focusWindow(classPattern: string, attempt = 1): void {
  if (!hyprlandAvailable()) return;
  setTimeout(
    () => {
      void hyprctl(["dispatch", `hl.dsp.focus({ window = "${luaString(`class:${classPattern}`)}" })`]).then(({ failed, out }) => {
        if ((failed || /warning|error/i.test(out)) && attempt < 2) focusWindow(classPattern, attempt + 1);
      });
    },
    attempt === 1 ? 350 : 1800,
  );
}

/** Opens a note; if Obsidian was not running, it starts on its workspace and we follow it. */
export async function openInObsidian(link: string): Promise<void> {
  const { obsidian } = config().desktop;
  if (!hyprlandAvailable()) {
    spawn("xdg-open", [link], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  const wasRunning = await windowExists(obsidian.windowClass);
  await launchThroughHyprland(obsidian.command, link.replace(/'/g, "%27"));
  if (wasRunning || obsidian.workspace === null) return focusWindow(obsidian.windowClass);
  const selector = luaString(`class:${obsidian.windowClass}`);
  for (let i = 0; i < 40; i++) {
    // wait for the window (10 s max)
    await wait(250);
    if (await windowExists(obsidian.windowClass)) {
      await wait(300);
      await hyprland(`hl.dsp.window.move({ workspace = ${obsidian.workspace}, follow = true, window = "${selector}" })`);
      await wait(150);
      await hyprland(`hl.dsp.focus({ window = "${selector}" })`);
      return;
    }
  }
}

export async function openInEditor(folder: string): Promise<void> {
  const { editor } = config().desktop;
  if (hyprlandAvailable()) await launchThroughHyprland(editor.command, folder);
  else spawn(editor.command, [folder], { detached: true, stdio: "ignore" }).unref();
  focusWindow(editor.windowClass);
}

// Desktop integration: open a note in Obsidian / a folder in the editor, and switch to their window (Hyprland).
// Apps are started THROUGH Hyprland (like a keyboard shortcut) so they inherit the session environment:
// started directly by this service, an Electron app ran under XWayland (tiny UI, window rules ignored).
import { execFile, spawn } from "node:child_process";
import { config } from "./config.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const hyprlandAvailable = (): boolean => config().desktop.enabled && !!process.env.HYPRLAND_INSTANCE_SIGNATURE;

/** Sends a Lua command to Hyprland (hyprctl dispatch, Hyprland ≥ 0.57). */
function hyprland(lua: string): Promise<string> {
  return new Promise((resolve) => execFile("hyprctl", ["dispatch", lua], { timeout: 3000 }, (_e, out) => resolve(String(out ?? ""))));
}

function windowExists(classPattern: string): Promise<boolean> {
  return new Promise((resolve) =>
    execFile("hyprctl", ["clients", "-j"], { timeout: 3000 }, (_e, out) => {
      try {
        resolve((JSON.parse(String(out)) as { class: string }[]).some((w) => new RegExp(classPattern).test(w.class)));
      } catch {
        resolve(false);
      }
    }),
  );
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
      execFile(
        "hyprctl",
        ["dispatch", `hl.dsp.focus({ window = "${luaString(`class:${classPattern}`)}" })`],
        { timeout: 3000 },
        (error, out) => {
          if ((error || /warning|error/i.test(out)) && attempt < 2) focusWindow(classPattern, attempt + 1);
        },
      );
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

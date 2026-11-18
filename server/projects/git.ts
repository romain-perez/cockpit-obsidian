// Git status of a folder (read only), cached 5 minutes.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { GitStatus } from "../../shared/types.ts";

const run = promisify(execFile);
const CACHE_MS = 5 * 60_000;
const RECENT_COMMITS = 8;
const cache = new Map<string, { at: number; status: GitStatus | null }>();

async function git(folder: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", folder, ...args], { timeout: 8000 });
  return stdout.trim();
}

/** null if the folder is not a git repository. */
export async function gitStatus(folder: string): Promise<GitStatus | null> {
  const cached = cache.get(folder);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.status;
  let status: GitStatus | null = null;
  if (existsSync(join(folder, ".git"))) {
    const orEmpty = (p: Promise<string>) => p.catch(() => "");
    const [branch, last, recentCount, porcelain, ahead, remote, history, recent] = await Promise.all([
      orEmpty(git(folder, "branch", "--show-current")),
      orEmpty(git(folder, "log", "-1", "--format=%cs%x09%s")),
      orEmpty(git(folder, "rev-list", "--count", "--since=30.days", "HEAD")),
      orEmpty(git(folder, "status", "--porcelain")),
      git(folder, "rev-list", "--count", "@{u}..HEAD").catch(() => null),
      orEmpty(git(folder, "remote", "get-url", "origin")),
      orEmpty(git(folder, "log", "--since=90.days", "--format=%cs")),
      orEmpty(git(folder, "log", `-${RECENT_COMMITS}`, "--no-merges", "--since=90.days", "--format=%cI%x09%s")),
    ]);
    const commitsPerDay: Record<string, number> = {};
    for (const day of history.split("\n").filter(Boolean)) commitsPerDay[day] = (commitsPerDay[day] ?? 0) + 1;
    const [date, ...message] = last.split("\t");
    status = {
      branch: branch || "(détachée)",
      lastCommit: last ? { date, message: message.join("\t") } : null,
      commitsLast30Days: Number(recentCount) || 0,
      uncommitted: porcelain ? porcelain.split("\n").length : 0,
      unpushed: ahead === null ? null : Number(ahead),
      remote: remote ? remote.replace(/\.git$/, "") : null,
      commitsPerDay,
      recentCommits: recent
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [at, ...message] = line.split("\t");
          return { at, message: message.join("\t") };
        }),
    };
  }
  cache.set(folder, { at: Date.now(), status });
  return status;
}

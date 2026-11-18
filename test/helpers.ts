// Test helpers: a temporary vault with its own configuration.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildConfig, setConfig, type Config } from "../server/config.ts";

export interface TestVault {
  root: string;
  config: Config;
  write: (relativePath: string, content: string) => string;
  cleanup: () => void;
}

/** Creates an empty vault in /tmp and makes its configuration the current one. */
export function createTestVault(overrides: Record<string, unknown> = {}): TestVault {
  const root = mkdtempSync(join(tmpdir(), "cockpit-test-"));
  const vault = join(root, "vault");
  mkdirSync(vault);
  const raw = { ...overrides, vault: { path: vault, name: "test-vault", ...(overrides.vault as object) } };
  const { config } = buildConfig(raw);
  setConfig(config);
  return {
    root,
    config,
    write(relativePath, content) {
      const path = join(vault, relativePath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      return path;
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";

export function codexHome(home = homedir()): string {
  return join(home, ".codex");
}

/** Newest `thread_history_*.sqlite` under ~/.codex. Never auth.json / Cookies. */
export function threadHistoryPath(home = homedir()): string | null {
  const dir = codexHome(home);
  if (!existsSync(dir)) return null;
  const matches = readdirSync(dir)
    .filter((name) => /^thread_history_\d+\.sqlite$/.test(name))
    .sort()
    .reverse();
  const newest = matches[0];
  return newest ? join(dir, newest) : null;
}

export function threadCatalogPath(home = homedir()): string | null {
  const path = join(codexHome(home), "sqlite", "codex-dev.db");
  return existsSync(path) ? path : null;
}

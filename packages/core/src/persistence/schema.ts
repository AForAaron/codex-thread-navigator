import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REL_TO_REPO = join("packages", "core", "sql", "schema.sql");

function candidates(cwd: string): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  // dist/packages/core/src/persistence -> up 5 = repo root
  const fromModule = join(moduleDir, "..", "..", "..", "..", "..", REL_TO_REPO);
  // src/packages/core/src/persistence (ts-node style) -> up 3 = repo root
  const fromSource = join(moduleDir, "..", "..", "..", REL_TO_REPO);
  // dist copy, if the build ever ships sql/ next to core
  const fromDist = join(moduleDir, "..", "..", "sql", "schema.sql");
  return [fromModule, fromSource, fromDist, join(cwd, REL_TO_REPO)];
}

export function schemaSqlPath(cwd = process.cwd()): string {
  const found = candidates(cwd).find((c) => existsSync(c));
  if (found) return found;
  throw new Error(`schema.sql not found. Tried: ${candidates(cwd).join(" | ")}`);
}

export function readSchemaSql(cwd = process.cwd()): string {
  return readFileSync(schemaSqlPath(cwd), "utf8");
}

const FORBIDDEN = [/\bmessage_text\b/i, /\btranscript\b/i, /\bprompt_text\b/i, /\bcontent_text\b/i, /\bchat_body\b/i];

export function assertIndexOnlySchema(sql: string): string[] {
  const violations: string[] = [];
  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--")) continue;
    for (const pattern of FORBIDDEN) {
      if (pattern.test(trimmed)) violations.push(trimmed);
    }
  }
  return violations;
}

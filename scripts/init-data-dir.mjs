#!/usr/bin/env node
/**
 * Create ~/Library/Application Support/CodexNavigator/navigator.sqlite
 * with the index-only schema. Does not read Codex conversation DBs.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(root, "packages/core/sql/schema.sql"), "utf8");
const dir = join(homedir(), "Library", "Application Support", "CodexNavigator");
const dbPath = join(dir, "navigator.sqlite");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(schema);
db.close();
console.log(`initialized ${dbPath}`);

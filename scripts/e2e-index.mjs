#!/usr/bin/env node
/**
 * Drive the local-index page. Does not open ChatGPT / Codex / Explodex.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.CODEX_NAV_INDEX_URL ?? "http://127.0.0.1:8879/tools/desktop-index.html";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const results = [];

function record(id, ok, evidence) {
  results.push({ id, ok, evidence });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${evidence}`);
}

async function ensureServer() {
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || target.protocol !== "http:") {
    throw new Error("e2e requires an isolated loopback server");
  }
  let occupied = false;
  try {
    await fetch(target.origin + "/api/health", { signal: AbortSignal.timeout(1000) });
    occupied = true;
  } catch { /* no reachable server */ }
  if (occupied) throw new Error("e2e refuses to reuse a server whose database is unknown");
  const child = spawn(process.execPath, [resolve(root, "scripts/preview-server.mjs")], {
    cwd: root,
    env: { ...process.env, CODEX_NAV_PREVIEW_PORT: target.port },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolveStart, reject) => {
      const timer = setTimeout(() => reject(new Error("isolated server did not start")), 8000);
      child.stdout.on("data", (buf) => {
        if (String(buf).includes(target.origin)) { clearTimeout(timer); resolveStart(); }
      });
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`server exited: ${code}`)); });
    });
  } catch (err) { child.kill("SIGTERM"); throw err; }
  return child;
}

// Isolated DB: e2e must never write the user's real navigator.sqlite.
const REAL_DB = join(homedir(), "Library", "Application Support", "CodexNavigator", "navigator.sqlite");
const ISO_DB = join(tmpdir(), `cn-e2e-index-${process.pid}.sqlite`);
if (!existsSync(REAL_DB)) {
  console.error("Real navigator.sqlite missing - run `npm run land` once before e2e:index.");
  process.exit(1);
}
const REAL_MTIME_BEFORE = statSync(REAL_DB).mtimeMs;
cpSync(REAL_DB, ISO_DB);
process.env.CODEX_NAV_DB_PATH = ISO_DB;

let child = null;
let browser = null;
try {
  child = await ensureServer();
  browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ["--disable-gpu", "--no-first-run"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window.__CN_INDEX__?.promptCount ?? 0) > 0, null, { timeout: 15000 });
  const boot = await page.evaluate(() => window.__CN_INDEX__);
  record(
    "1-real-ids",
    Boolean(boot?.threadId) && !String(boot.threadId).startsWith("thread_preview") && boot.fixture === false,
    `thread=${String(boot?.threadId ?? "").slice(0, 13)}… prompts=${boot?.promptCount}`,
  );

  const settingsHidden = await page.locator('[data-cn-list="settings"]').isHidden();
  const debugHidden = await page.locator("#debug").isHidden();
  record("2-chrome", settingsHidden && debugHidden && boot?.settingsOpen === false, `settingsHidden=${settingsHidden} debugHidden=${debugHidden}`);

  const items = page.locator('[data-cn-list="prompts"] li');
  const count = await items.count();
  const target = count > 1 ? items.nth(1) : items.first();
  const turnId = await target.getAttribute("data-turn-id");
  await target.click();
  await page.waitForFunction((id) => window.__CN_INDEX__?.turnId === id, turnId);
  const after = await page.evaluate(() => window.__CN_INDEX__);
  const state = await fetch(`${new URL(url).origin}/api/threads/${encodeURIComponent(after.threadId)}/state`).then((r) => r.json());
  record(
    "3-select-writes-sqlite",
    state.reading?.turnId === turnId && state.reading?.threadId === after.threadId,
    `turn=${String(turnId).slice(0, 13)}… sqlite=${String(state.reading?.turnId ?? "").slice(0, 13)}…`,
  );

  await page.locator("#bookmarkTurn").click();
  const marked = await fetch(`${new URL(url).origin}/api/threads/${encodeURIComponent(after.threadId)}/state`).then((r) => r.json());
  record(
    "4-bookmark",
    marked.bookmarks?.some((row) => row.kind === "turn" && row.turnId === turnId),
    `kinds=${(marked.bookmarks ?? []).map((row) => row.kind).join(",")}`,
  );

  await page.locator('[data-cn="settings-gear"]').click();
  const settingsOpen = await page.locator('[data-cn-list="settings"]').isVisible();
  await page.locator('[data-cn="settings-gear"]').click();
  const settingsClosed = await page.locator('[data-cn-list="settings"]').isHidden();
  record("5-gear", settingsOpen && settingsClosed, `open=${settingsOpen} closed=${settingsClosed}`);
  record(
    "6-real-db-untouched",
    statSync(REAL_DB).mtimeMs === REAL_MTIME_BEFORE,
    `real navigator.sqlite mtime unchanged=${statSync(REAL_DB).mtimeMs === REAL_MTIME_BEFORE}`,
  );
} finally {
  try {
    await browser?.close();
  } finally {
    child?.kill("SIGTERM");
  }
  for (const suffix of ["", "-wal", "-shm"]) rmSync(ISO_DB + suffix, { force: true });
}

const failed = results.filter((row) => !row.ok);
if (failed.length) {
  console.error("index e2e failed");
  process.exit(1);
}
console.log("All index e2e checks passed");

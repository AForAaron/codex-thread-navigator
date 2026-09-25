#!/usr/bin/env node
/**
 * Drive the local-index page. Does not open ChatGPT / Codex / Explodex.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.CODEX_NAV_INDEX_URL ?? "http://127.0.0.1:8765/tools/desktop-index.html";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const results = [];

function record(id, ok, evidence) {
  results.push({ id, ok, evidence });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${evidence}`);
}

async function ensureServer() {
  try {
    const res = await fetch("http://127.0.0.1:8765/api/health");
    if (res.ok) return null;
  } catch {
    /* start */
  }
  const child = spawn(process.execPath, [resolve(root, "scripts/preview-server.mjs")], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolveStart, reject) => {
    const timer = setTimeout(() => reject(new Error("index server did not start")), 8000);
    const onData = (buf) => {
      if (String(buf).includes("127.0.0.1:8765")) {
        clearTimeout(timer);
        resolveStart();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
  });
  return child;
}

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
  const state = await fetch(`http://127.0.0.1:8765/api/threads/${encodeURIComponent(after.threadId)}/state`).then((r) => r.json());
  record(
    "3-select-writes-sqlite",
    state.reading?.turnId === turnId && state.reading?.threadId === after.threadId,
    `turn=${String(turnId).slice(0, 13)}… sqlite=${String(state.reading?.turnId ?? "").slice(0, 13)}…`,
  );

  await page.locator("#bookmarkTurn").click();
  const marked = await fetch(`http://127.0.0.1:8765/api/threads/${encodeURIComponent(after.threadId)}/state`).then((r) => r.json());
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
} finally {
  try {
    await browser?.close();
  } finally {
    child?.kill("SIGTERM");
  }
}

const failed = results.filter((row) => !row.ok);
if (failed.length) {
  console.error("index e2e failed");
  process.exit(1);
}
console.log("All index e2e checks passed");

#!/usr/bin/env node
/**
 * One-session, reversible Explodex injection for the installed Codex Navigator.
 * Keeps the CDP session open while reloading so pre-document scripts actually
 * run before Codex mounts. Reads no conversation data and touches no app files.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ReadOnlyAppServer } from "./appserver-history-client.mjs";
import { parseCodexRateLimits } from "../dist/packages/core/src/quota/codex-rate-limits.js";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.EXPLODEX_DEBUG_PORT ?? 9333);
const pluginDir = join(homedir(), ".explodex", "plugins", "codex-navigator");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid debug port");

const [manifestSource, pluginSource, sdkSource] = await Promise.all([
  readFile(join(pluginDir, "plugin.json"), "utf8"),
  readFile(join(pluginDir, "index.js"), "utf8"),
  readFile(join(root, "node_modules", "explodex", "sdk", "explodex-sdk.js"), "utf8"),
]);
const manifest = JSON.parse(manifestSource);
if (manifest.id !== "codex-navigator") throw new Error("Unexpected plugin ID");
const bootSource = `(() => {
  const observer = new MutationObserver(() => boot());
  function boot() {
    if (!document.head || !document.body) return;
    observer.disconnect();
    try {\n${sdkSource}\nwindow.__CODEX_USAGE_RAIL_SESSION__ = true;\nwindow.__CODEX_CHAT_NAV_SESSION__ = true;\n${pluginSource}\n}
    catch (error) { window.__EXPLODEX_BOOT_ERROR__ = String(error?.stack ?? error).slice(0, 800); }
  }
  observer.observe(document, { childList: true, subtree: true });
  boot();
})()`;
const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) }).then((res) => res.json());
const page = targets.find((target) => target.type === "page" && target.url === "app://-/index.html" && target.webSocketDebuggerUrl);
if (!page) throw new Error("Codex renderer target not found");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error("CDP connection failed"));
});
let nextId = 0;
let stopping = false;
let wakeWait = () => {};
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { stopping = true; wakeWait(); });
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(String(event.data));
  const waiter = pending.get(message.id);
  if (waiter) {
    pending.delete(message.id);
    waiter(message);
  }
};
function send(method, params = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, timeoutMs);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

try {
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: bootSource, world: "MAIN" });
  await send("Page.reload", { ignoreCache: false });
  let state = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((done) => setTimeout(done, 500));
    const result = await send("Runtime.evaluate", {
      expression: `(() => ({ sdk: !!window.Explodex, loaded: window.Explodex?.plugins?.list?.().includes("codex-navigator") ?? false, captured: typeof window.__explodexAppServerSend === "function", bootError: window.__EXPLODEX_BOOT_ERROR__ ?? null }))()`,
      returnByValue: true,
    });
    state = result?.result?.value ?? { evaluationError: result?.exceptionDetails?.text ?? "no value" };
    if (state?.loaded) break;
  }
  if (!state?.loaded) throw new Error(`Plugin did not load after renderer reload: ${JSON.stringify(state)}`);
  const client = new ReadOnlyAppServer();
  await client.connect();
  console.log("Codex usage rail and Chat directory loaded; read-only quota refresh is active. Keep this Terminal open; Ctrl+C stops both.");
  try {
    while (!stopping && ws.readyState === WebSocket.OPEN) {
      try {
        const limits = parseCodexRateLimits(await client.readRateLimits());
        if (!limits) throw new Error("Codex quota response unavailable");
        const asWindow = (window) => window ? {
          usedPercent: 100 - window.remainingPercent,
          windowDurationMins: window.windowDurationMins,
          resetsAt: window.resetsAt === null ? null : Math.round(window.resetsAt / 1000),
        } : null;
        const payload = {
          rateLimitsByLimitId: { codex: { limitId: "codex", primary: asWindow(limits.primary), secondary: asWindow(limits.secondary) } },
          rateLimitResetCredits: { availableCount: limits.resetCreditsAvailable },
        };
        const result = await send("Runtime.evaluate", {
          expression: `window.__codexNavigatorSetUsage?.(${JSON.stringify(payload)})`,
          returnByValue: true,
        });
        if (result?.exceptionDetails) throw new Error("Renderer rejected the quota update");
        const check = await send("Runtime.evaluate", {
          expression: `(() => { const el = document.querySelector(".cn-usage"); return { mounted: !!el, visible: !!el && getComputedStyle(el).visibility === "visible", text: el?.innerText ?? "" }; })()`,
          returnByValue: true,
        });
        console.log(JSON.stringify(check?.result?.value ?? { mounted: false }));
      } catch (error) {
        console.error(`Read-only quota refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 60_000);
        wakeWait = () => { clearTimeout(timer); resolve(); };
      });
    }
  } finally {
    await client.close();
    if (ws.readyState === WebSocket.OPEN) {
      try {
        await send("Runtime.evaluate", {
          expression: `window.Explodex?.plugins?.unload?.("codex-navigator")`,
          awaitPromise: true,
        }, 3000);
      } catch { /* App may already have exited. */ }
    }
  }
} finally {
  ws.close();
}

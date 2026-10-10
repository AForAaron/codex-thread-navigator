#!/usr/bin/env node
/**
 * One-session, reversible Explodex injection for the installed Codex Navigator.
 * Keeps the CDP session open while reloading so pre-document scripts actually
 * run before Codex mounts. Reads no conversation data and touches no app files.
 */
import { readFile } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRendererConnection } from "./renderer-connection.mjs";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.EXPLODEX_DEBUG_PORT ?? 9333);
const attach = process.argv.includes("--attach");
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
    if (window.Explodex?.plugins?.list?.().includes("codex-navigator")) return;
    try {\nif (!window.Explodex) {\n${sdkSource}\n}\nwindow.__CODEX_USAGE_RAIL_SESSION__ = true;\nwindow.__CODEX_CHAT_NAV_SESSION__ = true;\n${pluginSource}\n
      // Explodex's built-in shell adds its own rail entry, which widens the native 52 px rail and
      // pushes the quota/provider controls out of their slot. It cannot be unloaded, so hide it.
      if (!document.getElementById("cn-hide-explodex-shell")) {
        const hide = document.createElement("style");
        hide.id = "cn-hide-explodex-shell";
        hide.textContent = '[data-explodex-nav="explodex-shell"],[data-explodex-footer-plugins]{display:none!important}';
        document.head.append(hide);
      }\n}
    catch (error) { window.__EXPLODEX_BOOT_ERROR__ = String(error?.stack ?? error).slice(0, 800); }
  }
  observer.observe(document, { childList: true, subtree: true });
  boot();
})()`;
// The debug port opens before the main window's page exists; wait for it (up to ~30 s).
let page = null;
for (let attempt = 0; attempt < 60 && !page; attempt++) {
  if (attempt) await new Promise((done) => setTimeout(done, 500));
  try {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) }).then((res) => res.json());
    page = targets.find((target) => target.type === "page" && target.url === "app://-/index.html" && target.webSocketDebuggerUrl) ?? null;
  } catch { /* port may still be warming up */ }
}
if (!page) throw new Error("Codex renderer target not found after 30 s");

let stopping = false;
let wakeWait = () => {};
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { stopping = true; wakeWait(); });
const appPid = Number(execFileSync("/usr/sbin/lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).trim().split("\n")[0]);
const appRunning = () => {
  try { process.kill(appPid, 0); return true; } catch (error) { return error.code === "EPERM"; }
};
const renderer = createRendererConnection({ port,
  onReconnect: async (rawSend) => {
    await rawSend("Page.enable");
    await rawSend("Page.addScriptToEvaluateOnNewDocument", { source: bootSource, world: "MAIN" });
    const state = await rawSend("Runtime.evaluate", {
      expression: "({sdk:!!window.Explodex, controller:typeof window.__codexNavigatorGetUsageStatus==='function'})", returnByValue: true,
    });
    if (!state?.result?.value?.controller) {
      const expression = state?.result?.value?.sdk
        ? `window.Explodex.plugins.unload("codex-navigator"); window.__CODEX_USAGE_RAIL_SESSION__=true; window.__CODEX_CHAT_NAV_SESSION__=true;\n${pluginSource}`
        : bootSource;
      const loaded = await rawSend("Runtime.evaluate", { expression, awaitPromise: true });
      if (loaded?.exceptionDetails) throw new Error("Renderer plugin recovery failed");
    }
    console.log("Renderer connection recovered; native quota subscription is active.");
  },
});
const send = (method, params = {}, timeoutMs = 10000) => renderer.send(method, params, timeoutMs);
const appTimer = setInterval(() => {
  if (!appRunning()) { stopping = true; wakeWait(); }
}, 2000);

try {
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: bootSource, world: "MAIN" });
  if (attach) {
    const existing = await send("Runtime.evaluate", { expression: "!!window.Explodex", returnByValue: true });
    if (!existing?.result?.value) throw new Error("Attach requires an existing Explodex session");
    await send("Runtime.evaluate", { expression: `window.Explodex.plugins.unload("codex-navigator")`, awaitPromise: true });
    const loaded = await send("Runtime.evaluate", { expression: pluginSource, awaitPromise: true });
    if (loaded?.exceptionDetails) throw new Error("Updated plugin could not be attached");
  } else {
    // Reloading while Codex is still bootstrapping aborts its startup ("ChatGPT failed to start",
    // ERR_FAILED -2; seen on 26.930). Wait until the app shell has actually rendered first.
    for (let attempt = 0; attempt < 60; attempt++) {
      const ready = await send("Runtime.evaluate", {
        expression: `document.readyState === "complete" && !!document.querySelector("nav[data-app-navigation-rail]")`,
        returnByValue: true,
      }).catch(() => null);
      if (ready?.result?.value === true) break;
      await new Promise((done) => setTimeout(done, 500));
    }
    await new Promise((done) => setTimeout(done, 1500));
    // A slow reload is not a failure by itself; the load check below decides.
    await send("Page.reload", { ignoreCache: false }, 30000).catch((error) => {
      console.error(`Page.reload did not confirm in time (${error.message}); checking plugin state anyway.`);
    });
  }
  let state = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    await new Promise((done) => setTimeout(done, 500));
    const result = await send("Runtime.evaluate", {
      expression: `(() => ({ sdk: !!window.Explodex, loaded: window.Explodex?.plugins?.list?.().includes("codex-navigator") ?? false, captured: typeof window.__explodexAppServerSend === "function", bootError: window.__EXPLODEX_BOOT_ERROR__ ?? null }))()`,
      returnByValue: true,
    });
    state = result?.result?.value ?? { evaluationError: result?.exceptionDetails?.text ?? "no value" };
    if (state?.loaded) break;
  }
  if (!state?.loaded) throw new Error(`Plugin did not load after renderer reload: ${JSON.stringify(state)}`);
  const providerRail = spawn(process.execPath, [join(root, "scripts", "provider-rail-session.mjs")], {
    env: { ...process.env, EXPLODEX_DEBUG_PORT: String(port) }, stdio: ["ignore", "inherit", "inherit"],
  });
  console.log("Codex usage rail now follows the native quota cache; no independent quota polling. Keep this session running; Ctrl+C unloads the plugin.");
  try {
    // The renderer subscribes locally. CDP only installs/removes UI, not quota data.
    await new Promise(resolve => {
      wakeWait = resolve;
      if (stopping || !appRunning()) resolve();
    });
  } finally {
    providerRail.kill("SIGTERM");
    if (appRunning()) {
      try {
        await send("Runtime.evaluate", {
          expression: `window.Explodex?.plugins?.unload?.("codex-navigator")`,
          awaitPromise: true,
        }, 3000);
      } catch { /* App may already have exited. */ }
    }
  }
} finally {
  clearInterval(appTimer);
  renderer.close();
}

import { pathToFileURL } from "node:url";
import { createRendererConnection } from "./renderer-connection.mjs";

export function isSessionHealthy(snapshot, now = Date.now()) {
  if (snapshot?.source === "native-cache") {
    return snapshot.pluginLoaded === true && snapshot.quotaCount === 1
      && snapshot.nativeAttached === true && snapshot.quotaState === "ready";
  }
  return snapshot?.pluginLoaded === true && snapshot?.quotaSetter === true
    && snapshot?.quotaCount === 1 && Number.isFinite(snapshot.updatedAt)
    && now >= snapshot.updatedAt && now - snapshot.updatedAt < 150_000;
}

async function main() {
  const port = Number(process.argv[2]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { process.exitCode = 1; return; }
  const connection = createRendererConnection({ port });
  try {
    const result = await connection.send("Runtime.evaluate", {
      expression: `(() => { const state = window.__codexNavigatorGetUsageStatus?.(); return ({
        pluginLoaded: window.Explodex?.plugins?.list?.().includes("codex-navigator") === true,
        source: state?.source, nativeAttached: state?.attached, quotaState: state?.state,
        quotaCount: document.querySelectorAll(".cn-usage").length,
        updatedAt: Number(document.querySelector(".cn-usage")?.dataset.updatedAt)
      })})()`, returnByValue: true,
    }, 3000);
    if (!isSessionHealthy(result?.result?.value)) process.exitCode = 1;
  } catch { process.exitCode = 1; }
  finally { connection.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

#!/usr/bin/env node
/** Read-only machine checks. Does not launch, inspect UI, inject, or repair the app. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const appPath = "/Applications/ChatGPT.app";
function run(file, args) {
  try {
    return { ok: true, output: execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    return { ok: false, output: String(error.stderr || error.stdout || error.message).trim() };
  }
}
const present = existsSync(appPath);
const plist = `${appPath}/Contents/Info.plist`;
const metadata = {};
for (const key of ["CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion"]) {
  metadata[key] = present ? run("/usr/bin/plutil", ["-extract", key, "raw", plist]) : { ok: false, output: "app missing" };
}
const integrity = present ? run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=4", appPath]) : { ok: false, output: "app missing" };
const executableIntegrity = present ? run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=4", `${appPath}/Contents/MacOS/ChatGPT`]) : { ok: false, output: "app missing" };
const report = {
  checkedAt: new Date().toISOString(),
  kind: "g0-read-only-preflight",
  appPath, present, metadata, integrity, executableIntegrity,
  packagedExplodexTargetPresent: existsSync("/Applications/Codex.app/Contents/MacOS/Codex"),
  gate: "NOT_VERIFIED",
  requiredLiveEvidence: [
    "native rail baseline in both themes and all interaction states",
    "Chat and Codex identity, complete history and target loading",
    "Chat and Codex reveal target and disposal recovery",
  ],
  note: "Passing machine checks is necessary but does not pass G0. This script does not inspect the app UI or validate either adapter.",
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = integrity.ok && executableIntegrity.ok && Object.values(metadata).every(row => row.ok) ? 0 : 2;

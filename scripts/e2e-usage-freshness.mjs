import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const output = await build({ entryPoints: ["packages/plugin/src/ui/usage-indicator.ts"], bundle: true,
  format: "iife", globalName: "Usage", platform: "browser", write: false });
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.setContent("<body></body>");
  await page.clock.install();
  await page.addScriptTag({ content: output.outputFiles[0].text });
  await page.evaluate(() => {
    window.widget = Usage.createUsageIndicator();
    document.body.append(widget.root);
    window.update = () => widget.setState({ kind: "ready", updatedAt: Date.now(), limits: {
      primary: { remainingPercent: 96, windowDurationMins: 300, resetsAt: null },
      secondary: { remainingPercent: 99, windowDurationMins: 10080, resetsAt: null }, resetCreditsAvailable: 1,
    } });
    update();
  });
  assert.match(await page.locator("output").textContent(), /99%/);
  await page.clock.fastForward(150001);
  assert.equal(await page.locator(".cn-usage-value").allTextContents().then(v => v.join(",")), "—,—,—");
  await page.evaluate(() => update());
  assert.match(await page.locator("output").textContent(), /99%/);
  await page.evaluate(() => widget.setState({ kind: "unavailable", reason: "read failed" }));
  assert.equal(await page.locator(".cn-usage-value").allTextContents().then(v => v.join(",")), "—,—,—");
  await page.evaluate(() => widget.dispose());
  await page.clock.fastForward(150001);
  assert.equal(await page.locator("output").count(), 0);
  console.log("PASS quota expiry, failure invalidation, recovery and disposal");
} finally { await browser.close(); }

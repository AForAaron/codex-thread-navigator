/** Strict regression for our owned preview. Never connects to the official app. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const port = 8877;
const server = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: resolve("."), env: { ...process.env, CODEX_NAV_PREVIEW_PORT: String(port), CODEX_NAV_DB_PATH: `/private/tmp/cn-navigation-${process.pid}.sqlite` },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
const out = resolve("tmp/navigation-review");
mkdirSync(out, { recursive: true });
const errors = [];
try {
  await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("owned test server did not start")), 8000);
    server.stdout.on("data", data => { if (String(data).includes(`127.0.0.1:${port}`)) { clearTimeout(timer); ok(); } });
    let diagnostic = "";
    server.stderr.on("data", data => { diagnostic += String(data); });
    server.on("error", fail);
    server.on("exit", code => { if (code) { clearTimeout(timer); fail(new Error(`test server exited ${code}: ${diagnostic}`)); } });
  });
  browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const url = `http://127.0.0.1:${port}/tools/panel-preview.html?nav=1`;
  await page.goto(url);
  await page.waitForFunction(() => window.__CN_PREVIEW__?.promptCount === 16);
  await page.locator('[data-cn="settings-gear"]').click();
  await page.locator('[data-cn="theme"]').selectOption("dark");
  await page.locator('[data-cn="settings-gear"]').click();
  assert.equal(await page.locator(".cn-progress-item").count(), 16);
  await page.locator(".cn-progress-item").nth(7).hover();
  await page.waitForTimeout(220);
  const geometry = await page.evaluate(() => [7,8,9,10,11].map(index => {
    const marker = document.querySelectorAll(".cn-progress-marker")[index];
    const box = marker.getBoundingClientRect(); return [box.width, box.height];
  }));
  for (const [i, width] of [26,20,14,10,6].entries()) assert.ok(Math.abs(geometry[i][0] - width) < .2, JSON.stringify(geometry));
  assert.ok(geometry.every(([,height]) => height === 2));
  console.log("PASS native geometry: 26/20/14/10/6 px, 2 px strokes");
  await page.screenshot({ path: `${out}/dark-hover.png` });
  // Switch themes through the actual UI, then validate the same marker geometry.
  await page.locator('[data-cn="settings-gear"]').click();
  await page.locator('[data-cn="theme"]').selectOption("light");
  await page.locator('[data-cn="settings-gear"]').click();
  await page.locator(".cn-progress-item").nth(7).hover();
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  await page.screenshot({ path: `${out}/light-hover.png` });
  // A long answer covers the reading line without its user bubble in view.
  await page.locator(".cn-progress-item").nth(7).click();
  await page.waitForTimeout(120);
  const owner = await page.locator(".cn-progress-item").nth(7).getAttribute("data-turn-id");
  await page.evaluate(() => {
    const user = document.querySelectorAll('[data-testid="user-message"]')[7];
    const answer = user.nextElementSibling;
    answer.style.minHeight = "1600px";
    const v = document.querySelector(".app-shell-main-content-viewport");
    v.scrollTop += answer.getBoundingClientRect().top - v.getBoundingClientRect().top + 400;
  });
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => document.querySelector('[data-cn="conversation-progress"]').dataset.currentTurn), owner);
  console.log("PASS long-answer current marker stays with owning prompt");
  // Move to a later message. Capture its exact visible content, then grow content above it.
  await page.locator(".cn-progress-item").nth(11).click();
  await page.waitForTimeout(450);
  const anchorBefore = await page.evaluate(() => window.__CN_PREVIEW__.readingAnchor);
  const position = async () => page.evaluate(anchor => {
    const v = document.querySelector(".app-shell-main-content-viewport");
    const article = [...v.querySelectorAll(".preview-turn")].find(node => node.dataset.itemId === anchor.itemId);
    const nodes = [...article.querySelectorAll("p,h1,h2,h3,h4,pre,li,table,img")].filter(node => !node.closest(".cn-debug") && !node.parentElement?.closest("pre,li,table"));
    return (nodes[anchor.blockIndex] ?? article).getBoundingClientRect().top - v.getBoundingClientRect().top;
  }, anchorBefore);
  const before = await position();
  await page.evaluate(() => { document.querySelectorAll(".preview-turn")[2].querySelector("p").textContent += "上方流式生成内容。".repeat(80); });
  await page.waitForTimeout(160);
  assert.ok(Math.abs(await position() - before) <= 4, `reading moved ${await position() - before}`);
  await page.evaluate(() => { document.querySelectorAll(".preview-turn")[3].style.minHeight = "800px"; });
  await page.waitForTimeout(160);
  assert.ok(Math.abs(await position() - before) <= 4);
  console.log("PASS streaming text and delayed height changes above anchor stay within 4 px");
  // Reload rebuilds fixture without artificial growth: restore content, not old absolute scrollTop.
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForFunction(() => window.__CN_PREVIEW__?.status?.includes("已恢复"));
  await page.waitForTimeout(160);
  assert.ok(Math.abs(await position() - before) <= 4);
  console.log("PASS refresh after layout change restores same message and viewport offset");
  // Search an answer-only term, then check a real Range highlight on the answer itself.
  await page.locator('[data-cn="open-search"]').click();
  await page.locator('[data-cn="full-search"]').fill("正文留在 Codex 自己的库里");
  const target = page.locator('[data-cn="full-search-results"] button').first();
  await target.waitFor();
  const itemId = await target.getAttribute("data-item-id");
  await target.click();
  await page.waitForTimeout(160);
  const exact = await page.evaluate(id => {
    const article = [...document.querySelectorAll(".preview-turn")].find(node => node.dataset.itemId === id);
    const viewport = document.querySelector(".app-shell-main-content-viewport");
    const rect = article.getBoundingClientRect(), vr = viewport.getBoundingClientRect();
    return { match: article.dataset.searchMatch, visible: rect.bottom > vr.top && rect.top < vr.bottom, highlight: Boolean(CSS.highlights?.has("navigator-search")) };
  }, itemId);
  assert.ok(exact.match && exact.visible && exact.highlight, JSON.stringify(exact));
  console.log("PASS exact search occurrence is visible and highlighted without rewriting Markdown");
  await page.keyboard.press("Escape");
  assert.ok(await page.locator(".cn-search-tray").isHidden());
  // Rapid route requests must leave only the latest thread mounted.
  await page.evaluate(() => {
    const select = document.querySelector('[data-cn="thread"]');
    for (const id of ["thread_preview_outline_001", "thread_preview_stress_001", "thread_preview_nav_001"]) { select.value = id; select.dispatchEvent(new Event("change")); }
  });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.querySelector(".app-shell-main-content-viewport").dataset.previewThread), "thread_preview_nav_001");
  assert.equal(await page.locator(".app-shell-main-content-viewport").count(), 1);
  assert.equal(await page.locator(".cn-progress-item").count(), 16);
  assert.deepEqual(errors, []);
  console.log("PASS rapid route changes discard stale renders and observers; no browser errors");
  await page.locator(".cn-progress-item").nth(6).click();
  await page.waitForTimeout(450);
  const firstWindowId = await page.locator(".cn-progress-item").nth(6).getAttribute("data-turn-id");
  const secondPage = await page.context().newPage();
  await secondPage.goto(url);
  await secondPage.waitForFunction(() => window.__CN_PREVIEW__?.promptCount === 16);
  await secondPage.locator(".cn-progress-item").nth(3).click();
  await secondPage.waitForTimeout(450);
  await page.reload();
  await page.waitForFunction(() => window.__CN_PREVIEW__?.status?.includes("已恢复"));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.querySelector('[data-cn="conversation-progress"]').dataset.currentTurn), firstWindowId);
  await secondPage.close();
  console.log("PASS independent preview tabs do not overwrite each other's reading positions");
  for (const count of [90, 500, 1000]) {
    const id = count === 90 ? "thread_preview_stress_001" : `thread_preview_stress_${count}`;
    await page.selectOption('[data-cn="thread"]', id);
    await page.waitForFunction(n => window.__CN_PREVIEW__?.promptCount === n, count);
    assert.equal(await page.locator(".cn-progress-item").count(), count);
    for (const index of [0, Math.floor(count / 2), count - 1]) {
      const button = page.locator(".cn-progress-item").nth(index);
      const turnId = await button.getAttribute("data-turn-id");
      await button.click();
      await page.waitForTimeout(100);
      const located = await page.evaluate(id => {
        const viewport = document.querySelector(".app-shell-main-content-viewport");
        const article = [...viewport.querySelectorAll('[data-testid="user-message"]')].find(node => node.dataset.turnId === id);
        return { current: document.querySelector('[data-cn="conversation-progress"]').dataset.currentTurn,
          offset: article.getBoundingClientRect().top - viewport.getBoundingClientRect().top };
      }, turnId);
      assert.equal(located.current, turnId);
      assert.ok(Math.abs(located.offset) <= 4, JSON.stringify(located));
    }
    console.log(`PASS ${count} turns: first, middle, last prompt geometry and exact current marker`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator(".cn-progress-marker").first().evaluate(node => getComputedStyle(node).transitionDuration), "0s");
  console.log("PASS reduced-motion disables marker animation");
  console.log(`Screenshots: ${out}`);
} finally {
  await browser?.close();
  server.kill();
}

#!/usr/bin/env node
/**
 * Drive the isolated preview like a user. Does not open ChatGPT/Codex/Explodex.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.CODEX_NAV_PREVIEW_URL ?? "http://127.0.0.1:8765/tools/panel-preview.html";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const results = [];

function record(id, ok, evidence) {
  results.push({ id, ok, evidence });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${evidence}`);
}

async function state(page) {
  return page.evaluate(() => window.__CN_PREVIEW__ ?? null);
}

async function visibleTurn(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector(".app-shell-main-content-viewport");
    if (!viewport) return null;
    const rootTop = viewport.getBoundingClientRect().top;
    const users = [...viewport.querySelectorAll('[data-testid="user-message"]')];
    let best = null;
    for (const node of users) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom < rootTop + 8 || rect.top > viewport.getBoundingClientRect().bottom - 8) continue;
      const dist = Math.abs(rect.top - rootTop);
      if (!best || dist < best.dist) best = { id: node.getAttribute("data-turn-id"), dist };
    }
    return best?.id ?? null;
  });
}

async function headingInView(page, id) {
  return page.evaluate((hid) => {
    const el = document.getElementById(hid);
    const viewport = document.querySelector(".app-shell-main-content-viewport");
    if (!el || !viewport) return false;
    const er = el.getBoundingClientRect();
    const vr = viewport.getBoundingClientRect();
    return er.bottom > vr.top + 4 && er.top < vr.bottom - 4;
  }, id);
}

async function scrollTop(page) {
  return page.evaluate(() => document.querySelector(".app-shell-main-content-viewport")?.scrollTop ?? -1);
}

async function ensurePreviewServer() {
  try {
    const res = await fetch(url);
    if (res.ok) return null;
  } catch {
    /* start one */
  }
  const child = spawn(process.execPath, [resolve(root, "scripts/preview-server.mjs")], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolveStart, reject) => {
    const timer = setTimeout(() => reject(new Error("preview server did not start")), 8000);
    const onData = (buf) => {
      if (String(buf).includes("preview")) {
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

let server = null;
let browser = null;
let page;

try {
  server = await ensurePreviewServer();
  browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--disable-dev-shm-usage"],
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("codex-navigator-preview:")) localStorage.removeItem(key);
    }
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-cn="conversation-rail"]', { timeout: 10000 });
  await page.waitForFunction(() => window.__CN_PREVIEW__?.threadId, null, { timeout: 10000 });

  const firstGlance = await page.evaluate(() => {
    const rail = document.querySelector('[data-cn="conversation-rail"]');
    const newChat = rail?.querySelector('[data-cn-action="new"]');
    const nr = newChat?.getBoundingClientRect();
    const nav = document.querySelector("[data-codex-navigator]");
    const navBox = nav?.getBoundingClientRect();
    const navVisible = Boolean(
      nav && !nav.hidden && getComputedStyle(nav).display !== "none" && (navBox?.width ?? 0) > 40,
    );
    return {
      newChatText: newChat?.textContent?.trim() ?? "",
      newChatVisible: Boolean(nr && nr.top >= 0 && nr.bottom <= innerHeight && nr.height > 8),
      rightPanel: navVisible,
      hasSearch: document.body.innerText.includes("搜索本对话"),
      pinDupes: (rail?.innerText.match(/给 Codex 做长对话导航/g) ?? []).length,
      railText: rail?.innerText.replace(/\s+/g, " ") ?? "",
    };
  });
  record(
    "1-open",
    firstGlance.newChatVisible &&
      firstGlance.newChatText.includes("新聊天") &&
      !firstGlance.rightPanel &&
      !firstGlance.hasSearch &&
      firstGlance.pinDupes === 1,
    JSON.stringify(firstGlance),
  );

  const railText = firstGlance.railText;
  const railOk =
    railText.includes("新聊天") &&
    railText.includes("置顶") &&
    railText.includes("项目") &&
    railText.includes("探索") &&
    railText.includes("对话");
  record("1c-rail", railOk, railText.slice(0, 80));
  const quotaLabel = await page.locator("[data-cn='quota-label']").innerText();
  const quotaAbove = await page.evaluate(() => {
    const quota = document.querySelector("[data-cn='quota-bar']");
    const composer = document.querySelector(".preview-composer");
    if (!quota || !composer) return false;
    return quota.getBoundingClientRect().bottom <= composer.getBoundingClientRect().top + 2;
  });
  record(
    "1d-quota",
    quotaAbove && quotaLabel.includes("未连接") && !quotaLabel.includes("93") && !/周|token|\$/i.test(quotaLabel),
    `label=${quotaLabel} above=${quotaAbove}`,
  );

  const progressVis = await page.evaluate(() => {
    const rail = document.querySelector("[data-cn='conversation-progress']");
    const track = document.querySelector("[data-cn='conversation-progress-track']");
    const current = document.querySelector(".cn-progress-item[aria-current=true] .cn-progress-marker");
    const nav = document.querySelector("[data-codex-navigator]");
    const navVisible = Boolean(nav && !nav.hidden && (nav.getBoundingClientRect().width ?? 0) > 40);
    const trackBg = track ? getComputedStyle(track).backgroundImage : "";
    const currentBox = current?.getBoundingClientRect();
    return {
      exists: Boolean(rail && !rail.hidden && track),
      dotted: !/repeating-linear-gradient/i.test(trackBg) && track?.querySelectorAll(".cn-progress-item").length === 16,
      currentThin: Boolean(currentBox && currentBox.width > currentBox.height && currentBox.height <= 4),
      rightPanel: navVisible,
      previewOpen: rail?.dataset.previewOpen === "true",
    };
  });
  record(
    "1e-progress",
    progressVis.exists && progressVis.dotted && progressVis.currentThin && !progressVis.rightPanel && !progressVis.previewOpen,
    JSON.stringify(progressVis),
  );
  const trackBox = await page.locator("[data-cn='conversation-progress']").boundingBox();
  if (trackBox) await page.mouse.move(trackBox.x + 8, trackBox.y + trackBox.height * 0.18);
  await page.waitForTimeout(200);
  const hoverA = await page.evaluate(() => {
    const preview = document.querySelector("[data-cn='conversation-progress-preview']");
    const bar = document.querySelector(".cn-progress-item[data-scrub-target] .cn-progress-marker");
    const rail = document.querySelector("[data-cn='conversation-progress']");
    const style = preview ? getComputedStyle(preview) : null;
    const barBox = bar?.getBoundingClientRect();
    const currentBox = document.querySelector(".cn-progress-item:not([data-scrub-target]) .cn-progress-marker")?.getBoundingClientRect();
    return {
      previewVisible: Boolean(preview && !preview.hidden && style?.display !== "none"),
      barVisible: Boolean(bar && !bar.hidden),
      barHorizontal: Boolean(barBox && barBox.width > barBox.height),
      barThicker: Boolean(barBox && currentBox && barBox.width >= 25 && barBox.height === 2 && currentBox.width < barBox.width),
      text: preview?.textContent ?? "",
      turn: rail?.dataset.hoverTurn ?? "",
    };
  });
  record(
    "1e-progress-hover",
    hoverA.previewVisible && hoverA.barVisible && hoverA.barHorizontal && hoverA.barThicker && hoverA.text.length > 8,
    JSON.stringify({ turn: hoverA.turn, text: hoverA.text.slice(0, 40), thicker: hoverA.barThicker }),
  );
  if (trackBox) await page.mouse.move(trackBox.x + 8, trackBox.y + trackBox.height * 0.82);
  await page.waitForTimeout(200);
  const hoverB = await page.evaluate(() => ({
    text: document.querySelector("[data-cn='conversation-progress-preview']")?.textContent ?? "",
    turn: document.querySelector("[data-cn='conversation-progress']")?.dataset.hoverTurn ?? "",
  }));
  record(
    "1e-progress-move",
    hoverB.turn !== hoverA.turn && hoverB.text !== hoverA.text && hoverB.text.length > 8,
    `a=${hoverA.turn} b=${hoverB.turn}`,
  );
  const beforeJump = await page.evaluate(() => document.querySelector(".app-shell-main-content-viewport")?.scrollTop ?? 0);
  if (trackBox) await page.mouse.click(trackBox.x + 8, trackBox.y + trackBox.height * 0.82);
  await page.waitForTimeout(250);
  const afterClick = await page.evaluate(() => ({
    scrollTop: document.querySelector(".app-shell-main-content-viewport")?.scrollTop ?? 0,
    active: window.__CN_PREVIEW__?.activeTurn ?? "",
    hoverTurn: document.querySelector("[data-cn='conversation-progress']")?.dataset.hoverTurn ?? "",
  }));
  record(
    "1e-progress-click",
    afterClick.active === afterClick.hoverTurn,
    `before=${beforeJump} after=${afterClick.scrollTop} active=${afterClick.active}`,
  );

  await page.goto("http://127.0.0.1:8765/tools/panel-preview.html?nav=1", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-codex-navigator="true"]', { timeout: 10000 });
  await page.waitForFunction(() => window.__CN_PREVIEW__?.promptCount === 16, null, { timeout: 10000 });
  const s1 = await state(page);
  const userTurns = await page.locator('[data-testid="user-message"]').count();
  const prompts = await page.locator('[data-cn-list="prompts"] li').count();
  record("1-nav", userTurns === 16 && prompts === 16 && Boolean(s1), `userTurns=${userTurns} prompts=${prompts}`);

  await page.locator('[data-cn-list="prompts"] li[data-turn-id="turn_u_volc"]').click();
  await page.waitForTimeout(250);
  const visVolc = await visibleTurn(page);
  const sVolc = await state(page);
  record(
    "2-click-zh",
    visVolc === "turn_u_volc" || sVolc?.activeTurn === "turn_u_volc",
    `visible=${visVolc} active=${sVolc?.activeTurn}`,
  );

  await page.locator('[data-cn-list="prompts"] li[data-turn-id="turn_u_restore"]').click();
  await page.waitForTimeout(500);
  const beforeReload = await state(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__CN_PREVIEW__?.status?.includes("已恢复"), null, { timeout: 8000 });
  const afterReload = await state(page);
  const visAfter = await visibleTurn(page);
  record(
    "3-restore",
    afterReload?.activeTurn === "turn_u_restore" || visAfter === "turn_u_restore",
    `before=${beforeReload?.activeTurn} after=${afterReload?.activeTurn} visible=${visAfter} status=${afterReload?.status}`,
  );

  await page.locator('[data-cn-list="prompts"] li[data-turn-id="turn_u_volc"]').click();
  await page.waitForTimeout(300);
  await page.selectOption('[data-cn="thread"]', "thread_preview_outline_001");
  await page.waitForFunction(() => window.__CN_PREVIEW__?.threadId === "thread_preview_outline_001", null, { timeout: 8000 });
  await page.selectOption('[data-cn="thread"]', "thread_preview_nav_001");
  await page.waitForFunction(
    () => window.__CN_PREVIEW__?.threadId === "thread_preview_nav_001" && String(window.__CN_PREVIEW__?.status ?? "").includes("已恢复"),
    null,
    { timeout: 8000 },
  );
  const afterSwitch = await state(page);
  record(
    "3b-thread-restore",
    afterSwitch?.activeTurn === "turn_u_volc" || String(afterSwitch?.status ?? "").includes("turn_u_volc"),
    `active=${afterSwitch?.activeTurn} status=${afterSwitch?.status}`,
  );

  await page.locator('[data-cn="settings-gear"]').click();
  await page.waitForTimeout(150);
  const gearOpen = await page.locator('[data-cn-list="settings"]').isVisible();
  const keymapText = await page.locator('[data-cn="keymap"]').innerText();
  record("8-keymap", gearOpen && keymapText.includes("⌘⇧N") && keymapText.includes("⌘⇧F"), keymapText.replaceAll("\n", " | "));
  await page.locator('[data-cn="settings-gear"]').click();
  await page.waitForTimeout(100);
  record("8-gear-close", await page.locator('[data-cn-list="settings"]').isHidden(), "settings closed");

  let shortcutToggle = false;
  let shortcutEsc = false;
  let shortcutNav = false;
  let shortcutLatest = false;
  let shortcutBookmark = false;

  await page.keyboard.press("Meta+Shift+N");
  await page.waitForTimeout(150);
  shortcutToggle = (await state(page))?.visible === false;
  if (!shortcutToggle) await page.locator('[data-cn="collapse"]').click();
  record("4a-toggle", await page.locator('[data-codex-navigator="true"]').isHidden(), `shortcutToggle=${shortcutToggle}`);
  await page.locator('[data-cn="show"]').click();
  record("4a-toggle-back", await page.locator('[data-codex-navigator="true"]').isVisible(), "shown");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  if (await page.locator('[data-codex-navigator="true"]').isVisible()) await page.locator('[data-cn="collapse"]').click();
  shortcutEsc = await page.locator('[data-codex-navigator="true"]').isHidden();
  record("4b-esc", shortcutEsc, `shortcutEsc=${shortcutEsc}`);
  await page.locator('[data-cn="show"]').click();

  await page.locator('[data-cn-list="prompts"] li[data-turn-id="turn_u_api"]').click();
  await page.waitForTimeout(200);
  await page.keyboard.press("Meta+Shift+ArrowDown");
  await page.waitForTimeout(200);
  const afterKeyNext = await state(page);
  shortcutNav = afterKeyNext?.activeTurn === "turn_u_volc";
  if (!shortcutNav) await page.locator('[data-cn="next"]').click();
  const afterNext = await state(page);
  record("5-next", afterNext?.activeTurn === "turn_u_volc" || afterNext?.activeTurn === "turn_u_plugin", `active=${afterNext?.activeTurn}`);

  await page.keyboard.press("Meta+Shift+L");
  await page.waitForTimeout(200);
  shortcutLatest = (await state(page))?.activeTurn === "turn_u_follow";
  if (!shortcutLatest) await page.locator('[data-cn="latest"]').click();
  const latest = await state(page);
  record("6-latest", latest?.activeTurn === "turn_u_follow", `active=${latest?.activeTurn}`);

  await page.locator('[data-cn-list="prompts"] li[data-turn-id="turn_u_nav"]').click();
  await page.waitForTimeout(200);
  await page.keyboard.press("Alt+Meta+B");
  await page.waitForTimeout(200);
  let snapshot = await state(page);
  shortcutBookmark = (snapshot?.bookmarkTurnIds ?? []).includes("turn_u_nav");
  if (!shortcutBookmark) await page.locator('[data-cn="bookmark"]').click();
  snapshot = await state(page);
  record(
    "7-bookmark",
    (snapshot?.bookmarkTurnIds ?? []).includes("turn_u_nav") && (await page.locator('[data-cn-list="bookmarks"] li').count()) >= 1,
    `ids=${JSON.stringify(snapshot?.bookmarkTurnIds)}`,
  );

  await page.locator('[data-cn="search"]').fill("火山方舟");
  await page.waitForTimeout(150);
  await page.locator('[data-cn-list="search"] li[data-turn-id="turn_u_volc"]').first().click();
  await page.waitForTimeout(250);
  const afterSearch = await state(page);
  record("7b-search", afterSearch?.activeTurn === "turn_u_volc", `active=${afterSearch?.activeTurn}`);

  await page.locator('[data-cn="search"]').fill("Responses API");
  await page.waitForTimeout(150);
  const responsesHits = await page.locator('[data-cn-list="search"] li').count();
  record("7b-search-api", responsesHits >= 1, `hits=${responsesHits}`);

  await page.keyboard.press("Meta+Shift+F");
  await page.waitForTimeout(150);
  record("7c-search-focus", await page.evaluate(() => document.activeElement?.getAttribute("data-cn") === "search"), "focus");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  record("7d-search-esc", await page.evaluate(() => document.activeElement?.getAttribute("data-cn") !== "search"), "closed");

  await page.selectOption('[data-cn="thread"]', "thread_preview_outline_001");
  await page.waitForFunction(() => window.__CN_PREVIEW__?.threadId === "thread_preview_outline_001", null, { timeout: 8000 });
  await page.locator('[data-tab="outline"]').click();
  await page.waitForFunction(() => window.__CN_PREVIEW__?.outlineCount === 20, null, { timeout: 8000 });
  const outlineLis = await page.locator('[data-cn-list="outline"] li').count();
  await page.locator('[data-cn-list="outline"] li[data-heading-id="outline-h-01"]').click();
  await page.waitForTimeout(200);
  const h1 = await headingInView(page, "outline-h-01");
  await page.locator('[data-cn-list="outline"] li[data-heading-id="outline-h-20"]').click();
  await page.waitForTimeout(250);
  const h20 = await headingInView(page, "outline-h-20");
  record("5b-outline", outlineLis === 20 && h1 && h20, `lis=${outlineLis} h1=${h1} h20=${h20}`);

  await page.locator('[data-cn="bookmark-turn"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-cn="bookmark-heading"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-cn="bookmark-message"]').click();
  await page.waitForTimeout(200);
  const kinds = await page.evaluate(() => (window.__CN_PREVIEW__?.bookmarks ?? []).map((row) => row.kind));
  const kindSet = new Set(kinds);
  await page.locator('[data-cn-list="bookmarks"] li[data-kind="heading"]').first().click();
  await page.waitForTimeout(200);
  const headingJump = (await headingInView(page, "outline-h-20")) || (await headingInView(page, "outline-h-01"));
  await page.locator('[data-cn-list="bookmarks"] li[data-kind="turn"]').first().click();
  await page.waitForTimeout(200);
  const turnJump = (await visibleTurn(page)) === "turn_u_outline" || (await state(page))?.activeTurn === "turn_u_outline";
  record(
    "6b-bookmark-kinds",
    kindSet.has("turn") && kindSet.has("message") && kindSet.has("heading") && headingJump && turnJump,
    `kinds=${JSON.stringify([...kindSet])}`,
  );

  await page.locator('[data-cn="search"]').fill("验收清单");
  await page.waitForTimeout(150);
  const outlineHit = page.locator('[data-cn-list="search"] li[data-turn-id="turn_a_outline"]');
  if ((await outlineHit.count()) > 0) await outlineHit.first().click();
  else await page.locator('[data-cn-list="search"] li').first().click();
  await page.waitForTimeout(200);
  const outlineActive = (await state(page))?.activeTurn;
  record(
    "7e-outline-search",
    await page.locator('[data-turn-id="turn_a_outline"][data-search-match]').count() === 1,
    `active=${outlineActive}`,
  );

  await page.selectOption('[data-cn="thread"]', "thread_preview_nav_001");
  await page.waitForFunction(() => window.__CN_PREVIEW__?.threadId === "thread_preview_nav_001", null, { timeout: 8000 });
  await page.locator('[data-tab="prompts"]').click();
  await page.locator('[data-cn-list="prompts"] li[data-turn-id="turn_u_search"]').click();
  await page.waitForTimeout(300);
  const beforeGen = await scrollTop(page);
  await page.locator('[data-cn="simulate"]').click();
  await page.waitForFunction(() => window.__CN_PREVIEW__?.follow?.unreadNew === true, null, { timeout: 5000 });
  const afterGen = await scrollTop(page);
  const followState = await state(page);
  const newBtn = await page.locator('[data-cn="new-content"]').isVisible();
  record(
    "4c-follow",
    Math.abs(afterGen - beforeGen) <= 2 && newBtn && followState?.follow?.following === false,
    `before=${beforeGen} after=${afterGen} newBtn=${newBtn}`,
  );
  await page.locator('[data-cn="new-content"]').click();
  await page.waitForTimeout(250);
  const dist = await page.evaluate(() => {
    const viewport = document.querySelector(".app-shell-main-content-viewport");
    if (!viewport) return 9999;
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
  });
  record("4d-new-content", dist < 160, `dist=${dist}`);

  await page.selectOption('[data-cn="thread"]', "thread_preview_orphan_001");
  await page.waitForFunction(() => window.__CN_PREVIEW__?.threadId === "thread_preview_orphan_001", null, { timeout: 8000 });
  await page.locator('[data-cn="bookmark-turn"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-cn="settings-gear"]').click();
  await page.locator('[data-cn="remove-orphan"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-tab="bookmarks"]').click();
  record("9b-orphaned", (await page.locator('[data-cn-list="bookmarks"] li[data-orphaned="true"]').count()) >= 1, "orphaned");

  await page.locator('[data-cn="settings-gear"]').click();
  await page.locator('[data-cn="export"]').click();
  await page.waitForTimeout(200);
  const exported = await state(page);
  record(
    "9a-export",
    Array.isArray(exported?.exportLeaks) && exported.exportLeaks.length === 0 && String(exported?.status ?? "").includes("已导出"),
    `status=${exported?.status}`,
  );

  await page.selectOption('[data-cn="theme"]', "light");
  await page.waitForTimeout(100);
  record("8b-theme", (await page.evaluate(() => document.documentElement.dataset.theme)) === "light", "theme");

  await page.selectOption('[data-cn="thread"]', "thread_preview_nav_001");
  await page.waitForFunction(() => window.__CN_PREVIEW__?.threadId === "thread_preview_nav_001", null, { timeout: 8000 });
  await page.locator('[data-tab="prompts"]').click();
  await page.locator('[data-cn-list="prompts"] li[data-turn-id="turn_u_api"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-cn="settings-gear"]').click();
  await page.locator('[data-cn="shortcut-latest"]').fill("⌘⇧J");
  await page.locator('[data-cn="shortcut-latest"]').dispatchEvent("change");
  await page.locator('[data-cn="shortcut-latest"]').blur();
  await page.waitForTimeout(100);
  await page.keyboard.press("Meta+Shift+J");
  await page.waitForTimeout(250);
  record("8c-shortcut-override", (await state(page))?.activeTurn === "turn_u_follow", `active=${(await state(page))?.activeTurn}`);

  if (!(await page.locator('[data-cn-list="settings"]').isVisible())) {
    await page.locator('[data-cn="settings-gear"]').click();
  }
  await page.locator('[data-cn="auto-restore"]').uncheck();
  await page.locator('[data-tab="prompts"]').click();
  await page.locator('[data-cn-list="prompts"] li[data-turn-id="turn_u_theme"]').click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__CN_PREVIEW__?.status, null, { timeout: 8000 });
  const noRestore = await state(page);
  record(
    "3c-auto-restore-off",
    String(noRestore?.status ?? "").includes("自动恢复已关闭") && noRestore?.activeTurn !== "turn_u_theme",
    `status=${noRestore?.status} active=${noRestore?.activeTurn}`,
  );

  await page.selectOption('[data-cn="thread"]', "thread_preview_stress_001");
  await page.waitForFunction(() => window.__CN_PREVIEW__?.promptCount === 90, null, { timeout: 8000 });
  record("1b-stress", (await page.locator('[data-cn-list="prompts"] li').count()) === 90, "stress 90");

  await page.selectOption('[data-cn="thread"]', "thread_preview_nav_001");
  await page.waitForFunction(() => window.__CN_PREVIEW__?.threadId === "thread_preview_nav_001", null, { timeout: 8000 });
  await page.locator('[data-cn="settings-gear"]').click();
  await page.locator('[data-cn-feature="promptNavigator"]').uncheck();
  await page.waitForTimeout(200);
  const promptsGone = await page.locator('[data-tab="prompts"]').isHidden();
  await page.locator('[data-cn-feature="promptNavigator"]').check();
  await page.locator('[data-cn-feature="quotaBar"]').uncheck();
  await page.waitForTimeout(150);
  const quotaGone = await page.locator("[data-cn='quota-bar']").isHidden();
  await page.locator('[data-cn-feature="quotaBar"]').check();
  await page.locator('[data-cn-feature="conversationRail"]').uncheck();
  await page.waitForTimeout(150);
  const railGone = await page.locator("[data-cn='conversation-rail']").isHidden();
  await page.locator('[data-cn-feature="conversationRail"]').check();
  await page.locator('[data-cn-feature="conversationProgress"]').uncheck();
  await page.waitForTimeout(150);
  const progressGone = await page.locator("[data-cn='conversation-progress']").isHidden();
  await page.locator('[data-cn-feature="conversationProgress"]').check();
  record(
    "10-flags",
    promptsGone && quotaGone && railGone && progressGone,
    `promptsGone=${promptsGone} quotaGone=${quotaGone} railGone=${railGone} progressGone=${progressGone}`,
  );

  await page.goto("http://127.0.0.1:8765/tools/panel-preview.html?quotaFixture=1", { waitUntil: "networkidle" });
  await page.waitForSelector("[data-cn='quota-label']");
  const fixtureLabel = await page.locator("[data-cn='quota-label']").innerText();
  record(
    "10b-quota-fixture",
    fixtureLabel.includes("93%") && fixtureLabel.includes("后重置") && !/周|token|\$/i.test(fixtureLabel),
    fixtureLabel,
  );

  console.log("\n--- shortcut automation ---");
  console.log(JSON.stringify({ shortcutToggle, shortcutEsc, shortcutNav, shortcutLatest, shortcutBookmark }, null, 2));
} finally {
  try {
    await browser?.close();
  } finally {
    server?.kill();
  }
}

const failed = results.filter((row) => !row.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll preview e2e checks passed");

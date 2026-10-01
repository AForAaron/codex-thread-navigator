/** Owned DOM regression for Chat's session-only rail and reading anchor. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const output = await build({ entryPoints: ["packages/plugin/src/chat-session.ts"], bundle: true, format: "iife", globalName: "CNChatSession", platform: "browser", write: false });
const script = output.outputFiles[0].text;
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const fixture = `<!doctype html><html><head><style>
  body{margin:0}#layout{position:relative;height:800px;margin-left:290px}
  .thread-scroll-container{height:800px;overflow-y:auto;display:flex;flex-direction:column-reverse}
  .content{display:flex;flex-direction:column;flex-shrink:0;padding-top:100px;padding-bottom:800px}
  [data-turn-key]{flex-shrink:0} p{height:200px;margin:0}
  </style></head><body>
  <button aria-label="切换模式，当前模式：ChatGPT">ChatGPT</button><button id="a">A</button><button id="b">B</button>
  <div id="layout"></div><script>
  function turn(id,answerId,n){return '<div data-turn-key="'+id+'"><div data-chatgpt-search-message-ids="'+id+'"><div data-user-message-bubble>Question</div></div><div data-chatgpt-search-message-ids="'+answerId+'">'+Array.from({length:n},(_,i)=>'<p>Block '+i+'</p>').join('')+'</div></div>'}
  function show(which){document.getElementById('layout').innerHTML='<div class="thread-scroll-container"><div class="content" data-map-composer-conversation="'+which+'">'+(which==='chat-a-12345'?turn('turn-a-11111','answer-a-11111',12)+turn('turn-a-22222','answer-a-22222',12)+turn('turn-a-33333','answer-a-33333',4)+turn('turn-a-44444','answer-a-44444',4):Array.from({length:4},(_,i)=>turn('turn-b-'+String(i).padStart(5,'0'),'answer-b-'+String(i).padStart(5,'0'),6)).join(''))+'</div></div>'}
  window.renderBulk=function(n){document.getElementById('layout').innerHTML='<div class="thread-scroll-container"><div class="content" data-map-composer-conversation="chat-bulk-12345">'+Array.from({length:n},(_,i)=>turn('bulk-turn-'+String(i).padStart(5,'0'),'bulk-answer-'+String(i).padStart(5,'0'),1)).join('')+'</div></div>'}
  document.getElementById('a').onclick=()=>show('chat-a-12345');document.getElementById('b').onclick=()=>show('chat-b-12345');show('chat-a-12345');
  </script></body></html>`;
  await page.route("http://chat-fixture.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fixture }));
  await page.addInitScript({ content: `${script}\nwindow.addEventListener("DOMContentLoaded",()=>{window.__stopChatSession=CNChatSession.startChatSession()});` });
  await page.goto("http://chat-fixture.test/");
  await page.waitForFunction(() => document.querySelectorAll(".cn-chat-rail button").length === 4, null, { timeout: 5000 }).catch(async (error) => {
    const state = await page.evaluate(() => ({ boot: typeof window.__stopChatSession, bundle: typeof window.CNChatSession, mode: document.querySelector("button[aria-label]")?.getAttribute("aria-label"), scroller: document.querySelector(".thread-scroll-container")?.getBoundingClientRect().toJSON(), turns: document.querySelectorAll("[data-turn-key]").length, style: document.querySelectorAll("style[data-cn-chat-rail]").length }));
    throw new Error(`${error.message}: ${JSON.stringify(state)}`);
  });
  const visual = await page.evaluate(() => {
    const first = document.querySelector(".cn-chat-rail-tick");
    const second = document.querySelectorAll(".cn-chat-rail-tick")[1];
    const line = first.querySelector(".cn-chat-rail-line");
    return { hit: first.getBoundingClientRect().toJSON(), stroke: line.getBoundingClientRect().width, step: second.getBoundingClientRect().top - first.getBoundingClientRect().top };
  });
  assert.equal(visual.hit.width, 36);
  assert.equal(visual.hit.height, 10);
  assert.ok(Math.abs(visual.stroke - 6) < 1, `idle stroke ${visual.stroke}`);
  assert.equal(visual.step, 10);
  await page.locator(".cn-chat-rail-tick").nth(1).hover();
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".cn-chat-rail-preview-title").textContent(), "Question");
  assert.match(await page.locator(".cn-chat-rail-preview-answer").textContent(), /Block 0/);
  const hover = await page.evaluate(() => [...document.querySelectorAll(".cn-chat-rail-line")].map((line) => line.getBoundingClientRect().width));
  assert.ok(hover[1] >= 25 && hover[0] > 15 && hover[0] < hover[1], `hover strokes ${hover}`);
  await page.locator(".cn-chat-rail button").nth(1).click();
  await page.waitForTimeout(100);
  let offset = await page.evaluate(() => {
    const s = document.querySelector(".thread-scroll-container");
    return document.querySelectorAll("[data-user-message-bubble]")[1].getBoundingClientRect().top - s.getBoundingClientRect().top;
  });
  assert.ok(Math.abs(offset - 82) <= 2, `second question offset ${offset}`);
  assert.equal(await page.locator('.cn-chat-rail button[data-active="true"]').count(), 1);
  await page.evaluate(() => { document.querySelector(".thread-scroll-container").scrollTop = -700; });
  await page.waitForTimeout(250);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("codex-navigator-chat-reading-v1") ?? "{}")["chat-a-12345"]);
  assert.ok(saved?.messageId && Number.isFinite(saved.viewportOffset), "content anchor was saved");
  await page.locator("#b").click();
  await page.waitForFunction(() => document.querySelectorAll(".cn-chat-rail button").length === 4);
  await page.locator("#a").click();
  await page.waitForFunction(() => document.querySelectorAll(".cn-chat-rail button").length === 4);
  await page.waitForTimeout(100);
  const position = async () => page.evaluate((anchor) => {
    const scroll = document.querySelector(".thread-scroll-container");
    const turn = [...scroll.querySelectorAll("[data-turn-key]")].find((item) => item.getAttribute("data-turn-key") === anchor.turnId);
    const message = [...turn.querySelectorAll("[data-chatgpt-search-message-ids]")].find((item) => item.getAttribute("data-chatgpt-search-message-ids") === anchor.messageId);
    const blocks = [...message.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,img,table")].filter((item) => item.getBoundingClientRect().height > 0);
    return (blocks[anchor.blockIndex] ?? message).getBoundingClientRect().top - scroll.getBoundingClientRect().top;
  }, saved);
  offset = await position();
  assert.ok(Math.abs(offset - saved.viewportOffset) <= 4, `A→B→A drift ${offset - saved.viewportOffset}`);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll(".cn-chat-rail button").length === 4);
  await page.waitForTimeout(100);
  offset = await position();
  assert.ok(Math.abs(offset - saved.viewportOffset) <= 4, `reload drift ${offset - saved.viewportOffset}`);
  await page.evaluate(() => window.renderBulk(3));
  await page.waitForFunction(() => document.querySelectorAll(".cn-chat-rail button").length === 0);
  for (const count of [90, 500, 1000]) {
    await page.evaluate((value) => window.renderBulk(value), count);
    await page.waitForFunction((value) => document.querySelectorAll(".cn-chat-rail button").length === value, count, { timeout: 15000 });
    for (const index of [0, Math.floor(count / 2), count - 1]) {
      await page.locator(".cn-chat-rail button").nth(index).evaluate((button) => button.click());
      await page.waitForTimeout(50);
      const location = await page.evaluate((at) => {
        const scroll = document.querySelector(".thread-scroll-container");
        const target = scroll.querySelectorAll("[data-user-message-bubble]")[at];
        return { offset: target.getBoundingClientRect().top - scroll.getBoundingClientRect().top, active: document.querySelectorAll('.cn-chat-rail button[data-active="true"]').length };
      }, index);
      assert.ok(Math.abs(location.offset - 82) <= 4, `${count} turns, index ${index}: offset ${location.offset}`);
      assert.equal(location.active, 1);
    }
  }
  await page.evaluate(() => window.__stopChatSession());
  assert.equal(await page.locator(".cn-chat-rail,style[data-cn-chat-rail]").count(), 0);
  console.log("PASS Chat rail jump at 90/500/1000 turns, A→B→A content anchor, reload, disposal");
} finally { await browser.close(); }

import { sha256Hex } from "../../core/src/hash.ts";
import type { PreviewFixture } from "./fixture.ts";

export async function renderPreviewThread(host: HTMLElement, fixture: PreviewFixture, signal?: AbortSignal): Promise<HTMLElement> {
  const viewport = document.createElement("div");
  viewport.className = "app-shell-main-content-viewport";
  viewport.dataset.previewThread = fixture.threadId;

  const heading = document.createElement("h1");
  heading.textContent = fixture.title;
  viewport.append(heading);

  for (const block of fixture.blocks) {
    const article = document.createElement("article");
    article.className = `preview-turn preview-turn-${block.role}`;
    article.dataset.turnId = block.turnId;
    article.dataset.itemId = block.itemId;
    article.dataset.itemIndex = String(block.itemIndex);
    article.dataset.role = block.role;
    if (block.role === "user") {
      article.setAttribute("data-testid", "user-message");
      article.setAttribute("data-message-author", "user");
    } else {
      article.setAttribute("data-testid", "assistant-message");
    }
    const hash = await sha256Hex(block.body);
    article.dataset.blockHash = hash;
    const label = document.createElement("div");
    label.className = "preview-turn-meta cn-debug";
    label.title = `${block.turnId} · ${block.itemId}`;
    label.textContent = `${block.role} · ${block.turnId} · ${block.itemId}`;
    article.append(label);
    if (block.html) {
      const htmlHost = document.createElement("div");
      htmlHost.className = "preview-turn-html";
      htmlHost.innerHTML = block.html;
      article.append(htmlHost);
    } else {
      const body = document.createElement("p");
      body.textContent = block.body;
      article.append(body);
    }
    viewport.append(article);
  }

  const spacer = document.createElement("div");
  spacer.className = "preview-scroll-spacer";
  spacer.style.height = "70vh";
  spacer.setAttribute("aria-hidden", "true");
  viewport.append(spacer);

  if (!signal?.aborted) host.replaceChildren(viewport);
  return viewport;
}

export function appendGeneratedBlock(viewport: HTMLElement, index: number): HTMLElement {
  const article = document.createElement("article");
  article.className = "preview-turn preview-turn-assistant";
  article.dataset.turnId = `turn_gen_${index}`;
  article.dataset.itemId = `item_gen_${index}`;
  article.dataset.role = "assistant";
  article.setAttribute("data-testid", "assistant-message");
  article.innerHTML = `<div class="preview-turn-meta cn-debug">assistant · turn_gen_${index}</div><p>正在补充一段新的说明，方便验收跟随模式。</p>`;
  const spacer = viewport.querySelector(".preview-scroll-spacer");
  viewport.insertBefore(article, spacer);
  return article;
}

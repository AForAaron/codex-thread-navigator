#!/usr/bin/env node
/**
 * Localhost-only static + navigator.sqlite API.
 * Does not open ~/.codex/thread_history or ChatGPT.app.
 * Live history scan is npm run land only (short-lived, then exit).
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { saveLocalReadingPosition } from "../dist/packages/core/src/discovery/anchors.js";
import { openNavigatorDb } from "../dist/packages/core/src/persistence/db.js";

const host = "127.0.0.1";
const port = Number(process.env.CODEX_NAV_PREVIEW_PORT || 8765);
const root = resolve(join(fileURLToPath(new URL("..", import.meta.url))));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function withDb(fn) {
  const db = openNavigatorDb();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function publicPrompt(row) {
  return {
    threadId: row.threadId,
    turnId: row.turnId,
    itemId: row.itemId,
    ordinal: row.ordinal,
    title: row.title,
    contentHash: row.contentHash,
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      product: "panel-preview",
      explodex: false,
      liveHistoryScan: false,
      source: "navigator.sqlite",
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/quota") {
    json(res, 200, {
      connected: false,
      remainingPercent: null,
      resetAt: null,
      source: "disconnected",
      reason: "no-safe-source",
      weekly: null,
      money: null,
      tokens: null,
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/threads") {
    const payload = withDb((db) => {
      const threads = db.listThreads().map((row) => ({
        threadId: row.threadId,
        title: row.title,
        userPromptCount: db.listPromptIndex(row.threadId).length,
      }));
      return { threads, selectedThreadId: threads[0]?.threadId ?? null, source: "navigator.sqlite" };
    });
    json(res, 200, payload);
    return true;
  }

  const threadMatch = url.pathname.match(/^\/api\/threads\/([^/]+)\/(prompts|state)$/);
  if (req.method === "GET" && threadMatch) {
    const threadId = decodeURIComponent(threadMatch[1]);
    if (threadMatch[2] === "prompts") {
      json(res, 200, withDb((db) => ({ prompts: db.listPromptIndex(threadId).map(publicPrompt) })));
      return true;
    }
    const payload = withDb((db) => ({
      reading: db.getReadingPosition(threadId),
      bookmarks: db.listBookmarks(threadId).map((row) => ({
        id: row.id,
        threadId: row.threadId,
        turnId: row.turnId,
        itemId: row.itemId,
        kind: row.kind,
        headingId: row.headingId,
        title: row.title,
      })),
    }));
    json(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/select") {
    const body = await readBody(req);
    const threadId = String(body.threadId ?? "");
    const turnId = String(body.turnId ?? "");
    const payload = withDb((db) => {
      const prompts = db.listPromptIndex(threadId);
      const prompt =
        prompts.find((row) => row.turnId === turnId && (!body.itemId || row.itemId === body.itemId)) ??
        prompts.find((row) => row.turnId === turnId);
      if (!prompt) return { error: "unknown thread or turn" };
      saveLocalReadingPosition(
        db,
        {
          threadId: prompt.threadId,
          turnId: prompt.turnId,
          itemId: prompt.itemId ?? prompt.turnId,
          ordinal: prompt.ordinal,
          title: prompt.title ?? "",
          contentHash: prompt.contentHash,
        },
        0,
      );
      if (body.bookmarkKind === "turn" || body.bookmarkKind === "message" || body.bookmarkKind === "heading") {
        const existing = db.listBookmarks(threadId);
        const headingId = `h-none-${prompt.turnId}`;
        const dup = existing.some(
          (row) =>
            row.kind === body.bookmarkKind &&
            row.turnId === prompt.turnId &&
            (body.bookmarkKind !== "heading" || row.headingId === headingId),
        );
        if (!dup) {
          db.addBookmark({
            threadId: prompt.threadId,
            turnId: prompt.turnId,
            itemId: prompt.itemId,
            contentHash: prompt.contentHash,
            title: prompt.title,
            kind: body.bookmarkKind,
            headingId: body.bookmarkKind === "heading" ? headingId : null,
          });
        }
      }
      return {
        reading: db.getReadingPosition(threadId),
        bookmarks: db.listBookmarks(threadId),
        officialJump: false,
      };
    });
    json(res, payload.error ? 404 : 200, payload);
    return true;
  }

  if (url.pathname.startsWith("/api/")) {
    json(res, 404, { error: "not found" });
    return true;
  }
  return false;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${host}:${port}`);
  try {
    if (await handleApi(req, res, url)) return;
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "api error" });
    return;
  }

  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("bad request: undecodable path");
    return;
  }
  if (rel === "/") rel = "/tools/panel-preview.html";
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const file = resolve(join(root, safe));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
      expires: "0",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "cache-control": "no-store" });
    res.end("not found");
  }
});

server.listen(port, host, () => {
  console.log(`Codex Navigator index   http://${host}:${port}/tools/desktop-index.html`);
  console.log(`Fixture preview         http://${host}:${port}/tools/panel-preview.html`);
  console.log("API reads navigator.sqlite only. ~/.codex is not opened. Ctrl+C to stop.");
});

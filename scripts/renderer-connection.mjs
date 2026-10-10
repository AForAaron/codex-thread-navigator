/** Rebuild a local renderer channel after sleep, timeout or target replacement. */
export function createRendererConnection({ port, WebSocketImpl = WebSocket, discover,
  onReconnect = async () => {}, onDisconnect = () => {} }) {
  const getTarget = discover ?? (async () => {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) }).then(r => r.json());
    const target = targets.find(t => t.type === "page" && t.url === "app://-/index.html" && t.webSocketDebuggerUrl);
    if (!target) throw new Error("Codex renderer target unavailable");
    return target.webSocketDebuggerUrl;
  });
  let socket = null, connecting = null, sequence = 0, connections = 0, stopped = false;
  const pending = new Map();
  const invalidate = (expected = socket) => {
    if (!expected || expected !== socket) return;
    socket = null;
    for (const waiter of pending.values()) waiter.reject(new Error("Renderer connection lost"));
    pending.clear();
    expected.close();
    if (!stopped) onDisconnect();
  };
  const rawSend = (method, params = {}, timeoutMs = 10000) => new Promise((resolve, reject) => {
    const current = socket;
    if (!current || current.readyState !== 1) { reject(new Error("Renderer not connected")); return; }
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
      invalidate(current);
    }, timeoutMs);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    try { current.send(JSON.stringify({ id, method, params })); }
    catch (error) { invalidate(current); }
  });
  const connect = async () => {
    if (stopped) throw new Error("Renderer connection closed");
    if (connecting) return connecting;
    if (socket?.readyState === 1) return;
    connecting = (async () => {
      const url = await getTarget();
      if (stopped) throw new Error("Renderer connection closed");
      const current = new WebSocketImpl(url);
      socket = current;
      current.onmessage = event => {
        if (current !== socket) return;
        let message;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
      };
      current.onclose = () => invalidate(current);
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Renderer connect timed out")), 5000);
          current.onopen = () => { clearTimeout(timer); resolve(); };
          current.onerror = () => { clearTimeout(timer); reject(new Error("Renderer connect failed")); };
        });
        current.onerror = () => invalidate(current);
        if (++connections > 1) await onReconnect(rawSend);
      } catch (error) { invalidate(current); throw error; }
    })();
    try { await connecting; } finally { connecting = null; }
  };
  return {
    connect,
    async send(method, params, timeoutMs) { await connect(); return rawSend(method, params, timeoutMs); },
    reset: () => invalidate(),
    close() { stopped = true; invalidate(); },
  };
}

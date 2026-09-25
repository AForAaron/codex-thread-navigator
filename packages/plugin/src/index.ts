import { createCodexCurrentAdapter } from "../../core/src/adapters/codex-current.ts";
import { createExplodexAppServerClient } from "../../core/src/appserver/explodex-bridge.ts";
import { createUnavailableAppServerClient } from "../../core/src/appserver/client.ts";
import { createNavigatorPanel, NAVIGATOR_PANEL_CSS, type NavigatorPanelApi } from "./ui/navigator-panel.ts";

const PLUGIN_ID = "codex-navigator";
const ENABLED_KEY = "explodex-codex-navigator";

type ExplodexPluginApi = {
  pluginId: string;
  log: { info: (m: string, d?: unknown) => void; warn: (m: string, d?: unknown) => void };
  mount: (zoneId: string, factory: (ctx: { mountPoint: HTMLElement }) => Node, opts?: { replace?: boolean }) => boolean;
  waitFor: (zoneId: string, cb: () => void) => () => void;
  registerOptions: (handlers: { render: (container: HTMLElement) => void }) => void;
  storage?: { persisted?: { get: (k: string, fb?: unknown) => unknown; set: (k: string, v: unknown) => void } };
  bridge?: { isAvailable: () => boolean; send: (type: string, payload?: Record<string, unknown>) => Promise<unknown> };
  codex?: { getThreadConversation: (id: string) => { id: string } | null };
  components?: {
    checkboxField: (opts: { label: string; checked?: boolean; onChange?: (v: boolean) => void }) => HTMLElement;
    metaText: (text?: string) => HTMLElement;
  };
};

function readEnabled(api: ExplodexPluginApi): boolean {
  const stored = api.storage?.persisted?.get(ENABLED_KEY, { panelEnabled: false }) as { panelEnabled?: boolean } | undefined;
  return stored?.panelEnabled === true;
}

function writeEnabled(api: ExplodexPluginApi, panelEnabled: boolean): void {
  api.storage?.persisted?.set(ENABLED_KEY, { panelEnabled });
}

function ensureStyle(): void {
  const id = "codex-navigator-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = NAVIGATOR_PANEL_CSS;
  document.documentElement.append(style);
}

function attachPanel(api: ExplodexPluginApi, panel: NavigatorPanelApi): () => void {
  ensureStyle();
  const mounted = api.mount(
    "statusOverlay",
    () => panel.root,
    { replace: true },
  );
  if (!mounted) {
    document.body.append(panel.root);
  }
  return () => {
    panel.root.remove();
    document.getElementById("codex-navigator-style")?.remove();
  };
}

async function refreshFromAdapter(panel: NavigatorPanelApi): Promise<void> {
  const adapter = createCodexCurrentAdapter(document, window.location); // lockGate default "desktop" → lockViewport no-op
  const thread = adapter.getCurrentThreadId();
  panel.setThreadId(thread.ok ? thread.value : null);
  const prompts = await adapter.listUserPrompts();
  if (!prompts.ok) {
    panel.setPrompts([], prompts.message);
    panel.setStatus(`${prompts.code}: ${prompts.message}`);
    return;
  }
  panel.setPrompts(prompts.value.map((row) => ({ title: row.title, turnId: row.turnId })));
  panel.setStatus(`adapter scanned ${prompts.value.length} prompt node(s)`);
}

/**
 * Phase 0 default: register + options only. No DOM until the user enables the panel.
 * Prompt jump uses CodexCurrentAdapter, never a fake list.
 */
function setup(api: ExplodexPluginApi): () => void {
  const teardowns: Array<() => void> = [];
  let panelApi: NavigatorPanelApi | null = null;
  let panelTeardown: (() => void) | null = null;

  const appserver = api.bridge
    ? createExplodexAppServerClient({ bridge: api.bridge, codex: api.codex })
    : createUnavailableAppServerClient();

  api.log.info("registered (inert until panelEnabled)", {
    appserverKind: appserver.kind,
    appserverAvailable: appserver.isAvailable(),
  });

  const hidePanel = () => {
    panelTeardown?.();
    panelTeardown = null;
    panelApi = null;
  };

  const showPanel = () => {
    if (panelApi) return;
    panelApi = createNavigatorPanel({
      enabled: true,
      onToggleEnabled: (enabled) => {
        writeEnabled(api, enabled);
        if (!enabled) hidePanel();
      },
      onJumpLatest: () => {
        const adapter = createCodexCurrentAdapter(document, window.location); // desktop default: lockViewport no-op
        void adapter.listUserPrompts().then(() => {
          const result = adapter.jumpToLatest();
          panelApi?.setStatus(result.ok ? "jumped to latest scanned prompt" : `${result.code}: ${result.message}`);
        });
      },
      onRefresh: () => {
        if (panelApi) void refreshFromAdapter(panelApi);
      },
      onCollapse: hidePanel,
    });
    panelTeardown = attachPanel(api, panelApi);
    void refreshFromAdapter(panelApi);
    void appserver.getCurrentThreadId().then((cap) => {
      if (!panelApi) return;
      if (!cap.ok) panelApi.setStatus(`AppServer: ${cap.code} — ${cap.message}`);
    });
  };

  if (readEnabled(api)) showPanel();

  api.registerOptions({
    render(container) {
      const box = api.components?.checkboxField
        ? api.components.checkboxField({
            label: "启用右侧 Navigator 面板（会向 statusOverlay 插入 DOM；默认关闭）",
            checked: readEnabled(api),
            onChange: (checked) => {
              writeEnabled(api, checked);
              if (checked) showPanel();
              else hidePanel();
            },
          })
        : (() => {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = readEnabled(api);
            input.addEventListener("change", () => {
              writeEnabled(api, input.checked);
              if (input.checked) showPanel();
              else hidePanel();
            });
            label.append(input, " 启用右侧 Navigator 面板");
            return label;
          })();
      container.append(box);
      const note = api.components?.metaText
        ? api.components.metaText(
            "Safe Mode: 直接打开 /Applications/ChatGPT.app，不要运行 explodex。本插件默认不改 Codex DOM。",
          )
        : Object.assign(document.createElement("p"), {
            textContent: "Safe Mode: 直接打开 /Applications/ChatGPT.app，不要运行 explodex。",
          });
      container.append(note);
    },
  });

  teardowns.push(hidePanel);
  return () => {
    for (const stop of teardowns) stop();
  };
}

const global = globalThis as unknown as {
  Explodex?: { plugins?: { register: (m: object, setup: (api: ExplodexPluginApi) => unknown) => unknown } };
};

if (global.Explodex?.plugins?.register) {
  global.Explodex.plugins.register({ id: PLUGIN_ID, name: "Codex Navigator", version: "0.1.0" }, setup);
}

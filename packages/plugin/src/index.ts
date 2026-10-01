import { createCodexCurrentAdapter } from "../../core/src/adapters/codex-current.ts";
import { createExplodexAppServerClient } from "../../core/src/appserver/explodex-bridge.ts";
import { createUnavailableAppServerClient } from "../../core/src/appserver/client.ts";
import { createNavigatorPanel, NAVIGATOR_PANEL_CSS, type NavigatorPanelApi } from "./ui/navigator-panel.ts";
import { createUsageIndicator, USAGE_INDICATOR_CSS } from "./ui/usage-indicator.ts";
import { startUsageController } from "./usage-controller.ts";
import { parseCodexRateLimits } from "../../core/src/quota/codex-rate-limits.ts";
import { startChatSession } from "./chat-session.ts";

const PLUGIN_ID = "codex-navigator";
const ENABLED_KEY = "explodex-codex-navigator";
const USAGE_ENABLED_KEY = "explodex-codex-usage-rail";

type ExplodexPluginApi = {
  pluginId: string;
  log: { info: (m: string, d?: unknown) => void; warn: (m: string, d?: unknown) => void };
  mount: (zoneId: string, factory: (ctx: { mountPoint: HTMLElement }) => Node, opts?: { replace?: boolean }) => boolean;
  waitFor: (zoneId: string, cb: () => void) => () => void;
  registerOptions: (handlers: { render: (container: HTMLElement) => void }) => void;
  storage?: { persisted?: { get: (k: string, fb?: unknown) => unknown; set: (k: string, v: unknown) => void } };
  bridge?: { isAvailable: () => boolean; send: (type: string, payload?: Record<string, unknown>) => Promise<unknown>; rpc?: (method: string, params?: Record<string, unknown>) => Promise<unknown | null> };
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

function readUsageEnabled(api: ExplodexPluginApi): boolean {
  return api.storage?.persisted?.get(USAGE_ENABLED_KEY, false) === true;
}

function writeUsageEnabled(api: ExplodexPluginApi, enabled: boolean): void {
  api.storage?.persisted?.set(USAGE_ENABLED_KEY, enabled);
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
  let usageTeardown: (() => void) | null = null;
  const sessionUsage = (window as Window & { __CODEX_USAGE_RAIL_SESSION__?: boolean }).__CODEX_USAGE_RAIL_SESSION__ === true;

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
    const restoreUsage = usageTeardown !== null;
    if (restoreUsage) hideUsage();
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
    if (restoreUsage) showUsage();
  };

  const hideUsage = () => {
    usageTeardown?.();
    usageTeardown = null;
  };

  const showUsage = () => {
    if (usageTeardown) return;
    const indicator = createUsageIndicator();
    const mounted = api.mount("statusOverlay", () => indicator.root);
    if (!mounted) {
      indicator.dispose();
      api.log.warn("usage rail not mounted: statusOverlay is unavailable");
      return;
    }
    const style = document.createElement("style");
    style.dataset.codexUsageRail = "true";
    style.textContent = `${USAGE_INDICATOR_CSS}\n.cn-usage { position: fixed; left: 8px; bottom: 68px; z-index: 2147483639; }\n@media (max-height: 540px) { .cn-usage { display: none; } }`;
    document.documentElement.append(style);
    // A guessed fixed location must fail closed if a native rail control occupies it.
    const checkClearance = () => {
      const rect = indicator.root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + 3, rect.top + 3],
        [rect.right - 3, rect.bottom - 3],
      ];
      const occupied = points.some(([x, y]) => {
        const underlying = document.elementFromPoint(x, y);
        return underlying?.closest("button, a, input, select, textarea, [role='button'], [role='link']") != null;
      });
      indicator.root.style.visibility = occupied ? "hidden" : "visible";
    };
    indicator.root.style.visibility = "hidden";
    const placementFrame = window.requestAnimationFrame(checkClearance);
    window.addEventListener("resize", checkClearance);
    const placementTimer = window.setInterval(checkClearance, 3000);
    const sessionWindow = window as Window & { __codexNavigatorSetUsage?: (data: unknown) => void };
    if (sessionUsage) {
      sessionWindow.__codexNavigatorSetUsage = (data) => {
        const limits = parseCodexRateLimits(data);
        indicator.setState(limits ? { kind: "ready", limits, updatedAt: Date.now() } : { kind: "unavailable", reason: "额度数据未通过校验。" });
      };
    }
    const stopReading = sessionUsage ? () => {} : startUsageController(api.bridge, indicator.setState);
    usageTeardown = () => {
      if (sessionUsage) delete sessionWindow.__codexNavigatorSetUsage;
      stopReading();
      window.cancelAnimationFrame(placementFrame);
      window.removeEventListener("resize", checkClearance);
      window.clearInterval(placementTimer);
      indicator.dispose();
      style.remove();
    };
  };

  if (readEnabled(api)) showPanel();
  if (sessionUsage || readUsageEnabled(api)) showUsage();

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
      const usageBox = api.components?.checkboxField
        ? api.components.checkboxField({
            label: "实验性：在左侧窄栏头像上方显示 Codex 额度",
            checked: readUsageEnabled(api),
            onChange: (checked) => {
              writeUsageEnabled(api, checked);
              if (checked) showUsage();
              else hideUsage();
            },
          })
        : (() => {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = readUsageEnabled(api);
            input.addEventListener("change", () => {
              writeUsageEnabled(api, input.checked);
              if (input.checked) showUsage();
              else hideUsage();
            });
            label.append(input, " 实验性：左侧窄栏 Codex 额度");
            return label;
          })();
      container.append(usageBox);
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
  teardowns.push(hideUsage);
  if ((window as Window & { __CODEX_CHAT_NAV_SESSION__?: boolean }).__CODEX_CHAT_NAV_SESSION__ === true) {
    teardowns.push(startChatSession());
  }
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

# Codex Navigator 插件（Explodex）

放置位置（官方用户插件目录，**覆盖同 id 的 bundled 插件**）：

```
~/.explodex/plugins/codex-navigator/plugin.json
~/.explodex/plugins/codex-navigator/index.js
```

从仓库安装（不启动 Codex、不注入）：

```sh
bash scripts/install-plugin.sh
```

默认行为：只 `register`，**不改 Codex DOM**。要看右侧面板，需在 Explodex 设置页打开开关。

卸载：删掉该目录，或在 Explodex 设置里 Disable。Safe Mode 见仓库 `docs/SAFE_MODE.md`。

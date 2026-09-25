# 备份清单

- 时间戳目录：`backups/20260912-1713/`
- 机器：local Mac
- 方式：只复制 / 只读取。未删除任何原文件。未写入 `/Applications`。

## 备份了什么

| 路径 | 内容 |
| --- | --- |
| `20260912-1713/dot-codex/config.toml` | `~/.codex/config.toml` 副本；密钥类键名已替换为 `<REDACTED>`（本文件当时未发现 token） |
| `20260912-1713/dot-codex/version.json` | Codex home 版本缓存 |
| `20260912-1713/dot-codex/plugins-listing.txt` | `~/.codex/plugins` 目录列表（官方 Codex plugins，不是 Explodex） |
| `20260912-1713/machine/*` | ChatGPT.app codesign / sha256 / mdls；路径探测 |
| `20260912-1713/workspace-snapshot/` | 当时工作区几乎为空的目录列表 |
| `Explodex-Application-Support.ABSENT.txt` | `~/Library/Application Support/Explodex` 不存在 |
| `CodexNavigator-Application-Support.ABSENT.txt` | `~/Library/Application Support/CodexNavigator` 当时不存在 |

## 故意没备份什么

| 路径 | 原因 |
| --- | --- |
| `/Applications/Codex.app` | 不存在；且禁止复制/修改 app 本体 |
| `/Applications/ChatGPT.app` | 太大；我们不修改它。只记录 codesign/hash |
| `~/Library/Application Support/Codex/` | Electron userData，含 Cookies / Local Storage / 登录态 |
| `~/.codex/auth.json` `.env` | 凭证 |
| `~/.codex/thread_history_*.sqlite` `state_*.sqlite` `logs_*.sqlite` | 对话与运行数据，Navigator 不复制正文 |
| Keychain / session cookie / ChatGPT 登录仓库 | 红线 |
| Explodex 安装树 | 当时不存在 |

## 如何回退

Navigator 尚未接入 live 注入。回退步骤：

1. Safe Mode：`open -a /Applications/ChatGPT.app`（见 `docs/SAFE_MODE.md`）
2. 若之后创建了 `~/.explodex/plugins/codex-navigator`：删掉该目录
3. 若之后创建了 `~/Library/Application Support/CodexNavigator/`：可整目录删除（只含索引 SQLite，不含对话）
4. `config.toml` 若被改坏：用 `backups/20260912-1713/dot-codex/config.toml` 对照后手工恢复（先检查 `<REDACTED>`；该副本不应含真实密钥）
5. **不要**用本备份去覆盖 ChatGPT.app；本体应以 OpenAI 签名为准

备份之后（Phase 1 初始化）另外创建了空索引库：

`~/Library/Application Support/CodexNavigator/navigator.sqlite`

只含 schema，无对话正文。删掉该目录即可卸载 Navigator 数据，不影响 Codex。


```sh
bash scripts/verify-codex-untouched.sh
```

## 基线更新（2026-09-24，verify 脚本升级）

- 新基线目录：`backups/20260924-2241/machine/`，`backups/LATEST.txt` 指向它。
- 触发原因：ChatGPT.app 自升级到 `26.917.71314` (build 10954)，与 09-12 基线哈希不符。新 `verify-codex-untouched.sh` 现在以 `codesign --verify --strict` + `Identifier`/`TeamIdentifier` 断言为准，抽查哈希降级为"信息项"——官方自升级（签名仍有效）不再判失败，只有签名被破坏才 exit 1。
- 旧基线 `backups/20260912-1713/` 完整保留，未删改。
- 本机实测：`codesign --verify --strict` PASSED，TeamIdentifier `2DC432GLL2`（OpenAI OpCo）。

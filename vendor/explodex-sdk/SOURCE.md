# Explodex SDK snapshot

This directory is a **read-only snapshot** of public Explodex types for TypeScript checking.

| Field | Value |
| --- | --- |
| Repository | https://github.com/dan-dr/explodex |
| Default branch | `main` @ `ab0aeab4299bf1dc8da94ebd9abe77a0f8c771ac` (2026-06-29) |
| npm package | `explodex@0.2.2` (`gitHead` `7acf4ec358a7bb9b8483960bc6d833acc7a4e404`) |
| SDK `Explodex.version` (docs) | `1.2.0` |
| Types file | copied from `node_modules/explodex@0.2.2/sdk/explodex-sdk.d.ts` |
| API reference | https://github.com/dan-dr/explodex/blob/main/docs/sdk-api.md |
| Other branch (not used) | `codex/refactor-v1-cutover` @ `0dc4f6dc8eb55ca140208e83bf9d73e4ac770126` — CI referenced `@explodex/sdk` which was unresolved; **do not treat as stable API** |

Do not invent methods that are missing from `explodex-sdk.d.ts` / `docs/sdk-api.md`.
If a Navigator feature needs an undocumented AppServer RPC, return `unverified` / `unavailable` instead of faking success.

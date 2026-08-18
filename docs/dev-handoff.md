# Development handoff

> Snapshot for continuing development after a machine or session migration.
> This file is **not** a release artifact and is not in `package.json#files`.
>
> 中文摘要见文末。

Status of this tree: **Wave 1 (`1.2.0`) landed on branch `cursor/wave1-usage-ux-1be7` / PR #5.**  
OAuth / gateway work remains parallel WIP on `main` and must not be fused into a Wave 2 usage release.

> **2026-08 update (1.6.0)**: the coding-subscription OAuth module is merged into
> `src/server/coding-oauth/` and now ships its settings UI (Accounts / Gateway /
> Capabilities tabs) inside this plugin's settings section; the token-monitor-style
> local auth snapshot and cross-tool usage scan landed as the opt-in
> `localMonitor` / `localUsage` subsystem (`src/server/local-monitor/`, schema v4).
> The rest of this document remains a Wave-1-era snapshot.

## 1. Repository identity

| Item | Value |
| --- | --- |
| Package | `dsh-hub-oauth-gateway` |
| Version on this branch | `1.2.0` (Wave 1 usage UX) |
| Public remote | `https://github.com/lninghaha/dsh-hub-oauth-gateway` |
| License (declared) | `MIT AND Apache-2.0` |
| Cordis plugin id | `usage-stats` (unchanged) |
| HTTP usage API | `/api/usage-stats/v1/*` (unchanged) |
| Plugin request header | `x-dsh-hub-oauth-gateway: 1` |

## 2. Wave 1 scope (`1.2.0`) — landed

- Activity heatmap + streak (`GET /activity`, `streakMinTokens`)
- Dashboard module orchestration (`modules` / `modulesCustomized` / preset reset)
- Account fee ledger + payback tooltip (`account_fees`, `GET`/`PUT /fees`)
- Export layouts `filtered` / `daily` / `bundle` (download only; **no** auto directory write)

**Explicitly out of Wave 1:** new account adapters, adaptive refresh, cache breakdown expand, auto export to disk, Antigravity/Ollama monitors.

Research / roadmap docs (also on this tree after stabilize):

- `docs/research/token-monitor.md`
- `docs/research/token-monitor-supplement-proposal.md`
- `docs/research/usage-analytics-landscape.md`

## 3. Parallel tracks (do not explode)

| Track | Branch / PR | Notes |
| --- | --- | --- |
| Wave 1 usage UX | `cursor/wave1-usage-ux-1be7` / PR #5 | Prefer merge before Wave 2 |
| Token Monitor research | `cursor/token-monitor-research-1be7` / PR #4 | Docs; cherry-picked into Wave branches as needed |
| Coding OAuth / gateway | `main` WIP / PR #2 style | Lockfile, CLI, `llm` fiber; **rebase separately** from Wave 2 |

When rebasing across tracks: regenerate `lib/` once from `src/` after resolving conflicts; never dual-hand-edit `lib/`.

## 4. Cloud verification (primary)

Run checks in the Cursor Cloud / workspace environment. Docker is optional.

```bash
pnpm install --frozen-lockfile
pnpm run check:next
pnpm run check
```

Plugin smoke: isolated `DSH_HOME` → install `@deepseek-ai/dsh` →
`dsh plugin --profile web add <repo-path>` → `dsh web` → confirm Usage Center on
`http://127.0.0.1:3080`. End-user installs prefer npm (`dsh-hub-oauth-gateway`);
see `README.md`.

`pnpm.overrides` for `@earendil-works/pi-ai` live in `pnpm-workspace.yaml` (pnpm 11). Do not reintroduce ignored `package.json#pnpm.overrides`.

## 5. Next: Wave 2 (`1.3.0`) account coverage

Per `docs/research/token-monitor-supplement-proposal.md` §5 / Wave 2:

1. lastGood / stale UI regressions  
2. `volcengine-coding-plan` (official `GetCodingPlanUsage` only; **no** chat probe)  
3. `zai-team-plan` (`open.bigmodel.cn` + `type=2`; no personal fallback)  
4. Multi-profile monitors + snapshot key `(providerId, profileId)` + fee attachment  

Branch naming: `cursor/wave2-account-coverage-1be7` (or later Wave 3 on a separate branch).

## 6. Runtime reload

- **Cloud isolated DSH**: agents may start/restart the smoke instance under the dedicated `DSH_HOME`.
- **Operator personal machine**: after install / code change, the operator restarts DSH Web themselves unless they explicitly ask the agent to do so:

```bash
dsh-web restart
```

Until restart, a personal running instance still uses old code.

## 7. Privacy / security invariants (unchanged)

- No keys, tokens, cookies, device codes, prompts, responses, cwd, credential paths, or raw provider bodies in Git, logs, SQLite, or browser APIs.
- Loopback peer + Host, same-origin/request-context, plugin header, JSON-only writes, size limits stay on.
- Ordinary GET reads local snapshots only; credentialed refresh stays explicit mutation or background scheduler.
- Examples use `example.com`, `provider-a`, `YOUR_API_KEY`, `${DSH_HOME}`.

---

## 中文摘要

- 本分支为 **Wave 1 / `1.2.0`**：热力图+streak、模块编排、费用账本+回本、导出 layout。  
- **不含**新 adapter、自适应刷新、自动写盘。  
- 调研建议书已对齐进树；OAuth 车次与用量 Wave **分 PR**。  
- 验证以云环境 `pnpm` 门禁 + 隔离 `DSH_HOME` 安装 DSH 冒烟为主；Docker 可选。  
- 本机个人实例合并安装后由用户自行 `dsh-web restart`（除非明确要求代为重启）。  
- 下一刀：Wave 2 账户覆盖（lastGood → Volcengine → Z.ai Team → 多 profile）。

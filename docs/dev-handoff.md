# Development handoff

> Snapshot for continuing development after a machine or session migration.
> This file is **not** a release artifact and is not in `package.json#files`.
>
> 中文摘要见文末。

Status of this tree: **Wave 1 (`1.2.0`) landed on branch `cursor/wave1-usage-ux-1be7` / PR #5.**  
OAuth / gateway work remains parallel WIP on `main` and must not be fused into a Wave 2 usage release.

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

When rebasing across tracks: regenerate `lib/` once in Docker after resolving `src/`; never dual-hand-edit `lib/`.

## 4. Docker-only verification

Host is an editing surface. Do **not** run `pnpm` / `tsc` / `vitest` / `npm pack` on the host.

```bash
docker build --target check-next --build-arg NODE_VERSION=22.19.0 \
  --tag dsh-hub-oauth-gateway-sandbox:check-next .

docker build --target check --build-arg NODE_VERSION=22.19.0 \
  --tag dsh-hub-oauth-gateway-sandbox:check .

rm -rf output/docker-artifacts
docker build --target artifacts --build-arg NODE_VERSION=22.19.0 \
  --output type=local,dest=output/docker-artifacts .
# review output/docker-artifacts/lib, then replace committed lib/
```

`pnpm.overrides` for `@earendil-works/pi-ai` live in `pnpm-workspace.yaml` (pnpm 11). Do not reintroduce ignored `package.json#pnpm.overrides`.

## 5. Next: Wave 2 (`1.3.0`) account coverage

Per `docs/research/token-monitor-supplement-proposal.md` §5 / Wave 2:

1. lastGood / stale UI regressions  
2. `volcengine-coding-plan` (official `GetCodingPlanUsage` only; **no** chat probe)  
3. `zai-team-plan` (`open.bigmodel.cn` + `type=2`; no personal fallback)  
4. Multi-profile monitors + snapshot key `(providerId, profileId)` + fee attachment  

Branch naming: `cursor/wave2-account-coverage-1be7` (or later Wave 3 on a separate branch).

## 6. Runtime reload

After install / code change, the operator restarts DSH Web themselves:

```bash
dsh-web restart
```

Agents must not restart it. Until restart, the running instance still uses old code.

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
- 验证只在 Docker sandbox；`pnpm` overrides 放在 `pnpm-workspace.yaml`。  
- 合并安装后由用户自行 `dsh-web restart`。  
- 下一刀：Wave 2 账户覆盖（lastGood → Volcengine → Z.ai Team → 多 profile）。

# Development handoff

> Snapshot of in-progress work on `dsh-hub-oauth-gateway` for continuing
> development after a machine or session migration. This file is **not** a
> release artifact and is not in `package.json#files`.
>
> 中文摘要见文末。

Status of this tree: **WIP snapshot, not release-ready.**

## 1. Repository identity

| Item | Value |
| --- | --- |
| Package | `dsh-hub-oauth-gateway` |
| Version on disk | `1.1.0` (Unreleased OAuth/gateway work is **not** cut) |
| Public remote | `https://github.com/lninghaha/dsh-hub-oauth-gateway` |
| License (declared) | `MIT AND Apache-2.0` after this snapshot |
| Cordis plugin id | `usage-stats` (unchanged) |
| HTTP usage API | `/api/usage-stats/v1/*` (unchanged) |
| Plugin request header | `x-dsh-hub-oauth-gateway: 1` |
| Local checkout dir name | may still be the old folder name; remotes already point at the new repo |

Last **green** commit on `main` before the OAuth merge snapshot:

- `5f4a24c` — Docker sandbox pipeline + regenerated `lib/` for the rename (`dsh-hub-oauth-gateway 1.1.0`)

That commit verified, on Node `22.19.0` inside Docker:

- `check`: lint + typecheck + build + 20 files / 74 tests
- `verify`: `pnpm run check` + `release:inspect` (108 packed files) + `compare-trees` against committed `lib/`

Node 24 gate was **not** run. npm publish remains **forbidden** until
`pnpm run check` / release inspection are green on supported Node lines and a
human explicitly approves. Docker `verify` is optional cross-check only.

## 2. What is already landed (do not redo)

- Public repo created under the new name; history kept (13 commits at first push).
- Breaking rename documented in `CHANGELOG.md` `## 1.1.0`, README, and
  `docs/migration-v1.md`. Data files (`usage-stats-v1.sqlite`), Cordis id, and
  `/api/usage-stats/*` paths stay stable.
- Phantom CLI bins were **removed** on that green commit. This snapshot **puts
  them back** because a real `src/cli/coding-oauth.ts` now exists.
- Development runs in the isolated checkout (cloud agent / dedicated VM):
  use `pnpm install`, `pnpm run check:next` / `pnpm run check`, and rebuild
  `lib/` from `src/` in-workspace. Docker targets are optional reproducibility
  cross-checks, not a mandatory wrapper for every command.

## 3. What this snapshot adds (unverified)

Integration of `dsh-coding-subscription-oauth` (source baseline
`f685a163d49f06a7e554d9705637189989ae3a`, plus unpublished capability /
Imagine / gateway work) into this plugin. Provenance:

- `docs/oauth-provenance.md`
- `NOTICE`
- `LICENSES/Apache-2.0.txt`

### 3.1 Runtime wiring

- `src/server/index.ts` calls `applyCodingOAuth` when `config.codingOAuth.enabled`
  (default **true**). Composition failures fail closed and log a redacted warning.
- Config schema lives in `src/server/config.ts`:
  - `codingOAuth.enabled` (default true)
  - `codingOAuth.proxy` / `proxyKimi` / `retryPolicy` / `capabilities`
  - `codingOAuth.gateway` — **opt-in**, default disabled; default bind
    `127.0.0.1`, default port `18080`, optional `apiKey`, `rateLimit`
- Compatibility contracts to preserve (from provenance):
  - logger/settings identity `llm-grok-build-oauth`
  - HTTP namespace `/plugins/dsh-grok-build/*`
  - credential filenames under `${DSH_HOME}`
    (`.grok-build-auth.json`, `.codex-oauth-auth.json`, …)
  - LLM routes `grok-build`, `codex-oauth`, `kimi-code-oauth`, `claude-code-oauth`
  - CLI names `dsh-coding-oauth` and `dsh-grok-build` → `lib/bin.js`
- Google Antigravity stays an external `dsh-agy` plugin; this package only
  surfaces route/management status.

### 3.2 New / expanded trees

| Path | Role |
| --- | --- |
| `src/server/coding-oauth/` | ~47 modules: OAuth, sessions, Codex/Kimi/Claude/Grok, Imagine, media store, isolated gateway |
| `src/cli/coding-oauth.ts` | Standalone CLI entry (esbuild → `lib/bin.js`) |
| `src/server/providers/catalog.ts` | Unified provider catalog |
| `src/shared/providers.ts` | Provider-management wire schemas (GET snapshots must never include secrets) |
| `src/client/components/ProviderManagement.tsx` | Settings provider-management UI |
| `src/server/api/router.ts` | Adds `GET /api/usage-stats/v1/providers` |
| `tests/v1/server/providers-catalog.test.ts` | Catalog tests only; coding-oauth itself is under-tested here |

Build pipeline changes:

- `build/build-server.mjs` now emits `index.js`, `bin.js`, and `invariant.js`.
  Host `@deepseek-ai/*` and `@earendil-works/*` are **external**.
- `build/promote-release.mjs` promotes those three runtime pairs.
- `build/verify-release.mjs` now requires `lib/bin.js`, `lib/invariant.js`,
  `NOTICE`, dual license, and the restored bins.
- Extra tsconfigs: `tsconfig.dts-bin.json`, `tsconfig.dts-invariant.json`.
  `tsconfig.build.json` excludes `src/server/coding-oauth/invariant.ts`
  (emitted via the dedicated dts project).
- `tsconfig.host.json` **no longer** excludes `src/server/coding-oauth/**`.

Dependencies added in `package.json` (lockfile **not** fully updated):

- runtime: `undici`
- peers / dev: `@earendil-works/pi-ai@0.84.2`, `@deepseek-ai/dsh-llm-pi-ai`,
  `@deepseek-ai/dsh-atomic-write`, `@deepseek-ai/dsh-home-paths`,
  `@deepseek-ai/dsh-attachment`, `@deepseek-ai/dsh-credentials`,
  `@deepseek-ai/dsh-host-webserver`, `@deepseek-ai/dsh-invariants`,
  `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`
- `pnpm.overrides["@earendil-works/pi-ai"] = "0.84.2"`

### 3.3 Docker targets (optional)

Docker build targets remain available as an optional CI/release cross-check.
Day-to-day development in Cursor Cloud or another isolated workspace should use
workspace `pnpm` commands directly; do not block progress waiting on Docker.

## 4. Known blockers (do these first after migration)

1. **Lockfile is stale.** `pnpm-lock.yaml` does not yet contain
   `@earendil-works/pi-ai` or `@deepseek-ai/dsh-llm-pi-ai`. GitHub Actions
   (`pnpm install --frozen-lockfile`) will fail on this snapshot.
2. **Committed `lib/` is still the 1.1.0 usage-center-only build.** It does
   not contain `lib/bin.js` or `lib/invariant.js`. Rebuild via workspace
   `pnpm run release:build` (or optional Docker `artifacts`), review, and
   replace before treating the tree as release-ready.
3. **Full `pnpm run check` / Node 24 were not re-run** on the OAuth merge.
4. **coding-oauth tests are incomplete.** Only `providers-catalog` is new.
   Gateway, OAuth, capability, and CLI paths need isolated tests with mocks;
   no live providers, no real `${DSH_HOME}` credentials.
5. **CI already runs `pnpm` on the runner** (`.github/workflows/ci.yml`), which
   matches the relaxed workspace-first rules. Optional Docker `verify` may still
   be used for offline reproducibility.
6. **The plugin is not installed** in a DSH Web profile in the previous
   environment. After a successful rebuild, install with:

   ```bash
   dsh plugin --profile web add "github:lninghaha/dsh-hub-oauth-gateway"
   ```

   Then the operator restarts DSH Web themselves (`dsh-web restart`). Agents
   must not restart it.
7. **Do not `npm publish`** until §6–§7 of `docs/00-project-rules.md` are
   satisfied and a human approves.

Suggested first commands after clone (isolated workspace):

```bash
pnpm install --frozen-lockfile   # or refresh lockfile if deps changed
pnpm run check:next
pnpm run release:build           # then review/commit lib/
pnpm run check
```

## 5. Privacy / security invariants (unchanged)

- No keys, tokens, cookies, device codes, prompts, responses, cwd, credential
  paths, or raw provider bodies in Git, logs, SQLite, or browser APIs.
- Loopback peer + Host, same-origin/request-context, plugin header, JSON-only
  writes, size limits stay on.
- Gateway must remain opt-in and loopback-bound.
- GET `/api/usage-stats/v1/providers` snapshots must stay metadata-only.
- Examples use `example.com`, `provider-a`, `YOUR_API_KEY`, `${DSH_HOME}`.

## 6. Product decisions already made

- New public name is `dsh-hub-oauth-gateway` (usage + future OAuth + gateway).
- Merge target for the coding-plan OAuth project is **this** repo, not a
  rename of the old origin.
- Keep existing Git history.
- Package rename is a breaking major-surface change; version stayed `1.1.0`
  for the rename cut. The OAuth merge is still under `## Unreleased`.
- Phantom bins were rejected until a real CLI existed; they are restored here
  together with `src/cli/coding-oauth.ts`.

## 7. Intentionally out of scope for this snapshot

- Cutting a `1.2.0` / `2.0.0` release
- Replacing the installed `dsh-coding-subscription-oauth` profile entry
- npm publish
- Rewriting CI to Docker `verify`
- Full adversarial test suite for the gateway

---

## 中文摘要

仓库已公开为 `lninghaha/dsh-hub-oauth-gateway`。`5f4a24c` 是上一道绿门禁
（Node 22.19.0，`lib/` 已按新包名重建）。

**当前提交是 OAuth / CLI / 可选网关 / 统一供应商目录的未完成快照**，不能当
发布版：

- `pnpm-lock.yaml` 还没锁上 `@earendil-works/pi-ai` 等新依赖，CI 的
  `--frozen-lockfile` 会红。
- 已提交的 `lib/` 仍是纯用量中心产物，缺 `lib/bin.js`、`lib/invariant.js`。
- 云/隔离工作区内可直接跑 `pnpm` 门禁；Docker 仅作可选对照。
- 不要 npm publish，除非完整门禁 + 人工批准。

继续开发时优先：锁文件 → `pnpm run check:next` → 重建并审阅 `lib/` →
`pnpm run check` → 再考虑安装到 DSH Web profile。

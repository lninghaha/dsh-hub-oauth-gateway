# Development handoff

> Snapshot of in-progress work on `dsh-hub-oauth-gateway` for continuing
> development after a machine or session migration. This file is **not** a
> release artifact and is not in `package.json#files`.
>
> 中文摘要见文末。

Status of this tree: **WIP — old-package identity purged; capability alignment next.
Workspace `pnpm run check` is the day-to-day gate.**

## 1. Repository identity

| Item | Value |
| --- | --- |
| Package | `dsh-hub-oauth-gateway` |
| Version on disk | `1.1.0` (Unreleased OAuth/gateway work is **not** cut) |
| Public remote | `https://github.com/lninghaha/dsh-hub-oauth-gateway` |
| Source OAuth package | `dsh-coding-subscription-oauth` @ `5af9ad6de61e2c2d5cab8b1ad4f2361544d5ec9e` |
| License (declared) | `MIT AND Apache-2.0` |
| Cordis plugin id | `usage-stats` (unchanged) |
| HTTP usage API | `/api/usage-stats/v1/*` (unchanged) |
| Plugin request header | `x-dsh-hub-oauth-gateway: 1` |
| Coding OAuth HTTP namespace | `/plugins/dsh-grok-build/*` (preserved) |

## 2. What this continuation adds

Relative to the previous WIP snapshot (`7f5a189`):

1. **Bug fixes aligned with the OAuth source package**
   - Restored `redactProxyUrl` and fixed double-escaped `safeMessage` regexes in
     `src/server/coding-oauth/redact.ts`.
   - Restored `codingOAuthProxyUnreachableHint` in `src/server/coding-oauth/proxy.ts`.
2. **Coding OAuth Settings UI**
   - Ported `GrokBuildSettings` + bilingual locales into
     `src/client/coding-oauth/`.
   - Registered a separate `settings.section` id `grok-build` (order 17) from
     `src/client/index.tsx`, keeping the usage-center Settings section intact.
3. **Focused regression tests** under `tests/v1/server/coding-oauth/`
   (redact, proxy, oauth-providers, kimi-errors, web-origin, http-json,
   codex-model-capabilities). Still incomplete vs the source suite.
4. **Docker sandbox reconciled** with `docs/00-project-rules.md` targets:
   `lockfile`, `check-next`, `check`, `inspect`, `artifacts`, `package`,
   `isolated-install`, `verify`. Dependency installs use `--frozen-lockfile`
   again; `pnpm-workspace.yaml` `allowBuilds` covers `@google/genai` /
   `protobufjs` (denied) and `esbuild` (allowed).

5. **Old-package identity purged**
   - Runtime names now use `dsh-hub-oauth-gateway` / nested `coding-oauth`.
   - `apply()` passes the real Cordis context (no object spread) and fails
     closed when `codingOAuth.enabled` cannot compose.
   - `retryPolicy` is validated; README no longer calls OAuth unpublished.
   - HTTP `/plugins/dsh-grok-build/*`, CLI names, and credential filenames stay
     as Grok Build product contracts.

## 3. Remaining blockers before release

1. Rebuild and commit `lib/` from `src/` (`pnpm run release:build`). Must include
   `lib/bin.js` and `lib/invariant.js`.
2. `pnpm run check` on the declared Node range must be green.
3. Broader coding-oauth tests (gateway, auth-routes, media-store, CLI) still
   outstanding; keep mocks only — no live providers or real `${DSH_HOME}`
   credentials.
4. Do not `npm publish` until §6–§7 of `docs/00-project-rules.md` are
   satisfied and a human approves.
5. Agents must not restart DSH Web. After a successful install, the operator
   runs `dsh-web restart` themselves.

Suggested workspace commands:

```bash
pnpm install --frozen-lockfile
pnpm run check:next
pnpm run release:build
pnpm run check
```

## 4. Privacy / security invariants (unchanged)

- No keys, tokens, cookies, device codes, prompts, responses, cwd, credential
  paths, or raw provider bodies in Git, logs, SQLite, or browser APIs.
- Loopback peer + Host, same-origin/request-context, plugin header, JSON-only
  writes, size limits stay on.
- Gateway must remain opt-in and loopback-bound.
- GET `/api/usage-stats/v1/providers` snapshots must stay metadata-only.
- Examples use `example.com`, `provider-a`, `YOUR_API_KEY`, `${DSH_HOME}`.

---

## 中文摘要

相对上一份 WIP 快照：已清除旧 npm 包名运行时身份；`apply()` 传入完整
Context 并在 OAuth 启用失败时 fail-closed；README 不再写「尚未发布」。

**仍未发布**：工作区内重建并提交 `lib/`，跑通 `pnpm run check`，再考虑安装到
DSH Web profile。不要 npm publish，也不要由 Agent 重启 `dsh-web`。

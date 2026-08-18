# Changelog

All notable changes to `dsh-hub-oauth-gateway` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Release and publication rules are
defined in [`docs/00-project-rules.md`](docs/00-project-rules.md).

## Unreleased

### Added

- Display preference `entryMode` (`floating` default, or `sidebar`): floating
  draggable HUD with today’s metric plus multi-account quota chips, or the
  classic sidebar footer button. Settings always keeps Open Peek / Open full
  dashboard. Sidebar mode stacks host footer actions vertically to avoid
  crowding peer plugins.

### Changed

- Narrow maintainer npm handoff to exactly three cloud-terminal commands
  (`cd` → `npm login` → `pnpm run release:publish`). Agents complete gates,
  pack, tag, and the GitHub Release with `.tgz`; they must not paste longer
  nvm/`gh` publish scripts. Added `scripts/release-publish.mjs` /
  `pnpm run release:publish`.

## 1.6.1

### Changed

- Usage Center settings IA: drop the standalone Credentials tab; API key / Copilot
  device auth live under Providers, custom pricing under Fees, and CLI pull sits
  inside each Subscriptions card next to sign-in. Display rows are denser, account
  visibility uses official toggles, Peek keeps up to eight prioritized quota cards,
  and the Providers tab explains the next action per connection state.
- Release process: a release is incomplete until the same SemVer is published
  to public npm; agents must hand cloud-terminal `npm publish` commands (nvm
  Node + OTP) to the maintainer instead of publishing themselves, and must
  update related docs in the release change set (`AGENTS.md`,
  `docs/00-project-rules.md`, `CONTRIBUTING.md`). GitHub Releases must attach
  `dsh-hub-oauth-gateway-<version>.tgz`.

## 1.6.0

### Added

- Integrate coding-subscription OAuth (Grok Build, Codex, Kimi Code, Claude Code),
  CLI Pull, optional Codex/Imagine capabilities, and the opt-in local API gateway
  into this plugin. Compatibility routes, credential files, and CLI names are
  preserved.
- Settings → Usage Center gains 订阅账号 / 网关 / 能力 (Subscriptions / Gateway /
  Capabilities) tabs: per-provider OAuth sign-in cards (device code, browser
  PKCE, pasted redirect), model selection, the allowlisted CLI credential pull
  wizard, gateway enable/port/Bearer-key lifecycle, and the seven default-off
  capability switches with revision-checked writes.
- Token-monitor-style local monitoring, both default off: `localMonitor.enabled`
  serves a read-only local CLI authentication snapshot (sign-in state, token
  expiry, refresh presence) plus this plugin's own OAuth sessions;
  `localUsage.enabled` incrementally scans Claude Code / Codex CLI / Kimi Code /
  OpenCode local logs into SQLite daily aggregates (schema v4), extracted with
  hardened reads and byte budgets. New endpoints: `GET /local/auth`,
  `GET /local/usage`, `POST /local/usage/scan`. The dashboard gains a
  本机 / Local tab.
- Add a unified provider catalog at `GET /api/usage-stats/v1/providers` and a
  Settings provider-management view with independent connection, auth, model, and
  quota states.

### Changed

- The settings and dashboard visual layer now consumes the official DSH theme
  alias tokens (`--dsw-alias-*`) and the platform settings row geometry (flat
  16px rows, 36px capsule controls), following the host light/dark theme
  instead of a private dark-only palette.
- Fix pre-existing biome violations in the merged coding-oauth module so the
  full `check:next` gate passes on the integrated tree.

## 1.5.1

### Changed

- Verification policy: Docker sandbox is no longer required. Agents and
  contributors verify in the Cursor Cloud environment with `pnpm` gates and an
  isolated DeepSeek Harness (`DSH_HOME`) install for plugin smoke tests.
  Documented in `AGENTS.md`, `docs/00-project-rules.md`, and `CONTRIBUTING.md`.
- Pin cloud/dev Node via `.nvmrc` / `.cursor/environment.json` and
  `pnpm run assert:node` so Cursor’s `/exec-daemon/node` 22.14 no longer drives
  `Unsupported engine` warnings during builds.
- Public install docs prefer the npm package name
  (`dsh plugin add dsh-hub-oauth-gateway` /
  `npx dsh-hub-oauth-gateway-install`); GitHub refs and local paths remain for
  unreleased or development smoke installs.

## 1.5.0

### Changed

- Full dashboard and Settings → Usage Center use top tabs (one panel at a time),
  following the coding-subscription OAuth settings pattern, so modules and
  settings no longer stack as a long waterfall.
- Quick Peek and the full dashboard use content height with `max-height` instead
  of fixed 760px / 900px frames; Peek account cards keep a compact scroll cap.

## 1.4.0

### Added

#### Wave 2 — account coverage

- `volcengine-coding-plan` adapter via signed OpenAPI `GetCodingPlanUsage`
  (no chat-completion probe).
- `zai-team-plan` adapter (`open.bigmodel.cn` quota `type=2`) isolated from
  personal `zai-token-plan`.
- lastGood hardening: consecutive transient failures keep stale last-good data
  until a configurable limit, then clear; Account UI shows last-good time.
- Multi-profile monitors (`accounts.monitors.*.profiles[]`) with snapshot key
  `(providerId, profileId)` (schema v3) and fee `profileId` attachment.

#### Wave 3 — ops / optional

- Adaptive account refresh (`refresh.accountMode: fixed | adaptive`, default
  `fixed`); ordinary GET still does not credential-refresh.
- Breakdown table expands input/output/cacheRead/cacheWrite columns (local data
  only).
- Opt-in local-directory auto export (absolute path; refused in CI/sandbox;
  never writes credentials/sessions).
- Opt-in `antigravity-quota` (external credential + usage URL only) and
  `ollama-cloud` (requires `allowCookieSession: true`, host pinned to
  `ollama.com`).

## 1.2.0

### Added

- Activity heatmap and streak over a rolling 370-day window in the configured
  time zone (`GET /api/usage-stats/v1/activity`), independent of the dashboard
  range filter.
- Dashboard module composition: preference-backed order/hidden list, preset
  templates, and a Settings reset that clears customization.
- Local subscription/top-up fee ledger (`account_fees`, schema v2) with
  `GET`/`PUT /api/usage-stats/v1/fees`, Settings editing, and payback tooltips on
  account cards when currency and monthly cost coverage match.
- Export layouts: `layout=filtered` (default), `daily` CSV (date × provider), and
  `bundle` JSON; fee rows remain excluded from exports.

### Changed

- User preferences keep `version: 1` while defaulting new Wave 1 fields
  (`modules`, `modulesCustomized`, `streakMinTokens`) for older saved payloads.

## 1.1.0

### Added

- Add public project governance, contribution, conduct, and release-inspection
  rules adapted to this repository's local-first security and committed-build
  model.
- Add a Docker-only sandbox pipeline for dependency installation, lint,
  type-checking, tests, release builds, artifact/lockfile export, reproducibility
  checks, and npm package inspection; project code runs without network or host
  bind mounts, and CI uses the same sandbox.

### Changed

- **Breaking:** rename the package and repository from `dsh-usage-stats`
  (`Ychris12138/dsh-usage-stats`) to `dsh-hub-oauth-gateway`
  (`lninghaha/dsh-hub-oauth-gateway`) ahead of the planned coding-plan OAuth
  and API gateway work. The plugin/bundle identity and install/update contract
  change with the name: `dsh plugin update dsh-usage-stats` no longer resolves,
  and the old npm/GitHub package name will not receive updates. Existing
  installations must remove the old entry and install the new package name.
  Local data files (`usage-stats-v1.sqlite`, legacy JSON caches), the internal
  `usage-stats` Cordis entry id, and the `/api/usage-stats/*` wire paths are
  unchanged, so historical statistics are picked up in place.

### Fixed

- Accept direct loopback and same-origin HTTPS reverse-proxy browser requests
  without confusing the browser-facing origin with the proxy's rewritten backend
  Host. Forwarded mode requires loopback transport, canonical single-value
  `X-Forwarded-Host`/`X-Forwarded-Proto`, the plugin marker, and an exact client
  target authority; every presented Origin/Referer must match either the backend
  or forwarded origin, while hostile preflight remains blocked without CORS.
- Preserve structured API failure codes so the bilingual client can show
  actionable local browser-context recovery guidance instead of exposing a
  misleading raw guard message.
- Add bounded browser-guard rejection classifications to local warning logs and
  failure details without recording raw headers, URLs, cookies, or authorization
  data.
- Prioritize accounts with real balance or quota windows in Quick Peek instead
  of letting unconfigured compatibility cards consume the four compact slots.
- Query MiniMax Token Plan quota on the provider `api.*` host instead of the
  browser-facing `www.*` host, then fall back to the legacy first-party path only
  after an explicit zero-status response with no usable quota fields. Accept
  non-video model labels and current reset-time fields while keeping HTTP,
  provider-level, and malformed responses fail-closed without a second request.

## 1.0.0

### Added

- Rebuild the plugin in TypeScript around a versioned local SQLite store for
  session usage facts, account snapshots, preferences, pricing, and sanitized
  migration state.
- Add Quick Peek and Full Dashboard views with time ranges, provider/model
  breakdowns, calendar-correct trends, bounded forecasts, alerts, and CSV/JSON
  export.
- Add user-owned price rules with separate input, output, cache-read, and
  cache-write prices plus explicit estimate coverage.
- Add normalized balance and subscription monitoring through 21 built-in
  adapters and a constrained declarative JSON monitor.
- Add server-side credential metadata/write/import endpoints and an optional
  GitHub Copilot device flow without a bundled third-party OAuth client ID.
- Add bilingual Simplified Chinese/English UI and configurable presentation,
  provider visibility, aliases, colors, density, privacy, and alert settings.
- Add Vitest coverage for storage, migration, time zones/DST, projection,
  pricing, forecasts, account transport, API guards, credentials, export,
  bundles, installer behavior, and React components.

### Changed

- Make GET endpoints local-snapshot reads; projection and credential-bearing
  account refresh happen at startup, on schedule, or through explicit
  mutations.
- Produce standalone server and classic-script client bundles, publish TypeScript
  declarations, and commit deterministic `lib/` artifacts for Git-host
  installation.
- Use pnpm with a committed lockfile and support Node.js `^22.19.0 || >=24.0.0`.
- Move monitor configuration under `accounts.monitors` while preserving the
  legacy root `monitors` compatibility transform.
- Make fallback installation stage, verify, and atomically replace a complete
  package; it refuses a duplicate manual mount when DSH bundles already manage
  the plugin.

### Removed

- Remove the undocumented v0.3 JavaScript subpath exports and stale split
  runtime files. The stable integration surface is the root Cordis plugin,
  `./client`, and the versioned HTTP API.

### Security

- Enforce loopback peer and Host checks, same-origin/request-context guards,
  a plugin request header, JSON-only mutations, and request/body limits.
- Centralize outbound HTTPS/origin/DNS/private-address/redirect/timeout/size
  validation and pin the validated DNS result into the connection.
- Keep credential values, prompts, responses, working directories, local
  credential paths, and raw provider responses out of SQLite and browser APIs.
- Add restrictive storage permissions, session anonymization, export redaction,
  and spreadsheet-formula escaping.

## 0.3.0

### Added

- Add credential management and nine additional provider adapters.

## 0.2.0

### Added

- Add multi-provider account monitoring alongside token-usage analytics.

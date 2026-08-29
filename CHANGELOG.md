# Changelog

All notable changes to `dsh-hub-oauth-gateway` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Release and publication rules are
defined in [`docs/00-project-rules.md`](docs/00-project-rules.md).

## Unreleased

## 1.11.1

- Pin the Hub, vendored core, and shared proxy runtime to `undici@7.29.0` and `dsh-coding-oauth-core@0.1.1` so co-installed participants do not split dispatcher majors.

### Documentation

- Align README / install / configuration docs with Hub `1.11.0` operator surfaces: AuthDocument v2 multi-account and `codingOAuth.pool`, Copilot credential filenames, Claude import preview→commit wording, Codex Fast session-picker note, and Desktop Market Path A `catalog/` pointer (not in the npm `files` whitelist).


## 1.11.0

### Added

- AuthDocument v2 multi-account credential store (up to 8 accounts per provider file). Locked v1→v2 migration persists when a mutating or listing path loads the document under lock.
- Settings multi-account API and AccountsTab controls to add, set default, and remove OAuth accounts.
- Optional `codingOAuth.pool` mode (`off` | `priority` | `quota_aware`) for sticky multi-account routing when two or more AuthDocument v2 accounts exist. Quota windows fall back to the provider’s Usage Center OAuth row when per-account snapshots are unavailable.
- GitHub Copilot LLM route `github-copilot-oauth`, gated on `oauthDevice.copilotClientId` (fail closed when unset).
- Claude Code one-click import: discover macOS Keychain `Claude Code-credentials` on darwin (file fallback), with an Accounts “Import Claude Code” control that runs preview→commit (`accountMode: add` when possible) and still requires explicit overwrite confirm.
- OAuth signed-in cards show Usage Center cached quota bars (GET-only; hidden when no snapshot).
- Codex Fast Speed UX: Standard/Fast hint under the existing `codexFast` capability, documenting that the session picker uses `codex-oauth-fast`.
- Desktop Market Path A catalog at `catalog/catalog-source.json` and `catalog/v1/plugins.json` for `dsh-hub-oauth-gateway@1.11.0`.

### Fixed

- CLI Pull destination inspect understands AuthDocument v2 so conflict classification is not stuck on `unreadable` after migration.
- `quota_aware` pool scoring maps AuthDocument account ids through the provider’s Usage Center OAuth quota row when `profileId` / direct id lookups miss.

### Changed

- Coding-subscription OAuth credential files and Accounts UI now treat multi-account as the default shape; single-account v1 documents upgrade in place under lock without operator migration steps.


## 1.10.0

### Fixed

- Keep capability settings routes active when the optional settings service is absent or reloads, using the same Web route lifetime as OAuth, Gateway, and credential import.
- Inject pi-ai request authentication through the existing owner-locked OAuth stores, reject unknown provider writes, and apply the DSH `0.1.1-rc.2` image request limits.
- Preserve opaque replay envelopes while restoring native provider identity for Codex Fast, remap xAI capacity responses to retryable rate limits, and use five retries with 5–80 second exponential delays.

### Changed

- Verify the exact DeepSeek Harness `0.1.1-rc.2` BOM, pair co-installation with `dsh-coding-subscription-oauth@0.6.2`, and update `undici` to `^7.24.8`.

## 1.9.1

### Fixed

- Resolve optional DSH host services lazily so Cordis contexts with strict injection guards degrade safely instead of failing the complete plugin tree during startup.

## 1.9.0

### Added

- Add exact DSH BOM/client platform gates, host/client compatibility adapters, owner-request diagnostics, and shared `dsh-coding-oauth-core` runtime ownership for safe Hub/Subscription co-installation.

### Changed

- Add first-use guidance, stale-data semantics, pricing replacement previews/undo, resilient fee drafts, narrow-screen tabs, and accessible operation-local feedback.
- Keep OAuth/Web ownership active without optional LLM services, while waiting for required Web routes to mount before the Hub is elected active.

### Fixed

- Prevent stale pricing/fee save responses from marking newer drafts as saved, reset repeated OAuth Pull commits, and report the authorization-derived access mode in compatibility diagnostics.

## 1.8.0

### Fixed

- Providers tab now reflects Subscriptions (coding OAuth) state instead of
  drifting apart: quota accounts (`grok`, `codex`, `claude`, `kimi-coding`,
  `antigravity`) merge into their OAuth/route cards, eliminating duplicate
  cards that stayed on "Auth: None" after signing in or pulling CLI
  credentials.
- Signed-out OAuth providers keep `authSource: "oauth"` (previously `none`),
  so the "Open Subscriptions to sign in / pull" action and the correct
  next-step hint stay visible exactly when they are needed.
- The dashboard-visibility toggle on provider cards now writes the linked
  account provider id (and clears stale route ids), keeping it aligned with
  the account grid and Peek filters.

### Added

- Systematic credential maintenance on each provider card: the required
  credential reference with configured state, inline API-key save/clear,
  GitHub Copilot device authorization, and a per-provider "Refresh now"
  action. Provider records expose secret-free credential metadata
  (`credentials`) and the linked `accountProviderId`.

## 1.7.4

### Documentation

- Refresh README product screenshots (`docs/images/usage-center-*.png`) for the
  1.7.3 Usage Center surfaces (compact Peek KPIs, floating HUD, full dashboard,
  and Settings → Usage Center).

## 1.7.3

### Added

- Peek quota strip: top three tightest quota windows with reset rings and
  dual-track usage bars in the account grid.
- Usage chart hover tooltip with per-series values and share percentages.
- Activity heatmap month/weekday rulers and click-to-drill day detail.
- Gateway tab multi-client snippets (cURL, Python, Node.js, Cursor) with copy.
- Dashboard skeleton loading state and pricing editor preset buttons.
- Floating HUD edge snap and idle collapse.

### Changed

- Peek mode uses a compact 2×2 KPI layout instead of the full account grid;
  empty states link to Settings → Usage Center via session storage handoff.
- Settings section listens for cross-surface tab open events from the overlay
  and local monitor empty states.

## 1.7.2

### Changed

- Usage Center UI polish: unify capsule `dus-button` controls, raise secondary
  type to a readable floor, responsive fee editors with column headers, export
  actions collapsed into one menu, Peek alert limiting and empty-account guide
  copy, and split Fees / Pricing settings editors.
- Localize alert levels and cost titles, toolbar screen-reader labels, pricing
  aria-labels, chart empty state, and breakdown coverage tooltips.
- Tighten dashboard query gating by active tab, pause refetch while the
  document is hidden, resolve uPlot colors from theme tokens, and add client
  bundle gzip size gates plus UI contract tests.
- Refresh README product screenshots (`docs/images/usage-center-*.png`) for the
  polished HUD / Peek / dashboard / Settings surfaces.

### Documentation

- Align public docs with the coding-subscription OAuth README conventions:
  English-first `README.md`, nine community-language READMEs with a shared
  language switcher, extracted `docs/01-install.md`, and numbered docs
  (`docs/02-architecture.md` + zh-CN, `docs/03-configuration.md`,
  `docs/04-migration-v1.md`). Update the publish allowlist and release inspect
  checks accordingly.
- Reorganize the repository root: keep README locales at root; move install
  notes to `docs/01-install.md`, contributor/security/conduct docs to
  `.github/`, and TypeScript project configs into `tsconfig/`.
- Add product screenshots (`docs/images/usage-center-*.png`) for the floating
  HUD, Quick Peek, full dashboard, and Settings → Usage Center, embedded in
  all README locales.

## 1.7.1

### Fixed

- Codex (`codex-wham`) quota probe now sends `chatgpt-account-id` and parses
  `used_percent` windows (aligned with the existing Codex usage reader). Missing
  account id / auth / empty responses surface secret-free diagnostic codes on
  account snapshots and Providers instead of silent `--`.
- Grok subscription falls back from CLI billing to `grok.com` credits REST when
  billing returns no windows; Claude / Kimi adapters emit the same diagnostic
  codes. Kimi Code OAuth sessions bridge into `KIMI_API_KEY` for
  `kimi-token-plan` so Providers no longer mark Kimi OAuth as not-supported.

## 1.7.0

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
- Bridge coding-oauth sessions into quota monitors: signed-in Grok Build /
  Codex / Claude Code tokens satisfy `GROK_ACCESS_TOKEN` /
  `CODEX_ACCESS_TOKEN` / `CLAUDE_OAUTH_TOKEN` when Harness refs are empty, and
  login / CLI pull / startup refresh populate AccountService snapshots so Peek
  and Providers show real quota windows instead of 未关联 / UNSUPPORTED.
- Usage Peek KPIs use a compact single-row layout; account status chips are
  localized; compact Peek hides empty unsupported / not-configured filler rows.

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

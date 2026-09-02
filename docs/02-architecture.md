# Architecture

> [**中文版**](02-architecture.zh-CN.md) · English

This document describes the internal architecture of `dsh-hub-oauth-gateway`. It is the source for the technical notes in `README.md` and is intended for contributors and maintainers.

## Goals

1. Remain a normal DeepSeek Harness Web bundle instead of replacing the Web shell.
2. Keep usage history and account snapshots local by default.
3. Separate passive usage projection from credential-bearing account refreshes.
4. Make partial failures visible without turning one corrupt session or provider into a global outage.
5. Treat pricing as user-owned, versioned estimation data rather than a hard-coded billing truth.
6. Publish deterministic, dependency-independent runtime artifacts.

## Runtime shape

```text
DSH session inventory ──> usage projector ──> SQLite facts/cursors ──> query service
                                               │                         │
DSH provider settings ──> account specs ──> adapters ──> snapshots       ├─ v1 API
                                               │                         └─ legacy API views
DSH credentials seam ──────────────────────────┘

DSH Web slots ──> classic client bundle ──> TanStack Query ──> Quick Peek / Dashboard / Settings
```

The server exports the Cordis contract `name`, `inject`, `Config`, and `apply`. The client registers only declared DSH slots:

- `sidebar.footer.action`
- `shell.overlay`
- `settings.section`

It never registers a `root` application or starts a second web server.

## Usage projection

The session inventory exposes persisted and live snapshots. Projection folds only usage-bearing events and writes one fact per:

```text
(session_id, turn, step)
```

A later observation of the same logical step replaces the prior fact. This is essential because streaming and persisted snapshots can expose the same turn repeatedly. Each session cursor records source kind, revision, next event sequence, current provider/model, last-seen time, and deletion state.

Projection properties:

- session failures are isolated;
- duplicate inventory IDs are rejected and counted as partial failures;
- deleted-session facts are preserved by default;
- startup projection precedes legacy usage migration, preventing double imports;
- every successful projection synchronization retries unfinished legacy usage migration;
- GET requests never trigger projection; startup, scheduler, and explicit refresh POST do.

## SQLite storage

The database lives at `${DSH_HOME}/storages/usage-stats-v1.sqlite` and uses WAL, foreign keys, a busy timeout, prepared statements, and transactions.

Logical tables cover:

- schema migrations;
- session cursors;
- usage facts;
- account snapshots;
- price rules;
- user preferences;
- legacy migration state.

Existing files are classified and checked for this application's id/schema before any `chmod`, WAL, or other mutable PRAGMA. Unrecognized, foreign, or newer databases are left untouched. After a file is recognized as ours, the storage layer repairs the parent directory to mode `0700` and the main database file to `0600`. Retention is enforced at startup and during scheduled usage synchronization.

The database deliberately excludes credential values, prompts, responses, working directories, local credential-file paths, and raw provider payloads.

## Account subsystem

Provider descriptors come from DSH settings and a compatibility catalog. `resolveAccountSpecs()` combines each descriptor with the validated monitor config and selects one of 21 adapters.

Antigravity quota stays an **opt-in Hub read-only** probe (`antigravity-quota`); Google OAuth remains with `dsh-agy`. See [`docs/research/adr-antigravity-quota-probe.md`](https://github.com/lninghaha/dsh-hub-oauth-gateway/blob/main/docs/research/adr-antigravity-quota-probe.md).

Every adapter returns the same normalized snapshot:

- provider/display/adapter identifiers;
- `balance` or `subscription` mode;
- configured and status state;
- optional plan and balance;
- zero or more quota windows;
- missing credential references;
- freshness and warning metadata.

The service provides single-flight refresh, bounded concurrency, memory caching, persisted snapshots, and stale-on-transient-error behavior.

### Outbound network boundary

All adapter requests pass through the central transport:

1. validate protocol and reject embedded URL credentials;
2. enforce the provider's original origin unless cross-origin access is explicitly allowed;
3. resolve all addresses and reject private/reserved targets by default;
4. pin the validated DNS answer into the actual HTTP(S) connection;
5. disable automatic redirects;
6. enforce timeout, media type, status, and response-size limits.

Injected test transports pass through the same target policy. This prevents a monitor override from sending a provider bearer token to an arbitrary public origin.

## Pricing and cost estimation

A price rule is selected by currency, effective time, provider pattern, model pattern, source priority, pattern specificity, and update time. Patterns support literal text plus `*`; they are not regular expressions.

Each Token category is priced separately. Missing categories remain uncovered, and the API returns a coverage ratio. Cost values are always marked estimated. There is no bundled volatile price catalog in 1.0.

## Query and API layer

The versioned API base is `/api/usage-stats/v1` and returns a shared envelope:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "schemaVersion": 1,
    "generatedAt": 0,
    "sourceUpdatedAt": 0,
    "partial": false,
    "stale": false,
    "warnings": []
  }
}
```

Read endpoints query local SQLite/account snapshots only. `/refresh` is the sole general refresh mutation. Compatibility endpoints render v0.3 shapes from the same v1 repositories and likewise do not refresh on GET.

The browser never reads SQLite, credentials, or provider endpoints directly. It calls the API under the current DSH Web origin, and the plugin server returns local projections. Direct access remains loopback-only. For a trusted HTTPS reverse proxy, `X-Forwarded-*` is ignored for authorization: the actual peer must be listed in `codingOAuth.ownerRequest.trustedProxy.peers`, and the request must carry an exact HTTPS `Origin` and matching public `Host`, owner proof, and same-origin Fetch Metadata; mutations additionally require the independent CSRF proof. An incomplete proxy policy fails closed, and the proxy must preserve the public `Host` when forwarding to DSH.

Calendar ranges and buckets use the configured IANA timezone, including DST transitions. Forecasts use bounded linear extrapolation and are returned as a distinct series.

Session grouping is disabled unless the privacy preference explicitly enables identifiers. When disabled, both breakdown keys and labels are anonymized.

## Coding-subscription OAuth subsystem

The `src/server/coding-oauth/` tree integrates the `dsh-coding-subscription-oauth` package (Apache-2.0 attribution preserved; see `docs/oauth-provenance.md`). It registers the LLM routes `grok-build`, `codex-oauth`, `kimi-code-oauth`, and `claude-code-oauth` through `ctx.llm.registerAdapter`, so signed-in subscription accounts appear in the DSH model picker marked `(OAuth)`. Grok Build uses first-party PKCE plus device-code login against `auth.x.ai` and streams from `cli-chat-proxy.grok.com`; Codex/Kimi/Claude reuse the pi-ai provider-native OAuth and refresh protocols. Credentials live in owner-only `0600` files under `${DSH_HOME}` and are never returned by any HTTP status, log, or UI surface.

Both Hub and the standalone bundle pin `dsh-coding-oauth-core@0.1.1` and `undici@7.29.0` on the registry today. Hub also vendors a publish-ready `0.1.2` tree under `vendor/dsh-coding-oauth-core` (local `file:` override) that adds shared helpers (`http-json`, `grok-errors`, `kimi-errors`, `gateway-protocol`) and matching subpath exports. The core owns root-scoped owner election, reference-counted proxy policy, atomic registration helpers, provider/route/credential identifiers, the capability namespace, Gateway state filename, and every legacy/current management path. Hub has owner priority; the standalone participant stays ready to resume after Hub unloads. Those state contracts are browser-safe exports too, so neither client can silently drift from the server paths. Grok Imagine keeps its explicit pinned dispatcher and does not use the shared proxy lease.

The settings UI (Settings → Usage Center → 订阅账号/网关/能力 tabs) talks to the plugin-owned same-origin routes under `/plugins/dsh-grok-build/*`: `oauth/status|login|code|cancel|logout|models` for the login state machines, `oauth/sources(+preview|commit|cancel)` for the two-phase allowlisted CLI credential pull, `gateway(+reveal|rotate)` for the opt-in loopback API gateway (`/v1/chat/completions`, `/v1/responses`, `/v1/messages` on a separate `node:http` listener, default off), and `capabilities` for the seven default-off optional capability switches with revision-based compare-and-swap writes. Every one of these routes requires a trusted owner request; mutations additionally require a JSON body and the Hub CSRF header `x-dsh-hub-oauth-gateway: 1` (trusted HTTPS proxy mutations use the independent owner CSRF proof instead). Gateway key reveal/rotate remain loopback-only.

## Local monitor subsystem

`src/server/local-monitor/` adds the token-monitor-style local surfaces, both opt-in:

- **Authentication snapshot** (`localMonitor.enabled`): reuses the OAuth-import allowlist and hardened reader to report each official CLI's sign-in state, token expiry, and refresh-token presence, alongside this plugin's own stored OAuth sessions. Only secret-free status crosses the API boundary.
- **Vendor status probes** (`statusProbes.enabled`, default off): GET allowlisted public Statuspage JSON only (no credentials). Failures stay per-target and never interrupt Usage projection or account refresh.
- **Cross-tool usage scan** (`localUsage.enabled`): an incremental scanner walks Claude Code, Codex CLI, Kimi Code, and OpenCode log roots with symlink/owner/regular-file checks and per-file/per-run byte budgets. Parsers extract only timestamps, model ids, and token counters. SQLite schema v4 stores per-file daily aggregates keyed by the SHA-256 of the file path, so rotation replaces a file's contribution exactly and no absolute path is ever persisted. Scans run on the scheduler or an explicit `POST /local/usage/scan`; `GET /local/usage` reads aggregates only.

## Client architecture

The source client uses React 18, TanStack Query, Zod validation, and uPlot. The build emits one classic script wrapped in:

```js
window.__ModuleLoader__.load("dsh-hub-oauth-gateway", async function (require, module, exports) {
  // bundled plugin
});
```

DSH platform packages are externalized to `require()` IDs. TanStack Query, Zod, CSS, and uPlot are bundled; uPlot initialization remains lazy.

Presentation state is split between:

- server-backed user preferences;
- ephemeral overlay/filter state;
- cached, schema-validated API queries.

The visual layer consumes the official DSH theme alias tokens (`--dsw-alias-*`) and the platform settings row geometry (flat 16px rows, 36px capsule controls), so the plugin follows the host light/dark theme instead of shipping a private palette. Settings controls use the shared `controls.tsx` row/toggle/select primitives; the coding OAuth tabs share the same language.

Optional account, alert, series, or breakdown failures degrade their own sections rather than blanking the dashboard.

## Build and release

Primary verification is the **Cursor Cloud / repository cloud environment**
with the declared Node.js and pnpm toolchain (see `docs/00-project-rules.md`
§2.3). The repository `Dockerfile` remains optional for CI or contributors who
prefer containers; it is not a delivery gate.

`pnpm run release:build` performs a clean build into `.next/lib`, bundles server
dependencies into a standalone ESM `index.js`, emits the classic client bundle,
atomically replaces `lib/`, and verifies:

- package entrypoints;
- Cordis plugin exports;
- standard-schema config;
- no bare runtime import of bundled dependencies;
- one client module-loader registration;
- no stale v0.3 runtime files;
- compatibility installer behavior.

Release inspection additionally checks the `package.json#files` allowlist and
`npm pack --dry-run` manifest. Committed `lib/` artifacts are the Git-host
installation contract, so the fallback installer does not need to install
transitive runtime dependencies.

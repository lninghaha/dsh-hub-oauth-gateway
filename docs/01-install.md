# Installation and usage · dsh-hub-oauth-gateway

**v1.7.4**. This document expands the Quick start in [`README.md`](../README.md). Prefer the published npm package for end users.

```bash
dsh plugin --profile web add dsh-hub-oauth-gateway
```

## Prerequisites

- DeepSeek Harness Web, verified against `@deepseek-ai/dsh 0.1.0-rc.6`
- Node.js `^22.19.0 || >=24.0.0` (see `.nvmrc`)
- Loopback DSH Web backend; do not expose the plugin API alone or publish unauthenticated to the public internet
- Optional HTTP/HTTPS proxy for coding-subscription domains

## Install options

### npm (recommended)

```bash
dsh plugin --profile web add dsh-hub-oauth-gateway
dsh plugin --profile web update dsh-hub-oauth-gateway
dsh plugin --profile web remove dsh-hub-oauth-gateway
```

### Compatible installer

When the DSH build lacks a plugin manager, the same npm package can be installed with:

```bash
npx --yes dsh-hub-oauth-gateway-install
npx --yes dsh-hub-oauth-gateway-install --check
```

The installer atomically replaces `~/.dsh/profiles/node_modules/dsh-hub-oauth-gateway` and idempotently maintains `profiles/web/cordis.patch.yml`. Package directory and Cordis patch are backed up until final verification; any failure rolls back completely. If `dsh.profile.bundles` already registers this plugin, or the web profile manifest cannot be parsed strictly, it refuses to modify the tree and asks you to use the plugin manager (avoids duplicate Cordis + bundle mounts).

### GitHub Release tarball

Each formal GitHub Release must attach `dsh-hub-oauth-gateway-<version>.tgz` matching the npm artifact (see [`00-project-rules.md`](00-project-rules.md) §8):

```bash
dsh plugin --profile web add /path/to/dsh-hub-oauth-gateway-1.7.4.tgz
```

### Development / Git

```bash
# track GitHub main
dsh plugin --profile web add github:lninghaha/dsh-hub-oauth-gateway

# local checkout smoke (isolated DSH_HOME)
dsh plugin --profile web add "$PWD"
```

## Restart Web

Installers and plugin tooling **do not** restart the operator’s personal DSH Web. Choose a quiet moment:

```bash
dsh-web restart
# equivalent:
systemctl --user restart dsh-web.service
```

Then refresh `http://127.0.0.1:3080`.

## Name change from `dsh-usage-stats`

Remove any old `dsh-usage-stats` Cordis entry before installing `dsh-hub-oauth-gateway`. Cordis id `usage-stats`, SQLite path `${DSH_HOME}/storages/usage-stats-v1.sqlite`, and historical facts remain valid.

## Runtime configuration (summary)

Merge under the existing entry — never a second plugin row:

```yaml
- insert:
    - id: usage-stats
      name: dsh-hub-oauth-gateway
      config:
        refresh:
          usageSeconds: 30
          accountMinutes: 5
          accountConcurrency: 3
          timeoutMs: 15000
        retention:
          usageDays: 730
          accountSnapshotDays: 180
          preserveDeletedSessions: true
        pricing:
          baseCurrency: USD
        accounts:
          monitors: {}
        oauthDevice:
          copilotClientId: YOUR_PUBLIC_OAUTH_CLIENT_ID
        codingOAuth:
          enabled: true
          # proxy: http://127.0.0.1:7890
          # proxyKimi: false
          # gateway: { enabled: false, bind: 127.0.0.1, port: 18080 }
        localMonitor:
          enabled: false
        localUsage:
          enabled: false
          intervalMinutes: 30
```

Full schema: [`03-configuration.md`](03-configuration.md).

### Legacy `config.monitors`

Root-level `config.monitors` maps to `config.accounts.monitors`. Do not set both.

### Pricing import

Settings accepts an array or `{ "rules": [...] }`. Patterns are literal text plus `*`. `null` means unpriced, not free. See README and configuration reference.

## Coding OAuth proxy

Priority: `config.codingOAuth.proxy` → `CODING_OAUTH_PROXY` → `GROK_BUILD_PROXY` → `HTTPS_PROXY` / `HTTP_PROXY`.

Only reviewed subscription domains are proxied. Kimi China traffic stays **direct** unless `proxyKimi: true`.

```yaml
codingOAuth:
  enabled: true
  proxy: http://127.0.0.1:7890
  proxyKimi: false
```

## Local API gateway

Default off. Enabling starts an isolated loopback `node:http` server (separate from the DSH web port):

```yaml
codingOAuth:
  gateway:
    enabled: true
    bind: 127.0.0.1
    port: 18080
```

Or use **Settings → Gateway**. Endpoints: `/healthz`, `/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/messages`. Bearer key lives in an owner-only gateway document (`0600`). Bind is YAML-only; non-loopback bind requires a key. Not a public relay.

## Optional capabilities

Seven flags default off and apply live: `codexSearch`, `codexImages`, `codexImageEdits`, `codexUsage`, `codexFast`, `grokImagineImage`, `grokImagineVideo`. Numeric limits (`searchResults`, `imageCount`, `videoArtifactTtlMs`) are documented in [`03-configuration.md`](03-configuration.md). `codex-oauth-fast` appears only after a fresh live catalog lists a `priority`-eligible model.

## Credentials on disk

Owner-only `0600`, atomic write, cross-process lock where applicable:

```text
$DSH_HOME/.grok-build-auth.json
$DSH_HOME/.codex-oauth-auth.json
$DSH_HOME/.kimi-code-oauth-auth.json
$DSH_HOME/.claude-code-oauth-auth.json
```

Model selection caches: matching `*-models.json` (no tokens). Grok Imagine uses DSH credential reference `XAI_API_KEY` (not Grok OAuth, not process-env fallback).

## Uninstall

```bash
dsh plugin --profile web remove dsh-hub-oauth-gateway
```

Delete OAuth credential/cache files only after you no longer need those sessions. The usage SQLite database is separate; remove it only if you intend to drop local history.

## Cloud / maintainer verification

Use Cursor Cloud or an isolated workspace with the declared Node/pnpm. Docker sandbox is optional.

```bash
pnpm install --frozen-lockfile
pnpm run check:next
pnpm run check
npm pack --dry-run --json --ignore-scripts
```

Isolated DSH smoke:

```bash
export DSH_HOME=/tmp/dsh-verify-$USER
# install @deepseek-ai/dsh, then:
dsh plugin --profile web add "$PWD"
dsh web --host 127.0.0.1 --port 3080
```

Never point smoke tests at a personal production profile or real credentials.

## Troubleshooting

| Symptom | What to try |
|---|---|
| Still searching / installed `dsh-usage-stats` | Remove the old entry; install `dsh-hub-oauth-gateway` from npm |
| Plugin missing after install | Restart `dsh-web` / `dsh-web.service`, then hard-refresh `http://127.0.0.1:3080` |
| Compatible installer refuses | Prefer `dsh plugin …`; installer blocks when bundles already register the plugin or the patch cannot be parsed safely |
| Codex / Claude localhost callback unreachable | Use device code, or paste the full redirect URL into Settings |
| Kimi 401/403 or wrong auth header | Re-login; keep `kimi-code-oauth` (not moonshot.cn API-key OAuth) |
| Proxy works for Grok but breaks Kimi in China | Leave `proxyKimi: false` (default); only enable if you need the proxy |
| Gateway not listening | Confirm `gateway.enabled` / Settings toggle; bind must be loopback unless a key is set |
| Costs look too low | Check price coverage %; `null` categories are unpriced, not free |
| Local monitor / usage empty | Both features default off; enable `localMonitor` / `localUsage` explicitly |

## Compliance

Use only accounts you own or are authorized to operate. The project does not support bulk accounts, quota resale, remote relay, paywall bypass, or client impersonation. Prefer vendor official API-key channels for commercial workloads. Coding subscriptions through a third-party harness may sit in a gray area of vendor terms — you accept quota and account risk.

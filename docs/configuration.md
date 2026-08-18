# Configuration reference

Runtime configuration belongs under the existing Cordis row named `dsh-hub-oauth-gateway`.

```yaml
- insert:
    - id: usage-stats
      name: dsh-hub-oauth-gateway
      config:
        refresh: {}
        retention: {}
        pricing: {}
        accounts:
          monitors: {}
        oauthDevice: {}
        codingOAuth:
          enabled: true
        debug: false
```

The root object is strict: misspelled or unknown fields fail startup instead of being silently ignored.

## `refresh`

| Field | Default | Range | Meaning |
| --- | ---: | ---: | --- |
| `usageSeconds` | `30` | 5–3600 | Background session projection interval |
| `accountMinutes` | `5` | 1–1440 | Background account refresh interval |
| `accountConcurrency` | `3` | 1–12 | Maximum concurrent account adapter operations |
| `timeoutMs` | `15000` | 1000–120000 | Per-upstream-request timeout |

Opening the dashboard does not start a refresh. Ordinary GET endpoints read cached state. The UI refresh button sends an explicit POST and may refresh usage, accounts, or both.

## `retention`

| Field | Default | Range | Meaning |
| --- | ---: | ---: | --- |
| `usageDays` | `730` | 7–3650 | Usage fact retention |
| `accountSnapshotDays` | `180` | 7–3650 | Account snapshot retention |
| `preserveDeletedSessions` | `true` | boolean | Keep historical facts when a DSH session disappears |

Retention is applied at startup and at most once per day during usage synchronization.

## `pricing`

```yaml
pricing:
  baseCurrency: USD
```

`baseCurrency` is normalized to uppercase and limited to 16 characters. Currency conversion is not performed: a rule participates only when its currency exactly matches the selected base currency.

Price rules are managed in Settings. A rule contains:

| Field | Meaning |
| --- | --- |
| `id` | Stable rule identifier, 1–128 characters |
| `providerPattern` | Provider ID pattern; literal text plus `*` |
| `modelPattern` | Model ID pattern; literal text plus `*` |
| `effectiveFrom` | Unix time in milliseconds; `0` means all history |
| `currency` | Currency matching the selected base currency |
| `inputPerMillion` | Input-token price per million, or `null` |
| `outputPerMillion` | Output-token price per million, or `null` |
| `cacheReadPerMillion` | Cache-read price per million, or `null` |
| `cacheWritePerMillion` | Cache-write price per million, or `null` |

Imported JSON may be an array or `{ "rules": [...] }`. The Settings importer fills omitted `id`, `effectiveFrom`, currency, and nullable price fields, then validates the final rules.

## `accounts.monitors`

Monitor keys resolve to real DSH provider IDs. Compatibility-only providers such as `claude`, `codex`, `gemini`, `copilot`, `cursor`, `grok`, and `amp` are also discoverable.

```yaml
accounts:
  monitors:
    relay-a:
      adapter: new-api
      credentialRef: RELAY_A_TOKEN
      warning:
        warnBelow: 5
        criticalBelow: 1
```

Common monitor fields:

| Field | Meaning |
| --- | --- |
| `providerId` | Optional provider ID override; defaults to the map key |
| `adapter` | Required registered adapter ID |
| `mode` | `balance` or `subscription`; required by `declarative` |
| `credentialRef` | Uppercase DSH credential reference |
| `secretKeyRef` | Second credential (e.g. Volcengine SK) |
| `usageBaseURL` | Optional absolute account API base URL |
| `region` | Adapter-specific region selector |
| `profiles` | Optional array of `{ id, label?, credentialRef?, ... }` for multi-account cards |
| `allowCookieSession` | Explicit opt-in for cookie-based adapters (`ollama-cloud`) |
| `fallbackCredentialRef` | Separate fallback credential, used by selected adapters |
| `fallbackUserIdRef` | Separate fallback user-ID reference |
| `warning.warnBelow` | Nonnegative absolute warning threshold |
| `warning.criticalBelow` | Nonnegative critical threshold, not greater than `warnBelow` |
| `allowCrossOrigin` | Permit a URL outside the provider's original origin |
| `allowPrivateNetwork` | Permit private/reserved DNS or IP targets |
| `allowInsecure` | Permit HTTP instead of HTTPS |

Security flags default to `false`. Enabling them is a trust decision, not a connectivity workaround.

### Built-in adapter IDs

```text
deepseek-balance
openrouter-balance
moonshot-balance
zai-balance
dashscope-balance
siliconflow-balance
general
new-api
sub2api
opencode-go
zai-token-plan
zai-team-plan
kimi-token-plan
minimax-token-plan
volcengine-coding-plan
antigravity-quota
ollama-cloud
claude-oauth
codex-wham
gemini-quota
copilot-device
cursor-subscription
grok-subscription
amp-subscription
declarative
```

Compatibility-only provider ids also include `volcengine`, `zai-team`,
`antigravity`, and `ollama-cloud`.

Multi-profile example (OpenRouter):

```yaml
accounts:
  monitors:
    openrouter:
      adapter: openrouter-balance
      profiles:
        - id: personal
          credentialRef: OPENROUTER_MGMT_PERSONAL
        - id: work
          credentialRef: OPENROUTER_MGMT_WORK
```

Volcengine Coding Plan (AK/SK refs; no chat probe):

```yaml
accounts:
  monitors:
    volcengine:
      adapter: volcengine-coding-plan
      credentialRef: VOLCENGINE_ACCESS_KEY
      secretKeyRef: VOLCENGINE_SECRET_KEY
      region: cn-beijing
```

### Refresh modes

| Field | Meaning |
| --- | --- |
| `refresh.accountMode` | `fixed` (default) or `adaptive` |
| `refresh.accountAdaptiveMinMinutes` | Adaptive floor (default 2) |
| `refresh.accountAdaptiveMaxMinutes` | Adaptive ceiling (default 30) |

Adaptive mode shortens the background account interval when quota windows are
hot. Page open / ordinary GET still never triggers credentialed refresh.

### Auto export (local only)

User preferences may enable writing export files to an **absolute** local
directory (`privacy.autoExport*`). The writer refuses CI/Docker sandbox homes,
never includes credentials or sessions, and is skipped when disabled.
Providers with a known ID or hostname receive a default adapter. An unknown provider without an explicit monitor remains visible as unsupported; token history still works.

For `minimax-token-plan`, `credentialRef` must resolve to the operator's Token Plan subscription key. MiniMax documents this key as separate from a regular pay-as-you-go API key; the two are not interchangeable. The current quota path is `/v1/token_plan/remains` on the configured `api.minimax.io` or `api.minimaxi.com` origin. [MiniMax Token Plan FAQ](https://platform.minimaxi.com/docs/token-plan/faq)

### Cross-origin override

A provider descriptor might use `https://provider.example/v1`. This override is rejected by default:

```yaml
accounts:
  monitors:
    relay-a:
      adapter: new-api
      usageBaseURL: https://another-origin.example
```

If `another-origin.example` is intentionally trusted to receive the configured provider credential, make that decision explicit:

```yaml
      allowCrossOrigin: true
```

The transport still enforces HTTPS, DNS/public-address policy, DNS pinning, manual redirects, timeout, and response-size limits.

### Declarative monitor

Declarative monitors perform only a constrained GET and extract fields with RFC 6901 JSON Pointers. They cannot execute JavaScript or override sensitive headers directly.

```yaml
accounts:
  monitors:
    custom-provider:
      adapter: declarative
      mode: balance
      credentialRef: CUSTOM_PROVIDER_KEY
      request:
        path: /v1/account/balance
        auth:
          type: bearer
          credentialRef: CUSTOM_PROVIDER_KEY
        headers:
          Accept-Language: en
      extract:
        root: /data
        remaining: /available
        used: /used
        total: /limit
        currency: /currency
        plan: /plan
```

`request.path` must be relative and start with `/`. Supported auth types are `bearer`, `raw`, and `x-api-key`. `Authorization`, `X-API-Key`, `API-Key`, cookies, and similar sensitive headers must come from `auth.credentialRef`, never from literal `headers`.

A subscription monitor uses `extract.items` to locate an array and may map `kind`, `usedPercent`, `remainingPercent`, and `resetsAt` inside each item.

## Credentials

Credential values are managed through DSH, not in Cordis config. A reference must match:

```text
^[A-Z_][A-Z0-9_]*$
```

The credential API permits only references currently used by resolved account specs plus the fixed references supported by local CLI import/device flow. This prevents the plugin UI from becoming a generic read/write interface to unrelated shared credentials.

## `oauthDevice`

```yaml
oauthDevice:
  copilotClientId: YOUR_PUBLIC_OAUTH_CLIENT_ID
```

The client ID is public OAuth application metadata, not a client secret. Use an OAuth app you control or explicitly trust and enable GitHub Device Flow for that app. The project deliberately does not bundle an unverified third-party client ID.

During authorization, the upstream device code stays in an expiring, bounded server-memory map. The browser receives a random flow ID, user code, verification URL, interval, and expiry. Successful access tokens go directly to the DSH credential seam.

## `codingOAuth`

Integrated coding-subscription OAuth owner. Keep this enabled after cutover so Grok Build, Codex, Kimi Code, and Claude Code routes, settings, and credential files stay in this plugin. Disable only in isolated tests.

| Field | Default | Meaning |
| --- | ---: | --- |
| `enabled` | `true` | Register OAuth LLM routes, compatibility HTTP paths, CLI-backed sessions, and optional capabilities |
| `proxy` | unset | HTTPS proxy URL for the audited coding-subscription host allowlist |
| `proxyKimi` | `false` | Also send Kimi China traffic through the proxy |
| `capabilities` | all flags off | Secret-free composition defaults; live user overrides stay in the `coding-subscription-oauth` settings namespace |
| `gateway` | disabled | Opt-in isolated local OpenAI-compatible gateway; loopback bind only |

Do not enable this owner in the same Cordis process as a live `dsh-coding-subscription-oauth` bundle. The two implementations share routes, settings, and credential files.

## `debug`

When `true`, emits a single initialization debug message. It does not enable credential, prompt, response, local-path, or raw-provider logging.

## v0.3 compatibility

This remains valid:

```yaml
config:
  monitors:
    relay-a:
      adapter: general
      credentialRef: RELAY_A_TOKEN
```

It is transformed to `accounts.monitors`. Do not specify both root `monitors` and `accounts`, because the intended source would be ambiguous.

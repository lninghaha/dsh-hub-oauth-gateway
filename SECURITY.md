# Security Policy

## Supported versions

Security fixes target the latest 1.x release and the default branch. The 0.3 runtime is no longer supported after the 1.0 release.

## Reporting a vulnerability

Use this repository's private vulnerability-reporting form under the GitHub **Security** tab when available. If it is unavailable, open a minimal issue asking the maintainer for a private contact channel; do not include exploit details in the issue.

请优先使用 GitHub **Security** 页面中的私密漏洞报告。若入口不可用，只创建一个不含利用细节的简短 issue，请求私下沟通渠道。

Never attach API keys, OAuth tokens, cookies, credential files, prompt/response content, raw session logs, local paths, raw provider responses, or unredacted exports. Revoke any credential that may have been exposed.

## Supported deployment model

The plugin is designed for one trusted user running DeepSeek Harness Web on loopback. Its HTTP endpoints are not a public service and do not implement internet-facing authentication or multi-user authorization.

Supported:

- direct browser access to a loopback DSH Web instance;
- the DSH plugin manager or included local fallback installer;
- trusted local Cordis configuration;
- outbound HTTPS account APIs validated by the plugin transport.

Unsupported without an independent authenticated security layer:

- exposing `/api/usage-stats/**` through a reverse proxy;
- binding DSH Web to a LAN/public interface;
- sharing one DSH profile among mutually untrusted OS users;
- enabling arbitrary private-network, HTTP, or cross-origin monitors without reviewing the target.

A malicious process already running as the same OS user may be able to read the user's DSH files or impersonate local browser requests. The plugin limits credential references and browser contexts, but it cannot provide an isolation boundary stronger than the host user account.

## Local API protections

Every plugin route validates:

- the peer socket is loopback;
- `Host` is `localhost` or a loopback literal;
- any presented browser `Origin` or `Referer` resolves to the loopback backend authority or a validated browser-facing forwarded origin;
- normal client requests carry `x-dsh-hub-oauth-gateway: 1` and an exact target-authority corroboration header.

POST/PUT/DELETE additionally require `application/json`. Direct requests use the loopback `Host` as their authority. A reverse-proxied request may additionally use exactly one canonical `X-Forwarded-Host` plus exactly one `X-Forwarded-Proto: http|https`, but only after the socket peer and backend `Host` have both passed the loopback checks. Forwarded mode always requires the plugin marker and a client target-authority value matching the forwarded authority; each presented `Origin` or `Referer` must match either the backend origin rewritten by the proxy or the forwarded browser origin. Opaque, malformed, duplicate, and unrelated contexts remain rejected.

Both client headers are non-safelisted, and the API does not return permissive CORS headers, so hostile cross-origin scripts cannot complete the required preflight. Forwarded headers and the authority value are same-client/proxy corroboration, not authentication or secrets; a hostile local same-user process can forge them and remains outside the isolation boundary. Guard rejections expose and log only a bounded classification such as `origin-opaque` or `authority-mismatch`; raw header values, URLs, cookies, and authorization data are never included. Ordinary GET endpoints read local SQLite/cache state only; credential-bearing upstream refresh occurs through explicit mutation endpoints and background scheduler work.

Credential writes are limited to references used by resolved account specs or a fixed supported import/device-flow catalog. Responses expose only configuration metadata, never values.

## Outbound request protections

Account adapters use a centralized transport that:

- defaults to HTTPS;
- rejects embedded URL usernames/passwords;
- keeps credentials on the original provider origin by default;
- requires explicit `allowCrossOrigin` for a different origin;
- rejects private/reserved IPv4 and IPv6 targets by default;
- validates all DNS results and pins the selected result into the actual connection;
- handles redirects manually;
- applies timeouts and response-size limits;
- validates JSON media/content where required;
- never logs or returns response bodies on failure.

`allowCrossOrigin`, `allowPrivateNetwork`, and `allowInsecure` expand the trust boundary. Enable them only for an endpoint you control and understand.

Declarative monitors are trusted local configuration but remain limited to GET, relative paths, known auth modes, literal non-sensitive headers, and JSON Pointer extraction. They cannot run JavaScript or provide literal Authorization/Cookie/API-key headers.

## OAuth and credentials

The project does not bundle an unverified third-party GitHub OAuth client ID. Device flow is disabled until the operator configures a public client ID for an OAuth app they control or explicitly trust.

OAuth device codes are stored only in a bounded, expiring in-memory server map. The browser receives a random flow ID. Successful access tokens are written directly through the DSH credential seam and are not persisted in the usage SQLite database.

Local CLI import reads only a fixed provider/path catalog. API responses and migration state do not expose filesystem paths.

## Data at rest

The main database is `${DSH_HOME}/storages/usage-stats-v1.sqlite`. The plugin recognizes existing SQLite ownership/schema before changing file modes or enabling WAL, then repairs the storage directory to mode `0700` and the main file to `0600` where the platform supports POSIX modes.

SQLite contains normalized usage facts, opaque session identifiers/cursors, account snapshots, user preferences, price rules, and sanitized migration state. It must not contain:

- credential values;
- prompts or responses;
- working directories;
- local credential-file paths;
- raw provider responses.

Session identifiers are anonymized at the API/UI boundary unless explicitly enabled. Export redaction can independently force them to remain hidden. CSV output prefixes formula-like cells to reduce spreadsheet injection risk.

## Security-sensitive test coverage

The release suite covers loopback/Host validation, cross-site and write guards, credential-reference allowlisting, request/body limits, DNS/private-target rejection, DNS pinning policy, cross-origin credential containment, migration retry behavior, session anonymization, CSV formula escaping, restrictive file modes, refusal to mutate foreign/unknown/future databases, standalone package import, and transactional fallback installation with rollback.

# Coding OAuth provenance

This package includes coding-subscription OAuth implementation originally
developed as `dsh-coding-subscription-oauth`. That source is recorded here for
Apache-2.0 attribution only. Runtime identity is this package.

| Item | Value |
| --- | --- |
| Historical source package | `dsh-coding-subscription-oauth` |
| Source baseline commit | `5af9ad6de61e2c2d5cab8b1ad4f2361544d5ec9e` |
| Destination | `src/server/coding-oauth/`, `src/cli/coding-oauth.ts`, `src/client/coding-oauth/` |
| License of imported modules | Apache-2.0 |
| License of original usage-center modules | MIT |
| Combined package license | MIT AND Apache-2.0 |

Imported modules keep their Apache-2.0 attribution. They are not re-labeled as
MIT.

## Current product identity

| Surface | Value |
| --- | --- |
| Package / invariant registration | `dsh-hub-oauth-gateway` |
| Cordis plugin id | `usage-stats` |
| Nested logger / retry / credential assertion id | `coding-oauth` |
| Capability settings namespace | `coding-oauth` |
| Imagine media directory | `.dsh-hub-oauth-gateway-media` |
| Config | `config.codingOAuth` |

These Grok Build product contracts are kept on purpose (not leftover npm names):

- HTTP namespace `/plugins/dsh-grok-build/*`
- credential filenames under `${DSH_HOME}`
- LLM routes `grok-build`, `codex-oauth`, `kimi-code-oauth`, `claude-code-oauth`
- CLI commands `dsh-coding-oauth` and `dsh-grok-build`
- Settings section id `grok-build`

Google Antigravity remains an external `dsh-agy` plugin. This package only
surfaces its route/management status.

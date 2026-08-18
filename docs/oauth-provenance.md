# Coding OAuth provenance

This package integrates the first-party coding-subscription OAuth implementation
from `dsh-coding-subscription-oauth`.

| Item | Value |
| --- | --- |
| Source package | `dsh-coding-subscription-oauth` |
| Source baseline commit | `5af9ad6de61e2c2d5cab8b1ad4f2361544d5ec9e` |
| Integration baseline | source repository HEAD at migration continuation, including capability, Imagine, media, local gateway, and Coding OAuth Settings UI |
| Destination | `src/server/coding-oauth/`, `src/cli/coding-oauth.ts`, `src/client/coding-oauth/` |
| License of imported modules | Apache-2.0 |
| License of original usage-center modules | MIT |
| Combined package license | MIT AND Apache-2.0 |

Imported modules keep their Apache-2.0 attribution. They are not re-labeled as
MIT. Compatibility contracts preserved from the source package include:

- Cordis logger/settings identity `llm-grok-build-oauth`
- HTTP namespace `/plugins/dsh-grok-build/*`
- credential filenames under `${DSH_HOME}`
- LLM routes `grok-build`, `codex-oauth`, `kimi-code-oauth`, `claude-code-oauth`
- CLI commands `dsh-coding-oauth` and `dsh-grok-build`

Google Antigravity remains an external `dsh-agy` plugin. This package only
surfaces its route/management status.

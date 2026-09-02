# Changelog

All notable changes to `dsh-coding-oauth-core` are documented here.

## 0.1.2

### Added

- Shared pure helpers extracted for Hub / Subscription reuse:
  - `http-json` — JSON body reader with size limits
  - `grok-errors` — xAI capacity / overload remapping
  - `kimi-errors` — Kimi context-overflow AUTH remapping
  - `gateway-protocol` — gateway request / stream types
- Subpath exports for each helper (`./http-json`, `./grok-errors`, `./kimi-errors`, `./gateway-protocol`) in addition to `.` and `./contracts`.
- Peer dependency on `@deepseek-ai/dsh-llm@0.1.1-rc.2` (required by `kimi-errors`).

### Changed

- Package is publishable (`private: false`) with committed `lib/` artifacts and an explicit `files` allowlist.

## 0.1.1

- Pin `undici@7.29.0` with Hub / Subscription so co-installed participants share one dispatcher protocol.

## 0.1.0

- Initial public surface: runtime ownership, contracts, proxy lease, route registration, ids, and state contract.

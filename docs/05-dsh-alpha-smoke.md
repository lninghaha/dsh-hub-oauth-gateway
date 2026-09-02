# Isolated smoke on DSH `0.1.2-alpha.*` (cadence)

Tracker: [#31](https://github.com/lninghaha/dsh-hub-oauth-gateway/issues/31)

## Rules

- Isolated `DSH_HOME=/tmp/dsh-verify-hub-<ver>` only.
- Prefix-install `@deepseek-ai/dsh@0.1.2-alpha.*`; do not overwrite global `0.1.1-rc.2`.
- High port (default `18380`); never `3080`.
- Never restart operator `dsh-web`.
- Comment versions + HTTP codes on #31; never paste revealed keys.

## Quick path

```bash
pnpm run assert:node
pnpm run smoke:dsh-alpha
```

## Checks

1. Mutating coding-oauth **without** CSRF custom header → **403**
2. Gateway reveal with non-loopback `Host` → **403**
3. Optional: loopback reveal allowed (do not publish secrets)

Production pin remains `0.1.1-rc.2` until deliberately promoted.

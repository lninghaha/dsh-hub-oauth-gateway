# Isolated smoke on unverified DSH candidates

Tracker: [#31](https://github.com/lninghaha/dsh-hub-oauth-gateway/issues/31)

Use this cadence for hosts listed under `compatibility/dsh-bom.json` → `candidates[]` (today: `0.1.2-alpha.*`, `0.1.5-rc.1`). A candidate is **not** the production pin.

## Rules

- Isolated `DSH_HOME=/tmp/dsh-verify-hub-<ver>` only.
- Prefix-install the candidate CLI (for example `@deepseek-ai/dsh@0.1.5-rc.1` or `@deepseek-ai/dsh@0.1.2-alpha.*`); do **not** overwrite the global verified `0.1.1-rc.2` pin.
- High port (default `18380`); never `3080`.
- Never restart operator `dsh-web`.
- Comment versions + HTTP codes on #31; never paste revealed keys.

## Quick path (`0.1.2-alpha.*`)

```bash
pnpm run assert:node
pnpm run smoke:dsh-alpha
```

## Manual path (`0.1.5-rc.1` or other candidates)

When there is no dedicated npm script yet:

1. Prefix-install: `npm install --prefix /tmp/dsh-cli-$VER @deepseek-ai/dsh@$VER`
2. `export DSH_HOME=/tmp/dsh-verify-hub-$VER` and put the Hub tarball or checkout on `PATH` via that prefix’s `dsh`
3. `dsh plugin --profile web add <path-or-tarball>` then `dsh web --port 18380 --no-open`
4. Authenticate the isolated Web UI the same way the candidate host requires (for example cookie after `/?token=…` on `0.1.5-rc.1`)
5. Assert Settings compatibility: `sessionPersistence` is **available** (not `incompatible`); optional client inject misses stay soft diagnostics
6. Run the security checks below; kill only the smoke PID

## Checks

1. Mutating coding-oauth **without** CSRF custom header → **403**
2. Gateway reveal with non-loopback `Host` → **403**
3. Optional: loopback reveal allowed (do not publish secrets)
4. On `0.1.5-rc.1`: Settings / diagnostics must not report `sessionPersistence: incompatible` solely because the host uses `open`/`read` instead of `readFrom`

Production pin remains `0.1.1-rc.2` until deliberately promoted.

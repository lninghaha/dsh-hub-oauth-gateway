# ADR: Antigravity quota probe strategy（#36）

**Status:** Accepted — **keep Hub read-only opt-in adapter; OAuth stays with `dsh-agy`**  
**Date:** 2026-09-02  
**Parent:** #30 / #36  
**Code:** `src/server/accounts/adapters/antigravity-quota.ts`

## Context

Usage Center can show subscription windows for many providers. Google Antigravity
login, account pool, and model routing live in the **external** plugin
[`dsh-agy`](https://www.npmjs.com/package/dsh-agy), not in this Hub package.

Hub already ships `antigravity-quota`:

- Does **not** perform Google OAuth, spawn `dsh-agy`, or open the `/agy` web dashboard.
- Requires an operator-supplied `credentialRef` (default `ANTIGRAVITY_ACCESS_TOKEN`) **and** `usageBaseURL`.
- Missing either → snapshot status **`not-configured`** (external plugin owns login).
- HTTP goes through the shared accounts transport (SSRF / same-origin / size / timeout guards).

## Options

| Option | Meaning | Pros | Cons |
| --- | --- | --- | --- |
| **A. Hub read-only probe (keep)** | Opt-in monitor when credential + usage URL are configured | One Usage Center surface; no OAuth duplication; fail closed when unconfigured | Operator must wire token/URL (or future bridge from `dsh-agy`); Hub never “just works” for Antigravity alone |
| **B. Defer entirely to `dsh-agy`** | Remove / hide Hub adapter; users read quota only in agy tooling | Smaller Hub surface | Splits monitoring UX; still need docs for how Hub shows the route as externally managed |
| **C. Hub owns Google OAuth** | Re-implement Antigravity login inside Hub | Single plugin install | Out of scope; ToS/client-impersonation risk; fights `dsh-agy`; must not ship unauthenticated export dashboard |

## Decision

**Choose A.**

1. Keep `antigravity-quota` as an **opt-in read-only** adapter.
2. Unconfigured monitors stay **`not-configured`** — UI already treats Antigravity as an externally managed route (`management: "cli"` / install detection), not a Hub OAuth provider.
3. **Do not** take over Google OAuth, enable `/agy` export APIs, or scrape Antigravity desktop credentials from disk by default.
4. Quota freshness and probing cadence remain the same AccountService / scheduler path as other subscription adapters once configured.

## Alignment checklist

| Requirement | How we meet it |
| --- | --- |
| ADR: Hub read-only vs defer | This document — keep read-only |
| Unconfigured → `not-configured` | Adapter early-return when token or `usageBaseURL` missing |
| No Google OAuth in Hub | Adapter only `Bearer` + GET JSON |
| No unauthenticated web export | Hub does not register `dsh-agy-web`; trusted-host profiles should disable that dashboard in `dsh-agy` (see subscription-oauth INSTALL) |
| Link into #30 | Close #36 with this ADR; Wave2 monitors keep the adapter registered |

## Non-goals

- New OAuth provider UI in Hub for Antigravity.
- Automatic discovery of `dsh-agy` session files without an explicit credential bridge design (future optional work; still must not weaken transport policy).

## Revisit triggers

- `dsh-agy` publishes a stable, local, authenticated quota API that Hub can call without holding a raw Google token.
- Product decides Antigravity must appear “green” in Usage Center with zero Hub monitor config (would require an explicit IPC/bridge ADR).

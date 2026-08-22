# Migrating from 0.3 to 1.0

Version 1.0 is a full TypeScript/SQLite rewrite that replaces the runtime implementation and storage model. The package and repository have since been renamed from `dsh-usage-stats` to `dsh-hub-oauth-gateway`; the rename changes the plugin/bundle identity, so 0.3 installations migrate by removing the old entry and installing the new package name — an in-place `dsh plugin update` cannot cross a rename. Local data files are untouched and are picked up in place.

## Before upgrading

1. Do not delete the old JSON files.
2. Do not combine a `dsh plugin` installation with the fallback `npx`/manual Cordis installation.
3. Ensure Node.js is `^22.19.0` or `>=24.0.0` because 1.0 uses `node:sqlite`.
4. Keep a copy of your non-secret Cordis monitor configuration.

Credential files do not need to be copied or migrated. The rewrite continues to use the DSH credential seam.

## Installation

Preferred — remove the 0.3 entry, then install the renamed package from **npm**:

```bash
dsh plugin --profile web remove dsh-usage-stats
dsh plugin --profile web add dsh-hub-oauth-gateway
```

Fallback installer (also from npm):

```bash
npx --yes dsh-hub-oauth-gateway-install
npx --yes dsh-hub-oauth-gateway-install --check
```

For unreleased or Git-tracked installs, use `github:lninghaha/dsh-hub-oauth-gateway` or a local path instead.

The fallback installer stages a complete package, keeps package and Cordis-patch backups through final verification, and rolls both back if package install, patch update, or verification fails. Removed 0.3 runtime files cannot linger after a successful install. An unreadable `profiles/web/package.json` fails closed instead of installing beside an unknown plugin-manager state.

After installation, the running DSH Web process still has the old module in memory. The user must restart that process manually at a suitable time through the process manager used on the target machine. `dsh web` is the DSH CLI command for the `web` profile; DSH does not define a universal `dsh-web` executable or service-unit name.

## Storage migration order

On the first 1.0 start:

1. Open `${DSH_HOME}/storages/usage-stats-v1.sqlite`.
2. Recognize an existing SQLite file as this application's database before repairing permissions or enabling WAL.
3. Project the current DSH session inventory into SQLite.
4. Import legacy preferences from `${DSH_HOME}/storages/usage-stats-prefs.json` if no v1 preferences exist.
5. Import legacy usage from `${DSH_HOME}/storages/usage-stats-cache.json`, but only for session IDs not already projected from the current inventory.
6. Record a sanitized migration state in SQLite.

This order prevents the same active session from being counted once from DSH and again from the old cache.

Migration writes for all eligible legacy usage sessions are committed as one repository transaction. A failed migration records `failed`, logs a redacted warning, and retries after the next successful usage synchronization in the same process or a later start. `imported`, `ignored`, and `absent` are terminal states.

The migrator never deletes or rewrites the legacy JSON files and does not persist their filesystem paths.

## Configuration migration

The old shape remains accepted:

```yaml
config:
  monitors:
    relay-a:
      adapter: new-api
      credentialRef: RELAY_A_TOKEN
```

The new canonical shape is:

```yaml
config:
  accounts:
    monitors:
      relay-a:
        adapter: new-api
        credentialRef: RELAY_A_TOKEN
```

Do not define both shapes. All credential references continue to be names, not values.

## Behavioral changes

| 0.3 behavior | 1.0 behavior |
| --- | --- |
| JSON aggregate cache | Normalized SQLite facts, cursors, snapshots, preferences, and prices |
| Heatmap-oriented primary UI | Quick Peek plus configurable full dashboard |
| GET could request a refresh | GET is snapshot-only; refresh is explicit POST |
| Limited cost presentation | User price rules, coverage ratio, comparisons, and forecast |
| Provider visibility only | Visibility, ordering, aliases, colors, presets, density, motion |
| Session identifiers in internal breakdowns | Session keys and labels anonymized unless explicitly enabled |
| Device code returned to browser | Device code stays in bounded server memory; browser receives a random flow ID |
| Handwritten multi-file runtime | Standalone bundled server plus one classic client bundle |

## HTTP compatibility

The 1.0 API lives under `/api/usage-stats/v1`. Selected 0.3 paths remain registered and render compatibility shapes from the v1 repositories:

```text
/api/usage-stats/usage
/api/usage-stats/providers
/api/usage-stats/balance
/api/usage-stats/subscriptions
/api/usage-stats/account
/api/usage-stats/prefs
/api/usage-stats/credential
/api/usage-stats/credential/import
```

Legacy GET endpoints no longer perform outbound refreshes, even if an old `refresh=1` query is present. Use the v1 refresh POST or the dashboard refresh button.

The old internal package subpaths `dsh-usage-stats/usage` and `dsh-usage-stats/oauth-device` are removed. They were implementation details, not the stable plugin/API contract.

## Privacy defaults

Migration imports only aggregate usage facts and opaque session identifiers. It does not import prompts, responses, working directories, credential values, cookies, raw provider payloads, or local credential-file paths.

The v1 UI/API hides session identifiers by default. Enabling session identifiers affects breakdown display; enabling `redactExports` can still force exported identifiers to remain hidden.

## Rollback

The 1.0 database is separate from the 0.3 JSON cache. A package rollback can therefore reload the old runtime and old JSON files, but usage collected only after the 1.0 cutover will not be backported into the old cache.

Before rollback:

1. stop making configuration changes;
2. preserve `usage-stats-v1.sqlite` for a future return to 1.0;
3. restore the prior package version through the same installation mechanism originally used;
4. manually restart DSH Web.

Do not point 0.3 code at the SQLite database or manually edit migration-state rows.

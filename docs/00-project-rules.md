# 00 · Project rules: open source, releases, and maintenance

> This document is the source of truth for the public project rules of
> `dsh-hub-oauth-gateway`. It governs repository content, public documentation,
> versioning, release artifacts, and maintenance. Contributor workflow is in
> [`CONTRIBUTING.md`](../CONTRIBUTING.md); security reporting is in
> [`SECURITY.md`](../SECURITY.md).

The guiding principle is: **develop in public without publishing private
development data**. Public material must be useful, generic, reproducible, and
safe to redistribute.

## 0. Open-source principles

### 0.1 Purpose

`dsh-hub-oauth-gateway` is an independent, community-maintained MIT-licensed plugin.
It is open so people can use, inspect, audit, fork, and improve local-first
usage analytics for DeepSeek Harness Web. Public claims must describe behavior
that exists and can be verified; the project must not imply vendor endorsement
or billing accuracy.

### 0.2 License and provenance

- Repository contributions are accepted under the [MIT License](../LICENSE).
- Preserve copyright and license notices when copying or adapting code.
- Before adding third-party code, assets, datasets, or generated material,
  verify its source and license compatibility. Record required attribution in
  a dedicated notice before release.
- Prefer auditable dependency versions and commit the pnpm lockfile. Do not
  vendor a dependency merely to hide its origin or license.

### 0.3 Privacy is a hard publication boundary

The following must never enter Git history, an npm artifact, an issue, a pull
request, a release note, or public logs:

- API keys, OAuth tokens, cookies, passwords, private keys, device codes, or
  credential-file contents;
- personal account details, unredacted session identifiers, prompts,
  responses, working directories, or raw provider payloads;
- private hostnames, internal IP addresses, personal absolute paths, or
  machine-specific incident notes;
- production databases, exports, traces, screenshots, or fixtures containing
  real user data.

Use neutral placeholders such as `example.com`, `provider-a`, `YOUR_API_KEY`,
and `${DSH_HOME}`. Sanitization means replacing the sensitive value, not merely
blurring part of it. If publication safety is uncertain, keep the material
local until it has been reviewed.

### 0.4 Security and product honesty

- The supported deployment is one trusted user on a loopback-only DSH Web
  instance. Do not present the plugin as an authenticated multi-user or
  internet-facing service.
- Usage and cost values are analytics and estimates, not provider invoices.
  Missing prices remain uncovered and must never be represented as free.
- Ordinary reads remain local and side-effect free. Credential-bearing refresh
  and network trust expansion must be explicit.
- Do not add telemetry, remote error reporting, or data upload by default. Any
  future networked analytics feature requires a documented threat/privacy
  review and affirmative user configuration.
- Query only accounts and endpoints the operator owns or is authorized to use.
  The project does not support credential sharing, quota resale, bulk-account
  operation, paywall bypass, client impersonation, or unauthorized monitoring.

## 1. Repository and publication layers

A file can be public in Git without belonging in the runtime package. Every
new file must be assigned to one of these layers deliberately.

| Layer | Typical locations | Git | npm | Rule |
| --- | --- | ---: | ---: | --- |
| Public source and tests | `src/`, `tests/`, `build/`, `.github/` | yes | no | Reproducible and free of private data |
| Public community docs | `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, selected `docs/` | yes | selected | Generic, durable, externally readable |
| Runtime release artifact | `lib/`, `cordis.patch.yml`, `scripts/install.mjs` | yes | yes | Generated/verified and sufficient to install |
| Local-only investigation | `docs/local/` | no | no | Private fault notes and machine-specific research |
| Local reference material | `reference/` | no | no | Temporary third-party checkouts or personal notes |
| Ephemeral output | `.next/`, `output/`, `coverage/`, `*.tsbuildinfo`, databases | no | no | Rebuildable or sensitive local state |

Hard rules:

1. `package.json#files` is an explicit allowlist. List publishable documents
   individually; never use a broad `docs/` or `docs/**` entry.
2. Public documents must not link to or depend on `docs/local/` or `reference/`.
3. `.gitignore` is only a guardrail. Review staged changes and the actual npm
   file manifest before every release.
4. Do not use `git add -f` to bypass the local-only boundary. Promote a
   sanitized document by moving it into the public layer and reviewing it as
   a new public file.
5. Research documents may be public when they contain reusable product or
   protocol analysis and no private incident/account data. Label assumptions
   and distinguish observations from current guarantees.

## 2. Source, generated artifacts, and dependencies

### 2.1 Source of truth

- `src/` is the source of truth for runtime behavior.
- `lib/` is a committed release artifact because Git-host installation must
  work without compiling TypeScript. Never edit it by hand.
- Rebuild `lib/` in the Cursor Cloud / agent environment from `src/` (via the
  repository release/build scripts), review the diff, then commit it. Do not
  hand-patch generated files.
- A runtime change is incomplete until the corresponding regenerated `lib/`
  diff is committed. A documentation-only change must not create an unrelated
  `lib/` diff.

### 2.2 Toolchain and lockfile

- Use the Node.js range and exact pnpm major/version declared in
  `package.json`.
- Dependency changes include both `package.json` and `pnpm-lock.yaml`.
- `package-lock.json` and mixed package-manager state are not accepted.
- Keep runtime dependencies bundled or explicitly declared according to the
  architecture. Do not rely on undeclared packages from a developer machine.
- Dependency upgrades require the normal test/release gates and a review of
  relevant security, license, and bundle-size impact.

### 2.3 Cloud verification (primary)

Docker sandbox verification is **not required** for this repository. Agents and
contributors verify in the **Cursor Cloud / repository cloud environment** by
running project tooling and installing DeepSeek Harness (DSH) for plugin smoke
tests.

Allowed in the cloud workspace:

- `node` / `npm` / `npx` / `pnpm` at the versions declared in `package.json`;
- lint, typecheck, Vitest, build scripts, and `npm pack --dry-run`;
- installing `@deepseek-ai/dsh`, adding this plugin into an isolated profile,
  and starting `dsh web` for UI/API smoke checks.

Recommended sequence:

1. `pnpm install --frozen-lockfile` (or the repo’s lockfile install);
2. `pnpm run check:next` for the fast gate;
3. `pnpm run check` before handoff;
4. `npm pack --dry-run --json --ignore-scripts` before publish;
5. DSH smoke: isolated `DSH_HOME` → install DSH →
   `dsh plugin --profile web add <repo-path>` → `dsh web` → confirm
   `http://127.0.0.1:3080` and Usage Center load. End-user installs prefer the
   npm package name `dsh-hub-oauth-gateway` (see `README.md`).

Isolation and privacy remain mandatory:

- Use a dedicated `DSH_HOME` (for example `/tmp/dsh-verify-*` or
  `${DSH_HOME}` under the cloud workspace). Never read or write the operator’s
  real profile, production SQLite, or live credentials.
- Automated tests stay on mocks and sanitized fixtures; no live providers.
- Do not commit cloud tokens, cookies, sessions, or private absolute paths.

The repository `Dockerfile` may remain for optional CI or contributor
preference; it is not an agent delivery gate. When reporting pass/fail, state
Node/pnpm versions, commands run, and whether DSH smoke completed.

### 2.4 Runtime invariants

Changes must preserve these architectural boundaries unless an explicitly
reviewed breaking release changes them:

- one Cordis server plugin and one classic-script client registration;
- no second HTTP server and no replacement DSH root application;
- versioned API contracts and strict runtime configuration validation;
- local SQLite facts/snapshots without credentials, prompts, responses,
  working directories, credential paths, or raw provider bodies;
- provider credentials remain server-side and are sent only through the
  centralized target-validation transport;
- installers and development tools never restart the operator’s personal DSH
  Web automatically; cloud agents may start/restart an **isolated** smoke
  instance under a dedicated `DSH_HOME`.

See [`architecture.md`](architecture.md) and
[`configuration.md`](configuration.md) for the implementation contracts.

## 3. Documentation and change records

- `README.md` is intentionally concise and bilingual (Simplified Chinese and
  English). User-visible UI strings must remain available in both languages.
- Detailed public engineering documentation is English-first. A translation
  is welcome, but it must identify its canonical source and avoid silently
  diverging on commands or security statements.
- Observable behavior, configuration, API, installation, migration, or trust
  boundary changes require updates to the relevant docs in the same pull
  request.
- Record user- and operator-visible changes under `Unreleased` in
  `CHANGELOG.md`, following Keep a Changelog categories. Do not add entries for
  formatting-only or internal changes with no release impact.
- Examples must be copy-safe: use fake domains, references, and values; explain
  flags that weaken network restrictions.
- Public documentation is versioned with the repository. There is no separate
  document-version number and documentation edits do not, by themselves,
  force an immediate release.

## 4. Compatibility and semantic versioning

The project follows [Semantic Versioning](https://semver.org/) after 1.0.0.

| Change | Version |
| --- | --- |
| Backward-compatible bug, security, packaging, or documentation fix | patch |
| Backward-compatible capability, adapter, preference, or endpoint | minor |
| Incompatible public API/export/config/storage/install contract | major |

The public compatibility surface includes:

- package entry points declared in `exports`;
- Cordis plugin name, configuration schema, and bundle declaration;
- documented versioned HTTP API behavior;
- persisted data for which migration is promised;
- documented installation and upgrade behavior.

Internal TypeScript modules, undocumented shapes, CSS class names, and test
helpers are not stable API. Nevertheless, avoid gratuitous churn. Deprecate a
public contract before removal when a safe compatibility window is possible.
Pre-release versions may iterate faster, but every incompatibility must still
be documented.

## 5. Contribution and review gates

- Keep changes focused and reviewable. Use `feat:`, `fix:`, `docs:`, `test:`,
  `refactor:`, `build:`, or `chore:` commit prefixes when practical.
- A bug fix should include a regression test. A security-boundary change must
  include negative/adversarial coverage.
- Tests and CI must not require real credentials, provider accounts, internet
  access, or an existing DSH profile. Use mocks and temporary directories.
- Reviews consider correctness, compatibility, failure isolation, privacy,
  accessibility, documentation, generated artifacts, and packed contents.
- Do not merge a behavior change while required docs/changelog/tests or the
  generated `lib/` update are missing.

The primary verification gates are:

```bash
pnpm install --frozen-lockfile
pnpm run check:next
pnpm run check
npm pack --dry-run --json --ignore-scripts
```

Plus an isolated DSH smoke install (dedicated `DSH_HOME`, no personal
credentials). Docker targets remain optional for contributors who prefer them;
they are not required to claim a change is verified.

## 6. Release process

Only maintainers release. Preparing and inspecting a release is deliberately
separate from registry writes that need interactive 2FA.

A release is **incomplete** until the same SemVer version is published to the
public npm registry (`https://registry.npmjs.org/`). A Git tag and GitHub
Release alone do not finish a release.

1. Choose the SemVer change from the actual compatibility impact.
2. Move relevant `CHANGELOG.md` entries from `Unreleased` into the target
   version. **During the release**, update related user-facing docs in the
   same change set (README install notes, migration, configuration, and any
   rule text that describes install or version contracts). Do not defer docs
   to a follow-up after publish.
3. Update `package.json` (and any generated version metadata such as the
   server bundle banner / `build/verify-release.mjs` pin) without weakening
   the Node/pnpm or peer-dependency contract.
4. From a reviewed working tree, run the cloud gates on a supported Node line
   (use `.nvmrc`; do not rely on `/exec-daemon/node` 22.14):

   ```bash
   pnpm install --frozen-lockfile
   pnpm run check
   pnpm run release:inspect
   ```

   Optionally smoke-test with an isolated DSH install (`DSH_HOME` under
   `/tmp` or a cloud-only path; no personal credentials).

5. Inspect the complete file list from `npm pack --dry-run`. Local tarballs
   may be written under ignored `output/` for review; never pack from a
   credential-bearing personal profile.
6. Confirm the changelog version, package version, bundle banner, and tag will
   all be identical.
7. Only after explicit human approval: commit, push, create annotated tag
   `v<version>`, and create GitHub release notes from the changelog.
8. **npm publish is mandatory** and is run by the maintainer in the **Cursor
   Cloud terminal** (OTP / 2FA). Agents must **not** execute `npm publish`;
   they must paste a complete command block (nvm Node switch +
   `npm publish --access public --otp=<code>` + `npm view` check) for the
   maintainer to run. Example shape:

   ```bash
   export NVM_DIR="$HOME/.nvm"
   . "$NVM_DIR/nvm.sh"
   nvm use --delete-prefix "$(cat .nvmrc)" --silent
   export PATH="$NVM_DIR/versions/node/v$(cat .nvmrc)/bin:$PATH"
   hash -r
   node -v
   npm publish --access public --otp=<6-digit-code>
   npm view dsh-hub-oauth-gateway version
   ```

9. After publish, verify `npm view dsh-hub-oauth-gateway version` matches the
   tag and `package.json`, and that the documented install path
   (`dsh plugin add dsh-hub-oauth-gateway` / `npx dsh-hub-oauth-gateway-install`)
   resolves to that version.

Release helpers may build, inspect, and export a local tarball under `output/`;
they must never bump a version, commit, tag, push, publish, or read user
credentials without explicit maintainer action. Helpers also must never run
`npm publish` on the maintainer’s behalf.

## 7. Pre-release privacy and security checklist

Before an external release, verify all of the following:

- [ ] `git diff --cached` contains no secret, personal path, account/session
      data, raw provider response, or private investigation note.
- [ ] Cloud gates (`pnpm run check`, pack dry-run) pass on a supported Node.js
      line; optional isolated DSH smoke is recorded when UI/install behavior
      changed.
- [ ] Regenerated `lib/` matches `src/` and no stale legacy runtime is present.
- [ ] The release inspection / `npm pack --dry-run` reports only explicitly
      allowed files.
- [ ] No `docs/local/`, `reference/`, source tree, tests, database, export,
      environment file, package-manager cache, or lockfile is in the tarball.
- [ ] README, configuration, migration, security, and changelog statements
      match actual behavior.
- [ ] New third-party material has compatible licensing and attribution.
- [ ] No live-provider smoke test or credential-bearing operation is hidden in
      a lifecycle script.
- [ ] Publishing target, package name, version, tag, and release notes have
      been reviewed by a human.
- [ ] Public npm publish of the same version completed; `npm view` matches
      tag / `package.json` (Git tag alone is not enough).
- [ ] Install and release docs updated in the same release change set.

If a secret may have been exposed, stop the release, revoke/rotate it, remove
it from pending changes and artifacts, and follow `SECURITY.md`. Rewriting Git
history is not a substitute for revocation.

## 8. Maintenance and governance

- Respond constructively to reproducible issues and focused pull requests.
- Keep CI green on the declared Node.js support range and remove unsupported
  versions deliberately rather than accidentally.
- Prefer meaningful releases over artificial activity. Never pad a changelog,
  fabricate support, or publish empty versions merely to appear active.
- Security fixes target the versions stated in `SECURITY.md`; support-policy
  changes must update that file before release.
- Changes to this rules document use the normal pull-request process and must
  be mentioned under `Unreleased` when they materially change contributor or
  release obligations.

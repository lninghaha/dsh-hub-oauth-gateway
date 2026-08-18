# Contributing to dsh-hub-oauth-gateway

Thank you for helping improve `dsh-hub-oauth-gateway`. Bug reports, documentation,
tests, accessibility improvements, adapters, and focused pull requests are
welcome.

Before contributing, read:

- [project rules](docs/00-project-rules.md) for publication, compatibility, and
  release requirements;
- [security policy](SECURITY.md) for the supported deployment and private
  vulnerability reporting;
- [code of conduct](CODE_OF_CONDUCT.md) for community expectations.

By submitting a contribution, you agree that it may be distributed under this
repository's [MIT License](LICENSE).

## Before opening an issue

1. Search existing issues and the changelog.
2. Reproduce on a supported Node.js/DSH version when possible.
3. Remove credentials, account details, session identifiers, prompts,
   responses, raw provider payloads, local paths, and host information.
4. For a security vulnerability, **do not open a public issue**. Follow
   `SECURITY.md`.

A useful bug report includes expected and actual behavior, minimal sanitized
configuration, version information, and deterministic reproduction steps. Do
not attach a production database or credential-bearing log. Feature requests
should explain the user problem and trust/data-flow impact rather than only a
proposed UI.

## Development setup

Verify in the **Cursor Cloud / local cloud workspace** with the declared Node.js
and pnpm versions. Docker is optional, not required.

```bash
node -v   # must satisfy ^22.19 || >=24 — see .nvmrc; avoid /exec-daemon/node 22.14
pnpm -v   # packageManager in package.json
pnpm install --frozen-lockfile
pnpm run check:next
```

If you see `Unsupported engine ... current: {"node":"v22.14.0"...}`, switch to the
nvm Node from `.nvmrc` (or any `22.19+` / `24+`) so that `node` and `pnpm` share
that runtime before re-running.
For plugin smoke tests, use an **isolated** `DSH_HOME` (never the operator’s
personal profile), install `@deepseek-ai/dsh`, add this package to the web
profile via a **local path** (`dsh plugin --profile web add "$PWD"`), and start
`dsh web` on loopback. End-user installs prefer the published npm package name;
see [`README.md`](README.md).

Automated tests use mocks and sanitized fixtures. They must not read a
personal DSH profile, local CLI login, credential store, production SQLite, or
require live provider access.

## Repository model

- Edit runtime behavior under `src/`.
- Add or update tests under `tests/v1/`.
- Do not edit `lib/` manually. It is a committed installation artifact rebuilt
  from `src/` in the cloud/dev environment, reviewed, then committed.
- `.next/`, `output/`, coverage, optional Docker exports, images, and TypeScript
  build info are local/rebuildable outputs.
- Put private machine-specific research in ignored `docs/local/`, never in a
  pull request. Public reusable research belongs in a reviewed public doc.
- Use pnpm only. Dependency changes include `pnpm-lock.yaml` and must not add
  `package-lock.json`.

Architecture and configuration contracts are documented in
[`docs/architecture.md`](docs/architecture.md) and
[`docs/configuration.md`](docs/configuration.md).

## Change workflow

1. Discuss a large or compatibility-affecting change in an issue first.
2. Branch from the default branch and keep the change focused.
3. Use a conventional commit prefix where practical:
   - `feat:` backward-compatible capability;
   - `fix:` bug or security fix;
   - `docs:` public documentation;
   - `test:` test-only change;
   - `refactor:` behavior-preserving cleanup;
   - `build:` build/dependency/release tooling;
   - `chore:` repository maintenance.
4. Add regression tests for fixes and negative tests for security boundaries.
5. Update public documentation when behavior, API, configuration, installation,
   migration, compatibility, or trust assumptions change.
6. Add a concise user/operator-facing entry under `Unreleased` in
   `CHANGELOG.md`.
7. For runtime changes, regenerate `lib/` from `src/`, review the diff, commit
   it, run `pnpm run check`, and smoke-test with an isolated DSH install when
   UI or install behavior changed.

User-visible copy must remain available in Simplified Chinese and English.
Usage and costs must stay clearly identified as analytics/estimates; an
unpriced token category is unknown, not free.

## Required checks

Fast source gate:

```bash
pnpm install --frozen-lockfile
pnpm run check:next
```

After a runtime source change, rebuild and review `lib/`, then run:

```bash
pnpm run check
npm pack --dry-run --json --ignore-scripts
```

Optional UI smoke (isolated `DSH_HOME` only):

```bash
export DSH_HOME=/tmp/dsh-verify-$USER
# install @deepseek-ai/dsh, then:
dsh plugin --profile web add "$PWD"
dsh web --host 127.0.0.1 --port 3080
```

Never use a live credential or provider call as evidence that replaces an
automated regression test.

## Pull requests

A pull request should include:

- the problem and scope;
- compatibility, migration, security, and privacy impact;
- tests and exact commands run;
- screenshots only when useful and fully synthetic/sanitized;
- linked issues and remaining follow-ups.

Reviewers will check correctness, failure isolation, accessibility, public API
compatibility, privacy boundaries, docs/changelog synchronization, generated
artifacts, and npm package contents. Maintainers may ask to split unrelated
changes.

At least one maintainer approval and green required CI are expected before
merge. Authors should not rewrite shared history after review without warning.

## Releases

Maintainers perform releases according to
[`docs/00-project-rules.md`](docs/00-project-rules.md). Release preparation and
inspection may run in Cursor Cloud (`pnpm run check`, `pnpm run release:inspect`,
`pnpm run release:pack`); version bumps, tags, pushes, **npm registry
publication**, and **GitHub Releases** require an explicit human decision.
Every GitHub Release for a version **must** attach
`dsh-hub-oauth-gateway-<version>.tgz` so users can download a ready-to-install
package and hand it to an Agent. Cloud Agents cannot authenticate to npm or
create Releases—when a publish is requested they must supply cloud-terminal
commands for the maintainer to run (see [`AGENTS.md`](AGENTS.md) §8).
Contributors should not include an unsolicited version bump or tag in a feature
pull request.

Installing or developing the plugin never authorizes a tool or contributor to
restart DSH Web. A user chooses when to restart the service.

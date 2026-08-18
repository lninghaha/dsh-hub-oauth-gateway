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

Use the current isolated checkout (local dedicated VM, Cursor Cloud Agent, or
equivalent). Install the Node.js range and pnpm version declared in
`package.json`, then:

```bash
pnpm install --frozen-lockfile
pnpm run check:next
```

Tests use mocks, sanitized fixtures, and temporary directories. They must not
read a developer's real DSH profile, local CLI login, credential store,
production SQLite database, or another project directory, and must not require
live provider access. Prefer a temporary `DSH_HOME` for installer checks.

The repository Docker targets remain optional for reproducible CI/release
cross-checks. Ordinary development does **not** require wrapping every command
in `docker build`.

## Repository model

- Edit runtime behavior under `src/`.
- Add or update tests under `tests/v1/`.
- Do not edit `lib/` manually. It is a committed installation artifact rebuilt
  from `src/` via the repository build commands; review the diff before commit.
  Optional Docker `artifacts` export to ignored `output/docker-artifacts/` can
  be used as a cross-check.
- `.next/`, `output/`, coverage, Docker exports, images, and TypeScript build
  info are local/rebuildable outputs.
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
7. For runtime changes, rebuild `lib/` from `src/`, review the generated tree,
   commit it with the source change, and run `pnpm run check` (optional Docker
   `verify` for release cross-check).

User-visible copy must remain available in Simplified Chinese and English.
Usage and costs must stay clearly identified as analytics/estimates; an
unpriced token category is unknown, not free.

## Required checks

Fast source gate:

```bash
pnpm install --frozen-lockfile
pnpm run check:next
```

After a source change, rebuild and review committed `lib/`, then run the full
gate:

```bash
pnpm run check
pnpm run release:inspect
```

Optional Docker cross-check on supported Node lines:

```bash
docker build --target verify --build-arg NODE_VERSION=22.19.0 \
  --tag dsh-hub-oauth-gateway-sandbox:verify-22 .
docker build --target verify --build-arg NODE_VERSION=24 \
  --tag dsh-hub-oauth-gateway-sandbox:verify-24 .
```

A documentation/package-only change may skip an unrelated `lib/` rebuild.
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
inspection are local; version bumps, tags, pushes, registry publication, and
GitHub Releases require an explicit human decision. Contributors should not
include an unsolicited version bump or tag in a feature pull request.

Installing or developing the plugin never authorizes a tool or contributor to
restart DSH Web. A user chooses when to restart the service.

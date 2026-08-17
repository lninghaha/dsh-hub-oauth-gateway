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

Project commands run **only inside the repository Docker sandbox**. The host
needs Docker Engine with BuildKit; it does not need project Node.js, pnpm, or
`node_modules`.

```bash
docker version
docker build \
  --target check \
  --build-arg NODE_VERSION=22.19.0 \
  --tag dsh-hub-oauth-gateway-sandbox:check \
  .
```

Do not run `node`, `npm`, `npx`, `pnpm`, `tsc`, `vitest`, `biome`, installers,
or package scripts on the host. Do not replace the image build with a bind
mount such as `docker run -v "$PWD:/workspace" ...`; the Docker build receives
only the explicit `.dockerignore` allowlist and cannot write the checkout.

Dependency download is isolated in the Docker `dependencies` stage. Project
code executes in later stages with `RUN --network=none`. Tests use mocks,
sanitized fixtures, and container-only temporary directories; they must not
read a developer's DSH profile, local CLI login, credential store, production
SQLite database, Docker socket, or another project directory, and must not
require live provider access.

## Repository model

- Edit runtime behavior under `src/`.
- Add or update tests under `tests/v1/`.
- Do not edit `lib/` manually. It is a committed installation artifact rebuilt
  by the Docker `artifacts` target and exported to ignored
  `output/docker-artifacts/` for review before replacement.
- `.next/`, `output/`, coverage, Docker exports, images, and TypeScript build
  info are local/rebuildable outputs.
- Put private machine-specific research in ignored `docs/local/`, never in a
  pull request. Public reusable research belongs in a reviewed public doc.
- The container uses pnpm only. Dependency changes include `pnpm-lock.yaml`
  and must not add `package-lock.json`; regenerate the lockfile with the Docker
  `lockfile` export target, never by installing dependencies on the host.

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
7. For runtime changes, export `lib/` through the Docker `artifacts` target,
   review the generated tree, replace the committed artifact, and then run the
   Docker `verify` target.

User-visible copy must remain available in Simplified Chinese and English.
Usage and costs must stay clearly identified as analytics/estimates; an
unpriced token category is unknown, not free.

## Required checks

Fast source gate:

```bash
docker build --target check --build-arg NODE_VERSION=22.19.0 \
  --tag dsh-hub-oauth-gateway-sandbox:check .
```

Export generated runtime artifacts after a source change:

```bash
rm -rf output/docker-artifacts
docker build --target artifacts --build-arg NODE_VERSION=22.19.0 \
  --output type=local,dest=output/docker-artifacts .
```

Review `output/docker-artifacts/lib/`, replace the generated `lib/` tree, then
run the full submission gate on both supported Node lines:

```bash
docker build --target verify --build-arg NODE_VERSION=22.19.0 \
  --tag dsh-hub-oauth-gateway-sandbox:verify-22 .
docker build --target verify --build-arg NODE_VERSION=24 \
  --tag dsh-hub-oauth-gateway-sandbox:verify-24 .
```

The `verify` target lints, type-checks, tests, rebuilds, compares the rebuilt
`lib/` to the committed tree, and inspects the npm manifest without publishing.
A documentation/package-only change may use `--target inspect`; a documentation-
only change does not need an unrelated `lib/` rebuild.

For dependency changes, export a reviewed lockfile without running project
source on the host:

```bash
rm -rf output/docker-lockfile
docker build --target lockfile --build-arg NODE_VERSION=22.19.0 \
  --output type=local,dest=output/docker-lockfile .
```

Never use a live credential or provider call as evidence that replaces an
automated sandbox regression test.

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

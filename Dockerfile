# syntax=docker/dockerfile:1.7
#
# Isolated sandbox for this repository. The host checkout is an editing surface
# only: lint, typecheck, tests, builds, installers, and pack inspection run here
# inside a container. Network is limited to the toolchain/dependency stage before
# source is copied; every project-code stage runs with --network=none and a
# container-only DSH_HOME. No host bind mounts, $HOME, profile, or credential
# files are used; the source is copied via the Docker context.
#
# Targets: lockfile, check-next, check, inspect, artifacts, package,
# isolated-install, verify.

ARG NODE_VERSION=22.19.0

FROM node:${NODE_VERSION}-bookworm-slim AS toolchain
ENV CI=1 \
	DSH_HOME=/tmp/dsh-sandbox-home \
	NPM_CONFIG_UPDATE_NOTIFIER=false
RUN npm install --global pnpm@11.21.0
WORKDIR /workspace
RUN mkdir -p "${DSH_HOME}" && chown -R node:node /workspace "${DSH_HOME}"
USER node

# Regenerate pnpm-lock.yaml from package.json when dependencies change.
# Export with: docker build --target lockfile --output type=local,dest=output/docker-lockfile .
FROM toolchain AS lockfile-build
COPY --chown=node:node package.json pnpm-workspace.yaml ./
COPY --chown=node:node pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile \
	&& mkdir -p /tmp/export \
	&& cp pnpm-lock.yaml /tmp/export/pnpm-lock.yaml

FROM scratch AS lockfile
COPY --from=lockfile-build /tmp/export/ /

# Dependency stage: frozen lockfile only (after lockfile target has been reviewed).
FROM toolchain AS dependencies
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS source
COPY --chown=node:node . .

# Fast development loop: lint + typecheck + next build + tests. Does not promote lib/.
FROM source AS check-next
RUN --network=none pnpm run check:next

# Full repository gate: lint + release build (promotes lib only in-image) + tests.
FROM source AS check
RUN --network=none cp -a lib /tmp/committed-lib \
	&& rm -rf lib \
	&& cp -a /tmp/committed-lib lib \
	&& pnpm run check

# In-image release build; export rebuilt lib/ for host review before replace.
FROM source AS artifacts-build
RUN --network=none cp -a lib /tmp/committed-lib \
	&& rm -rf lib \
	&& cp -a /tmp/committed-lib lib \
	&& pnpm run release:build \
	&& mkdir -p /tmp/export \
	&& cp -a lib /tmp/export/lib

FROM scratch AS artifacts
COPY --from=artifacts-build /tmp/export/ /

FROM source AS inspect
RUN --network=none pnpm run release:inspect

FROM source AS package-build
RUN --network=none cp -a lib /tmp/committed-lib \
	&& rm -rf lib \
	&& cp -a /tmp/committed-lib lib \
	&& pnpm run release:pack \
	&& mkdir -p /tmp/export \
	&& cp output/*.tgz /tmp/export/

FROM scratch AS package
COPY --from=package-build /tmp/export/ /

FROM source AS isolated-install
RUN --network=none cp -a lib /tmp/committed-lib \
	&& rm -rf lib \
	&& cp -a /tmp/committed-lib lib \
	&& pnpm run release:pack \
	&& mkdir -p /tmp/consumer \
	&& printf '{"name":"dsh-hub-oauth-gateway-sandbox-consumer","private":true,"type":"module"}\n' > /tmp/consumer/package.json \
	&& cd /tmp/consumer \
	&& pnpm add --offline --ignore-scripts --config.auto-install-peers=false /workspace/output/dsh-hub-oauth-gateway-*.tgz \
	&& node -e 'const fs = require("node:fs"); const path = require("node:path"); const root = require("/workspace/package.json"); for (const name of Object.keys(root.peerDependencies)) { if (name === "@deepseek-ai/dsh-tools") continue; const source = path.join("/workspace/node_modules", name); const target = path.join("/tmp/consumer/node_modules", name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.rmSync(target, { recursive: true, force: true }); fs.symlinkSync(source, target, "dir"); }' \
	&& node --input-type=module -e 'const plugin = await import("dsh-hub-oauth-gateway"); if (typeof plugin.apply !== "function") process.exit(1)' \
	&& node node_modules/dsh-hub-oauth-gateway/lib/bin.js --help \
	&& node --input-type=module -e 'const value = await import("dsh-hub-oauth-gateway/invariant"); if (typeof value !== "object") process.exit(1)'

# Full gate: repository check + exact lib/ reproducibility + release inspection.
FROM source AS verify
RUN --network=none cp -a lib /tmp/committed-lib \
	&& rm -rf lib \
	&& cp -a /tmp/committed-lib lib \
	&& pnpm run check \
	&& node build/compare-trees.mjs /tmp/committed-lib lib \
	&& pnpm run release:inspect

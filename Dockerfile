# syntax=docker/dockerfile:1.7
#
# Isolated sandbox for this repository. The host checkout is an editing surface
# only: lint, typecheck, tests, builds, installers, and pack inspection run here.
# Network is limited to toolchain/dependency/lockfile stages before source is
# copied. Project-code stages use RUN --network=none and a container-only
# DSH_HOME. Do not bind-mount the checkout, $HOME, credentials, or the Docker
# socket. Export generated trees with BuildKit --output type=local under output/.

ARG NODE_VERSION=22.19.0

FROM node:${NODE_VERSION}-bookworm-slim AS toolchain
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	npm_config_registry=${NPM_REGISTRY} \
	PNPM_HOME=/usr/local/share/pnpm \
	PATH="/usr/local/share/pnpm:${PATH}" \
	DSH_HOME=/tmp/dsh-home
WORKDIR /app
RUN corepack enable \
	&& corepack prepare pnpm@11.21.0 --activate \
	&& mkdir -p "${DSH_HOME}"

FROM toolchain AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS source
COPY biome.json vitest.config.ts \
	tsconfig.json tsconfig.base.json tsconfig.build.json tsconfig.client.json tsconfig.host.json ./
COPY src ./src
COPY tests ./tests
COPY build ./build
COPY scripts ./scripts
COPY lib ./lib
COPY cordis.patch.yml README.md CHANGELOG.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md LICENSE ./
COPY docs ./docs

# Fast development loop: lint + typecheck + next build + tests. Does not promote lib/.
FROM source AS check
RUN --network=none pnpm run check:next

# In-container release build (promotes lib/ only inside this image).
FROM source AS built
RUN --network=none pnpm run release:build

FROM built AS inspect
RUN --network=none pnpm run release:inspect

FROM scratch AS artifacts
COPY --from=built /app/lib /lib

# Full gate: repository check + release inspect + exact lib/ reproducibility.
FROM source AS verify
RUN --network=none \
	cp -a lib /tmp/committed-lib \
	&& pnpm run check \
	&& pnpm run release:inspect \
	&& node build/compare-trees.mjs /tmp/committed-lib lib

FROM built AS package-build
RUN --network=none pnpm run release:pack

FROM scratch AS package
COPY --from=package-build /app/output/dsh-hub-oauth-gateway-1.1.0.tgz /dsh-hub-oauth-gateway-1.1.0.tgz

# Export the resolved lockfile. Use --build-arg LOCKFILE_UPDATE=1 to refresh it.
FROM toolchain AS lockfile-build
ARG LOCKFILE_UPDATE=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN if [ "${LOCKFILE_UPDATE}" = "1" ]; then \
		pnpm install --no-frozen-lockfile; \
	else \
		pnpm install --frozen-lockfile; \
	fi

FROM scratch AS lockfile
COPY --from=lockfile-build /app/pnpm-lock.yaml /pnpm-lock.yaml

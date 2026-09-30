# syntax=docker/dockerfile:1
# Builds the scope and its server, and serves them over https next to docker-tar1090; see
# README.md, Deployment.
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY scope/package.json scope/bun.lock ./
# Caches that outlive the build, so a rebuild fetches and compiles only what changed.
RUN --mount=type=cache,target=/cache/bun \
    BUN_INSTALL_CACHE_DIR=/cache/bun bun install --frozen-lockfile
COPY proto/ /proto/
COPY scope/ ./
RUN bun run build

FROM rust:1.98-alpine AS server
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY proto/ proto/
COPY crates/ crates/
# The target cache is not part of the image, so the binary is copied out of it.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked && cp target/release/papaquebec /papaquebec

FROM oven/bun:1-alpine
# The server ignores the signal to stop as the first process, so tini is that instead.
RUN apk add --no-cache tini
COPY --from=server /papaquebec /usr/bin/papaquebec
WORKDIR /app
COPY scope/package.json ./
COPY scope/scripts/build-coast.ts scope/scripts/build-aero.ts scope/scripts/site.ts scope/scripts/guards.ts scope/scripts/countries.ts scope/scripts/countries.json scope/scripts/openaip.ts ./scripts/
COPY --from=build /app/dist ./dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN mkdir -p public/map
# The server keeps its certificate authority under /data, which a volume should keep.
ENV PQ_TAR1090=http://tar1090 PQ_FEED_PORT=443 XDG_DATA_HOME=/data
EXPOSE 443 443/udp
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]

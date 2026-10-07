# syntax=docker/dockerfile:1
# Builds the scope and its server, and serves them over https next to a receiver; see
# README.md, Deployment.
FROM rust:1.98-alpine AS server
RUN apk add --no-cache musl-dev && rustup target add wasm32-unknown-unknown
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY proto/ proto/
COPY crates/ crates/
# The target cache is not part of the image, so the binary and the placer's bindings are copied
# out of it. The wasm-bindgen CLI is the version the placer crate is locked to.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo install wasm-bindgen-cli --locked \
      --version "$(sed -n '/^name = "wasm-bindgen"$/{n;s/^version = "\(.*\)"$/\1/p;}' Cargo.lock)" --target-dir /src/target/tools \
    && cargo build --release --locked && cp target/release/papaquebec /papaquebec \
    && cargo build --profile wasm -p placer --target wasm32-unknown-unknown --locked \
    && wasm-bindgen --target web --out-dir /wasm target/wasm32-unknown-unknown/wasm/placer.wasm

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY scope/package.json scope/bun.lock ./
# Caches that outlive the build, so a rebuild fetches and compiles only what changed.
RUN --mount=type=cache,target=/cache/bun \
    BUN_INSTALL_CACHE_DIR=/cache/bun bun install --frozen-lockfile
COPY proto/ /proto/
COPY scope/ ./
COPY --from=server /wasm ./src/render/layout/wasm
RUN bun run build

FROM oven/bun:1-alpine
# The server ignores the signal to stop as the first process, so tini is that instead; it
# downloads the aircraft database over https, by the certificates the system trusts.
RUN apk add --no-cache tini ca-certificates
COPY --from=server /papaquebec /usr/bin/papaquebec
WORKDIR /app
COPY scope/package.json ./
COPY scope/scripts/build-coast.ts scope/scripts/build-aero.ts scope/scripts/site.ts scope/scripts/guards.ts scope/scripts/countries.ts scope/scripts/countries.json scope/scripts/openaip.ts ./scripts/
COPY --from=build /app/dist ./dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN mkdir -p public/map
# The server keeps its certificate authority and the aircraft database under /data, which a
# volume should keep.
ENV XDG_DATA_HOME=/data
EXPOSE 443 4433/udp
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]

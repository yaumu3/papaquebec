# syntax=docker/dockerfile:1
# Builds the scope and its server, and serves them over https next to docker-tar1090; see
# README.md, Deployment.
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY scope/package.json scope/bun.lock ./
RUN bun install --frozen-lockfile
COPY proto/ /proto/
COPY scope/ ./
RUN bun run build

FROM rust:1.98-alpine AS server
RUN apk add --no-cache musl-dev
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY proto/ proto/
COPY feeder/ feeder/
COPY web/ web/
RUN cargo build --release --locked

FROM oven/bun:1-alpine
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy
COPY --from=server /src/target/release/papaquebec /usr/bin/papaquebec
WORKDIR /app
COPY scope/package.json ./
COPY scope/scripts/build-coast.ts scope/scripts/build-aero.ts scope/scripts/site.ts scope/scripts/guards.ts scope/scripts/countries.ts scope/scripts/countries.json scope/scripts/openaip.ts ./scripts/
COPY --from=build /app/dist ./dist
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/entrypoint.sh /entrypoint.sh
RUN mkdir -p public/map public/feed
ENV PQ_TAR1090=http://tar1090 XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
EXPOSE 443 443/udp 4433/udp
ENTRYPOINT ["/entrypoint.sh"]

#!/bin/sh
# Generates the map data around the receiver reported by tar1090, then serves the scope.
cd /app || exit 1
for _ in $(seq 1 30); do
    wget -q -O /dev/null "$PQ_TAR1090/data/receiver.json" && break
    echo "waiting for $PQ_TAR1090"
    sleep 2
done
bun scripts/build-coast.ts || echo "coastline not generated" >&2
bun scripts/build-aero.ts || echo "aeronautical data not generated" >&2
exec caddy run --config /etc/caddy/Caddyfile

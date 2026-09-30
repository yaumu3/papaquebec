#!/bin/sh
# Generates the map data around the receiver, or around the sim that stands in for it, then
# serves the scope and its feed.
cd /app || exit 1
# The sim flies whenever its site is set, whatever the receiver's is.
site="${PQ_SIM:-$PQ_SITE}"
PQ_SITE="$site" bun scripts/build-coast.ts || echo "coastline not generated" >&2
PQ_SITE="$site" bun scripts/build-aero.ts || echo "aeronautical data not generated" >&2
exec papaquebec

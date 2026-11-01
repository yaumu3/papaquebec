#!/bin/sh
# Runs scripts/visual/main.ts on the built scope in the pinned image, with Apple's container where it
# is installed and Docker elsewhere. Arguments go to the script: --update rewrites the baselines.
set -eu
cd "$(dirname "$0")/../.."

IMAGE=papaquebec-visual
RUNTIME=$(command -v container || command -v docker)

context=$(mktemp -d)
trap 'rm -rf "$context"' EXIT
cp package.json bun.lock visual/Dockerfile "$context"
"$RUNTIME" build --tag "$IMAGE" --file "$context/Dockerfile" "$context"

"$RUNTIME" run --rm --memory 4g \
  --volume "$PWD/dist:/app/dist" \
  --volume "$PWD/schema:/app/schema" \
  --volume "$PWD/scripts:/app/scripts" \
  --volume "$PWD/src:/app/src" \
  --volume "$PWD/visual:/app/visual" \
  "$IMAGE" bun scripts/visual/main.ts "$@"

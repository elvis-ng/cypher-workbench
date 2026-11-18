#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output=$($root/scripts/verify-pinned-source.sh "$root")
case "$output" in
  *"structure and provenance checks passed"*) exit 0 ;;
  *) echo "unexpected verifier output" >&2; exit 1 ;;
esac

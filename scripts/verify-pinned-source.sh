#!/bin/sh
set -eu

root=${1:?usage: verify-pinned-source.sh <workbench-root>}
revision=77534a68526971ba9ef5b2e77b6e6aeb0ace8a24
archive_sha256=d2a35af2493f6802878fc77d0d293b338f9f292a6512e70f3065dee8b3901f9c
[ -f "$root/api/package-lock.json" ] || { echo "missing pinned API lockfile" >&2; exit 1; }
[ -f "$root/ui/package-lock.json" ] || { echo "missing pinned UI lockfile" >&2; exit 1; }
[ -f "$root/LICENSE" ] || { echo "missing upstream LICENSE" >&2; exit 1; }
[ -f "$root/LABS_DISCLAIMER.txt" ] || { echo "missing upstream disclaimer" >&2; exit 1; }
[ -f "$root/api/src/index.js" ] || { echo "missing API source" >&2; exit 1; }
[ -f "$root/ui/public/index.html" ] || { echo "missing UI entrypoint" >&2; exit 1; }
[ -f "$root/api/src/security/operationGate.js" ] || { echo "missing operation gate" >&2; exit 1; }
[ -f "$root/api/src/security/operationGate.test.js" ] || { echo "missing operation gate test" >&2; exit 1; }

# These controls are prerequisites, not proof of complete native adaptation.
! grep -q 'SEGMENT_WRITE_KEY\|cdn.segment.com\|use.fontawesome.com\|fonts.googleapis.com' "$root/api/src/index.js" "$root/ui/public/index.html"
grep -q 'AUTH_METHOD=proxy' "$root/api/Dockerfile"
grep -q 'HOST_NAME=127.0.0.1' "$root/api/Dockerfile"
grep -q 'GRAPHQL_LISTEN_PORT=4000' "$root/api/Dockerfile"
grep -q 'listen 127.0.0.1:9080' "$root/ui/nginx.conf"
for image_root in "$root/api" "$root/ui"; do
  manifest="$image_root/provenance/source-manifest.sha256"
  [ -f "$manifest" ] || { echo "missing provenance manifest: $manifest" >&2; exit 1; }
  grep -qx "ARCHIVE_SHA256 $archive_sha256" "$manifest" || { echo "archive hash mismatch: $manifest" >&2; exit 1; }
  grep -qx "REVISION $revision" "$manifest" || { echo "revision mismatch: $manifest" >&2; exit 1; }
  while read -r kind hash path; do
    case "$kind" in ARCHIVE_SHA256|REVISION) continue;; esac
    [ -n "$path" ] || { echo "malformed provenance entry: $manifest" >&2; exit 1; }
    [ "$kind" = UPSTREAM ] || [ "$kind" = ADAPTED ] || { echo "invalid provenance kind: $kind" >&2; exit 1; }
    actual=$(shasum -a 256 "$image_root/$path" | cut -d' ' -f1)
    [ "$actual" = "$hash" ] || { echo "source hash mismatch: $image_root/$path" >&2; exit 1; }
  done < "$manifest"
done
printf '%s\n' "pinned-source structure and provenance checks passed ($revision, archive $archive_sha256)"

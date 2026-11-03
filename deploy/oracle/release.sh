#!/usr/bin/env bash
set -euo pipefail
umask 077
deployment_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$deployment_dir"
revision="${1:?Provide the full release commit}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release commit' >&2; exit 1; }
archive="${2:?Provide the release archive path}"
archive="$(realpath -- "$archive")"
[[ -f "$archive.sha256" ]] || { echo 'Missing release archive checksum' >&2; exit 1; }
(cd "$(dirname -- "$archive")" && sha256sum --check "$(basename -- "$archive").sha256")
image="rice-inventory:${revision:0:7}"
docker load --input "$archive"
actual="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image")"
[[ "$actual" == "$revision" ]] || { echo 'Image revision differs' >&2; exit 1; }

# Share the nightly backup's lock. Rollback changes only the app, never the DB.
exec 9>backup.lock
flock 9
bash ./backup.sh
previous=".env.before-release-$(date -u +%Y%m%dT%H%M%SZ)"
cp -- .env "$previous"
sed -i -e "s/^APP_IMAGE=.*/APP_IMAGE=$image/" \
  -e "s/^APP_REVISION=.*/APP_REVISION=$revision/" -e '/^OPENROUTER_/d' .env
restore_previous() {
  cp -- "$previous" .env
  docker compose --env-file .env -f compose.yml up -d --no-deps backend
}
if ! docker compose --env-file .env -f compose.yml up -d --no-deps backend; then
  restore_previous
  echo 'Release startup failed; previous application restored. Database retained.' >&2
  exit 1
fi
for attempt in $(seq 1 60); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:5056/api/health | \
    python3 -c 'import json,sys; h=json.load(sys.stdin); sys.exit(0 if h.get("status")=="OK" and h.get("revision")==sys.argv[1] else 1)' "$revision" 2>/dev/null; then
    printf '%s\n' "$revision" > current-release
    echo "Oracle release healthy: $revision"
    exit 0
  fi
  sleep 1
done
restore_previous
echo 'Release failed health checks; previous application restored. Database retained.' >&2
exit 1

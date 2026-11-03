#!/usr/bin/env bash
set -euo pipefail
umask 077
deployment_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$deployment_dir"
mkdir -p backups
archive="$deployment_dir/backups/rice-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env -f compose.yml exec -T db \
  pg_dump -U riceapp -d rice_inventory --format=custom --no-owner --no-acl > "$archive"
app_id="$(docker compose --env-file .env -f compose.yml ps -q app)"
image="$(docker inspect --format '{{.Config.Image}}' "$app_id")"
revision="$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$app_id")"
docker run --rm --env-file .env.backup --env "APP_REVISION=$revision" \
  --mount "type=bind,source=$archive,target=/backup/database.dump,readonly" \
  "$image" node scripts/upload-oracle-backup.js /backup/database.dump
sha256sum "$archive"

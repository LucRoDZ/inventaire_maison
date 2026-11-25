#!/usr/bin/env bash
# Dumps the PostgreSQL database to backups/ (gzip) and keeps the newest N dumps.
#
# Usage: scripts/backup-db.sh
# Environment:
#   BACKUP_DIR   target directory           (default: <repo>/backups)
#   BACKUP_KEEP  number of dumps to keep    (default: 14)
#
# Exit 0 without a dump when the db service is not running yet (first deployment);
# exit 1 when Docker Compose cannot be queried.
set -euo pipefail
# Dumps contain password hashes: readable by the owner only (directory 700, files 600).
umask 077

cd "$(dirname "${BASH_SOURCE[0]}")/.."

backup_dir="${BACKUP_DIR:-backups}"
keep="${BACKUP_KEEP:-14}"

if ! [[ "$keep" =~ ^[1-9][0-9]*$ ]]; then
  echo "backup-db : BACKUP_KEEP doit être un entier positif (reçu « $keep »)." >&2
  exit 2
fi

# A failing `docker compose ps` is an error, not a stopped database: deploy.sh must not go on
# without a backup. Only a successful listing without `db` skips the dump (first deployment).
if ! running="$(docker compose ps --status running --services)"; then
  echo "backup-db : impossible d'interroger Docker Compose, sauvegarde non faite." >&2
  exit 1
fi
if ! grep -qx 'db' <<<"$running"; then
  echo "backup-db : la base ne tourne pas, sauvegarde ignorée."
  exit 0
fi

mkdir -p "$backup_dir"
stamp="$(date +%Y%m%d-%H%M%S)"
target="$backup_dir/inventaire-$stamp.sql.gz"
tmp="$target.partial"
trap 'rm -f "$tmp"' EXIT

# The container reads its own credentials: nothing secret is passed on the command line.
# --no-privileges: the dump does not depend on the runtime role; the API grants its privileges
# again at every start.
docker compose exec -T db sh -c 'pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$tmp"

if ! gzip -t "$tmp" || [ ! -s "$tmp" ]; then
  echo "backup-db : la sauvegarde est vide ou corrompue." >&2
  exit 1
fi
mv "$tmp" "$target"
trap - EXIT
echo "backup-db : $target ($(du -h "$target" | cut -f1))"

# Rotation: names sort chronologically, keep the newest $keep.
mapfile -t dumps < <(find "$backup_dir" -maxdepth 1 -name 'inventaire-*.sql.gz' -printf '%f\n' | sort)
excess=$(( ${#dumps[@]} - keep ))
if (( excess > 0 )); then
  for old in "${dumps[@]:0:excess}"; do
    rm -f -- "$backup_dir/$old"
    echo "backup-db : ancienne sauvegarde supprimée ($old)"
  done
fi

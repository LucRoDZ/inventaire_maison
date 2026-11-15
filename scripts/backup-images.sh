#!/usr/bin/env bash
# Archives the `images` volume (product thumbnails) to backups/ (tar.gz) and keeps the newest N.
#
# Usage: scripts/backup-images.sh
# Environment:
#   BACKUP_DIR   target directory            (default: <repo>/backups)
#   BACKUP_KEEP  number of archives to keep  (default: 14)
#
# The archive is read through the api container, which mounts the volume: no volume name to guess.
# Exit 0 without an archive when the api service is not running yet (first deployment);
# exit 1 when Docker Compose cannot be queried.
set -euo pipefail
# Archives are private: readable by the owner only (directory 700, files 600), like the dumps.
umask 077

cd "$(dirname "${BASH_SOURCE[0]}")/.."

backup_dir="${BACKUP_DIR:-backups}"
keep="${BACKUP_KEEP:-14}"

if ! [[ "$keep" =~ ^[1-9][0-9]*$ ]]; then
  echo "backup-images : BACKUP_KEEP doit être un entier positif (reçu « $keep »)." >&2
  exit 2
fi

if ! running="$(docker compose ps --status running --services)"; then
  echo "backup-images : impossible d'interroger Docker Compose, sauvegarde non faite." >&2
  exit 1
fi
if ! grep -qx 'api' <<<"$running"; then
  echo "backup-images : l'API ne tourne pas, sauvegarde ignorée."
  exit 0
fi

mkdir -p "$backup_dir"
stamp="$(date +%Y%m%d-%H%M%S)"
target="$backup_dir/images-$stamp.tar.gz"
tmp="$target.partial"
trap 'rm -f "$tmp"' EXIT

docker compose exec -T api tar -czf - -C /data/images . > "$tmp"

if [ ! -s "$tmp" ] || ! tar -tzf "$tmp" >/dev/null; then
  echo "backup-images : l'archive est vide ou corrompue." >&2
  exit 1
fi
mv "$tmp" "$target"
trap - EXIT
echo "backup-images : $target ($(du -h "$target" | cut -f1))"

# Rotation: names sort chronologically, keep the newest $keep.
mapfile -t archives < <(find "$backup_dir" -maxdepth 1 -name 'images-*.tar.gz' -printf '%f\n' | sort)
excess=$(( ${#archives[@]} - keep ))
if (( excess > 0 )); then
  for old in "${archives[@]:0:excess}"; do
    rm -f -- "$backup_dir/$old"
    echo "backup-images : ancienne archive supprimée ($old)"
  done
fi

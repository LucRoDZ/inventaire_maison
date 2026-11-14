#!/usr/bin/env bash
# Checks scripts/backup-db.sh against the running db service: a dump is created and the rotation keeps 14.
# Requires `docker compose up -d --wait` beforehand.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
export BACKUP_DIR="$dir"

fail() { echo "test-backup-db : ÉCHEC : $*" >&2; exit 1; }

# 1. A dump is created, is valid gzip and contains the schema.
scripts/backup-db.sh
mapfile -t files < <(find "$dir" -name 'inventaire-*.sql.gz')
[ "${#files[@]}" -eq 1 ] || fail "1 fichier attendu, ${#files[@]} trouvés"
gzip -t "${files[0]}" || fail "archive invalide"
zcat "${files[0]}" | grep -q 'CREATE TABLE public.products' || fail "le schéma est absent de la sauvegarde"

# 2. Rotation: with 16 older dumps present, only the 14 newest remain.
rm -f "${files[0]}"
for day in $(seq -w 1 16); do
  touch "$dir/inventaire-200001$day-000000.sql.gz"
done
scripts/backup-db.sh
count="$(find "$dir" -name 'inventaire-*.sql.gz' | wc -l)"
[ "$count" -eq 14 ] || fail "14 fichiers attendus après rotation, $count trouvés"
[ ! -e "$dir/inventaire-20000101-000000.sql.gz" ] || fail "la plus ancienne sauvegarde devait être supprimée"
newest="$(find "$dir" -name 'inventaire-*.sql.gz' -printf '%f\n' | sort | tail -n 1)"
[[ "$newest" != inventaire-2000* ]] || fail "la nouvelle sauvegarde manque"

echo "test-backup-db : OK"

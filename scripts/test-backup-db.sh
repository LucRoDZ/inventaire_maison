#!/usr/bin/env bash
# Checks scripts/backup-db.sh against the running db service: a dump is created (mode 600), the
# rotation keeps 14, a Docker Compose error fails, a stopped database is skipped.
# Requires `docker compose up -d --wait` beforehand.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
export BACKUP_DIR="$dir"

fail() { echo "test-backup-db : ÉCHEC : $*" >&2; exit 1; }

# 1. A dump is created, is valid gzip, readable by its owner only (600) and contains the schema.
scripts/backup-db.sh
mapfile -t files < <(find "$dir" -name 'inventaire-*.sql.gz')
[ "${#files[@]}" -eq 1 ] || fail "1 fichier attendu, ${#files[@]} trouvés"
gzip -t "${files[0]}" || fail "archive invalide"
mode="$(stat -c '%a' "${files[0]}")"
[ "$mode" = "600" ] || fail "droits $mode sur la sauvegarde, 600 attendus"
# No grep -q: it would close the pipe early and zcat could die of SIGPIPE (pipefail) on a big dump.
zcat "${files[0]}" | grep 'CREATE TABLE public.products' >/dev/null || fail "le schéma est absent de la sauvegarde"

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

# 3. A failing `docker compose ps` stops the script with an error instead of skipping the dump.
if COMPOSE_FILE=/nonexistent/docker-compose.yml scripts/backup-db.sh >/dev/null 2>&1; then
  fail "une erreur de docker compose doit faire échouer la sauvegarde"
fi

# 4. A project whose db is not running: the dump is skipped, exit 0.
out="$(COMPOSE_PROJECT_NAME=inv-backup-test-absent scripts/backup-db.sh)" || fail "base absente : code de sortie non nul"
[[ "$out" == *"sauvegarde ignorée"* ]] || fail "base absente : message attendu, reçu « $out »"

echo "test-backup-db : OK"

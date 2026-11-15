#!/usr/bin/env bash
# Proves the backup is usable: dump the database, restore it into an empty database, compare the
# row count of every table; also checks the images archive, the 600 mode of every archive, the
# refusal to restore over data and the effect of --force.
# Requires `docker compose up -d --wait` beforehand.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

dir="$(mktemp -d)"
scratch="inv_restore_test"
cleanup() {
  docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "drop database if exists inv_restore_test"' >/dev/null 2>&1 || true
  rm -rf "$dir"
}
trap cleanup EXIT
export BACKUP_DIR="$dir"

fail() { echo "test-backup-restore : ÉCHEC : $*" >&2; exit 1; }

# psql in the db container: $1 = database, $2 = SQL.
sql() {
  docker compose exec -T db sh -c 'PGOPTIONS="-c client_min_messages=warning" psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$0" -c "$1"' "$1" "$2"
}
app_db="$(docker compose exec -T db sh -c 'printf %s "$POSTGRES_DB"')"

# "table=count" lines for every table of the public schema, sorted.
counts() {
  local db="$1" table
  while IFS= read -r table; do
    [ -n "$table" ] || continue
    printf '%s=%s\n' "$table" "$(sql "$db" "select count(*) from public.\"$table\"")"
  done < <(sql "$db" "select tablename from pg_tables where schemaname = 'public' order by 1")
}

# 1. Backups: a database dump and an images archive, after putting a file in the volume.
docker compose exec -T api sh -c 'echo backup-test > /data/images/backup-test.txt'
scripts/backup-db.sh
scripts/backup-images.sh
dump="$(find "$dir" -name 'inventaire-*.sql.gz' | head -n 1)"
archive="$(find "$dir" -name 'images-*.tar.gz' | head -n 1)"
[ -n "$dump" ] || fail "pas de sauvegarde de la base"
[ -n "$archive" ] || fail "pas d'archive des images"
tar -tzf "$archive" | grep 'backup-test.txt' >/dev/null || fail "le fichier d'essai manque dans l'archive des images"
docker compose exec -T api rm -f /data/images/backup-test.txt

# 2. Every archive is private (600) and so is the directory (700).
while IFS= read -r f; do
  mode="$(stat -c '%a' "$f")"
  [ "$mode" = "600" ] || fail "droits $mode sur $(basename "$f"), 600 attendus"
done < <(find "$dir" -type f)

# 3. Images rotation: 16 older archives, only the 14 newest remain.
rm -f "$archive"
for day in $(seq -w 1 16); do touch "$dir/images-200001$day-000000.tar.gz"; done
scripts/backup-images.sh >/dev/null
count="$(find "$dir" -name 'images-*.tar.gz' | wc -l)"
[ "$count" -eq 14 ] || fail "14 archives d'images attendues après rotation, $count trouvées"

# 4. Restore into an empty database: the same rows, table by table.
sql postgres "drop database if exists $scratch" >/dev/null
sql postgres "create database $scratch" >/dev/null
RESTORE_DB="$scratch" scripts/restore-db.sh "$dump"
expected="$(counts "$app_db")"
restored="$(counts "$scratch")"
[ -n "$expected" ] || fail "aucune table dans la base source"
[ "$expected" = "$restored" ] || fail "les nombres de lignes diffèrent :
$(diff <(echo "$expected") <(echo "$restored") || true)"
grep -E '^(categories|users)=[1-9]' <<<"$restored" >/dev/null || fail "la base restaurée est vide"

# 5. Restoring over data is refused; --force replaces it.
if RESTORE_DB="$scratch" scripts/restore-db.sh "$dump" >/dev/null 2>&1; then
  fail "la restauration sur une base non vide doit être refusée"
fi
sql "$scratch" "truncate public.categories cascade" >/dev/null
RESTORE_DB="$scratch" scripts/restore-db.sh --force "$dump" >/dev/null
[ "$expected" = "$(counts "$scratch")" ] || fail "--force n'a pas rétabli les données"

echo "test-backup-restore : OK"

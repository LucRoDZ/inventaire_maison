#!/usr/bin/env bash
# Restores a dump made by scripts/backup-db.sh into the PostgreSQL database.
#
# Usage: scripts/restore-db.sh [--force] <backups/inventaire-AAAAMMJJ-HHMMSS.sql.gz>
# Environment:
#   RESTORE_DB  target database (default: the application database, POSTGRES_DB of the container)
#
# A target that already holds data is refused, unless --force: then its content is erased first.
# Stop the api before restoring the live database (`docker compose stop api`), start it after.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

force=0
file=""
for arg in "$@"; do
  case "$arg" in
    --force) force=1 ;;
    -*) echo "restore-db : option inconnue « $arg »." >&2; exit 2 ;;
    *) file="$arg" ;;
  esac
done
if [ -z "$file" ]; then
  echo "Usage : scripts/restore-db.sh [--force] <fichier.sql.gz>" >&2
  exit 2
fi
if [ ! -f "$file" ] || ! gzip -t "$file" 2>/dev/null; then
  echo "restore-db : « $file » n'est pas une archive gzip lisible." >&2
  exit 1
fi

# Runs a statement in the db container with its own credentials; $1 = database, $2 = SQL.
sql() {
  docker compose exec -T db sh -c 'PGOPTIONS="-c client_min_messages=warning" psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$0" -c "$1"' "$1" "$2"
}

target="${RESTORE_DB:-$(docker compose exec -T db sh -c 'printf %s "$POSTGRES_DB"')}"

# Non-empty = at least one table of the public schema holds a row.
filled=0
while IFS= read -r table; do
  [ -n "$table" ] || continue
  if [ "$(sql "$target" "select exists(select 1 from public.\"$table\")")" = "t" ]; then
    filled=1
    break
  fi
done < <(sql "$target" "select tablename from pg_tables where schemaname = 'public'")

if [ "$filled" -eq 1 ]; then
  if [ "$force" -ne 1 ]; then
    echo "restore-db : la base « $target » contient déjà des données ; relancez avec --force pour les remplacer." >&2
    exit 1
  fi
  echo "restore-db : --force, le contenu de « $target » est effacé."
fi
if [ "$force" -eq 1 ]; then
  sql "$target" "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public"
fi

# A dump made by another tool may grant privileges to the runtime role: make sure it exists (its
# password and attributes are set by the API at its next start).
sql "$target" "do \$\$ begin create role inventaire_app nologin; exception when duplicate_object then null; end \$\$"

gzip -dc "$file" | docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$0" >/dev/null' "$target"
echo "restore-db : « $file » restaurée dans « $target »."

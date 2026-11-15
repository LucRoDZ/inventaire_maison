#!/usr/bin/env bash
# One-command deployment, run on the server from the repository root.
#
#   ./deploy.sh              back up the database, pull, build, restart, wait for healthchecks
#   ./deploy.sh --no-backup  skip the database dump
#   ./deploy.sh --no-cache   rebuild the images without cache
#
# Safe to run again at any time. Rollback: git checkout <commit> && ./deploy.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
backup=1
build_args=()

usage() {
  sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --no-backup) backup=0 ;;
    --no-cache) build_args+=(--no-cache) ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Option inconnue : $arg" >&2; usage >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
die() { echo "deploy : $*" >&2; exit 1; }

step "1/7 Vérification de l'environnement"
[ -f .env ] || die ".env introuvable : copiez .env.example en .env et remplissez-le."
docker info >/dev/null 2>&1 || die "Docker ne répond pas."
docker compose version >/dev/null 2>&1 || die "Docker Compose est indisponible."

step "2/7 Sauvegarde de la base"
if [ "$backup" -eq 1 ]; then
  scripts/backup-db.sh
else
  echo "Sauvegarde ignorée (--no-backup)."
fi

step "3/7 Mise à jour du code"
if git symbolic-ref -q HEAD >/dev/null; then
  git pull --ff-only
else
  # Rollback (git checkout <commit>): no branch to pull, deploy the checked-out commit as is.
  echo "HEAD détaché sur $(git rev-parse --short HEAD) : retour arrière, pas de git pull."
fi

step "4/7 Construction des images"
docker compose build ${build_args[@]+"${build_args[@]}"}

step "5/7 Démarrage des services"
docker compose up -d --remove-orphans

step "6/7 Attente des healthchecks (${HEALTH_TIMEOUT} s au maximum)"
deadline=$(( SECONDS + HEALTH_TIMEOUT ))
while true; do
  pending=0
  while IFS='|' read -r service state health; do
    [ -n "$service" ] || continue
    if [ "$state" != "running" ] || { [ -n "$health" ] && [ "$health" != "healthy" ]; }; then
      pending=1
    fi
  done < <(docker compose ps -a --format '{{.Service}}|{{.State}}|{{.Health}}')
  [ "$pending" -eq 0 ] && break
  if (( SECONDS >= deadline )); then
    docker compose ps -a
    docker compose logs --tail=40
    die "les services ne sont pas tous sains après ${HEALTH_TIMEOUT} s."
  fi
  sleep 3
done
docker compose ps

step "7/7 Nettoyage des images orphelines"
docker image prune -f

printf '\nDéploiement terminé.\n'

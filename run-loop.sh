#!/usr/bin/env bash
# run-loop.sh : relance Claude Code jusqu'à la fin de TASKS.md.
#
# ATTENTION : ce script utilise --dangerously-skip-permissions.
# À lancer uniquement sur une machine vierge dédiée, sans clé SSH du VPS
# ni token GitHub aux droits larges (un token limité à ce seul dépôt suffit).
#
# Usage :
#   chmod +x run-loop.sh
#   MODEL=opus ./run-loop.sh          # planification, architecture
#   MODEL=sonnet ./run-loop.sh        # exécution courante
# Dans tmux ou screen pour survivre à la fermeture du terminal.

set -u

MODEL="${MODEL:-sonnet}"
MAX_ITERATIONS="${MAX_ITERATIONS:-300}"   # garde-fou contre une boucle infinie
WAIT_LIMIT="${WAIT_LIMIT:-1800}"          # attente après une limite d'usage (secondes)
WAIT_ERROR="${WAIT_ERROR:-60}"            # attente après une autre erreur (secondes)
LOG="${LOG:-run-loop.log}"

PROMPT='Lis CLAUDE.md puis TASKS.md et applique leurs règles. Prends la première tâche non cochée de la phase en cours, implémente-la, vérifie son critère Fin, lance lint, typecheck et tests, commit, coche la case dans TASKS.md, puis continue avec la suivante. Fin de phase : écris "STOP: validation requise" seul sur la dernière ligne de TASKS.md. Tout terminé : écris "ALL DONE" seul sur la dernière ligne. Si une tâche est bloquée, note la commande et l erreur dans la section Problèmes bloquants ; si une tâche suivante en dépend, écris le marqueur d arrêt et arrête-toi, sinon passe à la suivante.'

done_marker() {
  grep -qE "^(ALL DONE|STOP: validation requise)" TASKS.md 2>/dev/null
}

command -v claude >/dev/null 2>&1 || { echo "claude introuvable dans le PATH" >&2; exit 1; }
[ -f TASKS.md ] || { echo "TASKS.md introuvable : lance le script à la racine du dépôt" >&2; exit 1; }

i=0
while ! done_marker; do
  i=$((i + 1))
  if [ "$i" -gt "$MAX_ITERATIONS" ]; then
    echo "$(date '+%F %T') arrêt : $MAX_ITERATIONS itérations atteintes" | tee -a "$LOG"
    exit 2
  fi

  echo "$(date '+%F %T') itération $i (modèle $MODEL)" | tee -a "$LOG"
  out=$(claude -p "$PROMPT" \
    --model "$MODEL" \
    --dangerously-skip-permissions \
    --max-turns 200 2>&1)
  status=$?
  echo "$out" | tail -n 20 >> "$LOG"
  echo "$out" | tail -n 3

  if echo "$out" | grep -qiE "usage limit|limit reached|rate limit|quota|resets"; then
    echo "$(date '+%F %T') limite d'usage atteinte, attente de ${WAIT_LIMIT}s" | tee -a "$LOG"
    sleep "$WAIT_LIMIT"
  elif [ "$status" -ne 0 ]; then
    echo "$(date '+%F %T') erreur (code $status), attente de ${WAIT_ERROR}s" | tee -a "$LOG"
    sleep "$WAIT_ERROR"
  else
    sleep 5
  fi
done

echo "$(date '+%F %T') terminé : $(grep -E '^(ALL DONE|STOP: validation requise)' TASKS.md | head -n 1)" | tee -a "$LOG"
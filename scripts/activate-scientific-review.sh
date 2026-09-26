#!/usr/bin/env bash
set -euo pipefail

CIRC_REVIEW_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$CIRC_REVIEW_ROOT"

for CIRC_REVIEW_COMMAND in node npx python3 gcloud git; do
  if ! command -v "$CIRC_REVIEW_COMMAND" >/dev/null 2>&1; then
    printf 'Falta %s. Execute no terminal do Google Cloud Shell.\n' "$CIRC_REVIEW_COMMAND" >&2
    exit 1
  fi
done
if ! git diff --quiet HEAD -- firestore.rules firebase.json scripts/activate-scientific-review.sh scripts/configure-scientific-review.py; then
  printf 'Use uma cópia limpa da versão validada antes de ativar a avaliação.\n' >&2
  exit 1
fi

gcloud auth print-access-token >/dev/null
printf 'A publicar as regras de avaliação em circ-coimbra.\nVersão: %s\n' "$(git rev-parse HEAD)"
npx --yes firebase-tools@15.30.0 deploy --only firestore:rules --project circ-coimbra --config firebase.json

printf '\nA verificar as regras publicadas e a ativar a avaliação...\n'
python3 scripts/configure-scientific-review.py --activate

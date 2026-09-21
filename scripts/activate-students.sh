#!/usr/bin/env bash
set -euo pipefail

CIRC_STUDENT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$CIRC_STUDENT_ROOT"

for CIRC_STUDENT_COMMAND in node npx python3 gcloud git; do
  if ! command -v "$CIRC_STUDENT_COMMAND" >/dev/null 2>&1; then
    printf 'Falta %s. Execute este script no terminal do Google Cloud Shell.\n' "$CIRC_STUDENT_COMMAND" >&2
    exit 1
  fi
done
if ! git diff --quiet HEAD -- firestore.rules firestore.indexes.json firebase.json; then
  printf 'As regras ou a configuração têm alterações locais. Use uma cópia limpa da versão validada.\n' >&2
  exit 1
fi

printf 'A publicar as regras e os índices de estudantes em circ-coimbra.\n'
printf 'Versão: %s\n' "$(git rev-parse HEAD)"
npx --yes firebase-tools@15.30.0 deploy --only firestore:rules,firestore:indexes --project circ-coimbra --config firebase.json

printf '\nA verificar o resultado no Firebase...\n'
python3 scripts/check-students-deployment.py

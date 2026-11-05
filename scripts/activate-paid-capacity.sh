#!/usr/bin/env bash
set -euo pipefail

CIRC_CAPACITY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$CIRC_CAPACITY_ROOT"
if ! git diff --quiet HEAD -- firestore.rules firebase.json; then
  printf 'Use uma cópia limpa da versão validada das regras.\n' >&2
  exit 1
fi
node -e "const s=require('fs').readFileSync('firestore.rules','utf8'); if(!s.includes('noClientAdmissionIncrease')||!s.includes('circ-2027-paid-capacity-v1')) process.exit(1)"
printf 'A publicar as regras de lotação em circ-coimbra. Versão: %s\n' "$(git rev-parse HEAD)"
npx --yes firebase-tools@15.30.0 deploy --only firestore:rules --project circ-coimbra --config firebase.json

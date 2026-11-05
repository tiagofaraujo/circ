#!/usr/bin/env bash
set -euo pipefail

CIRC_OPENING_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$CIRC_OPENING_ROOT"
if ! git diff --quiet HEAD -- firestore.rules firebase.json scripts/activate-public-opening.sh; then
  printf 'Use uma cópia limpa da versão validada das regras.\n' >&2
  exit 1
fi
node - <<'NODE'
const fs = require('node:fs');
const rules = fs.readFileSync('firestore.rules', 'utf8');
if (!rules.includes('function officialOpeningReached()')
  || !rules.includes('request.time >= timestamp.date(2026, 11, 15)')
  || !rules.includes('allow create: if officialOpeningReached()')
  || !rules.includes('noClientAdmissionIncrease')) process.exit(1);
NODE
printf 'A publicar a abertura de 15/11/2026 às 00h00 de Lisboa em circ-coimbra. Versão: %s\n' "$(git rev-parse HEAD)"
npx --yes firebase-tools@15.30.0 deploy --only firestore:rules --project circ-coimbra --config firebase.json

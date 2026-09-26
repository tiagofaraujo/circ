#!/usr/bin/env python3
"""Verify deployed rules; optionally enable the review module. Never prints credentials."""
import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "circ-coimbra"
RULES_API = "https://firebaserules.googleapis.com/v1/"
CONFIG_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/reviewConfiguration/circ-2027"


def verify_rules(request, source):
    release = request(f"{RULES_API}projects/{PROJECT}/releases/cloud.firestore")
    name = release.get("rulesetName", "")
    if not re.fullmatch(r"projects/(?:circ-coimbra|[0-9]+)/rulesets/[A-Za-z0-9_-]+", name):
        raise ValueError("unexpected-ruleset")
    files = request(RULES_API + name).get("source", {}).get("files", [])
    normalize = lambda text: text.replace("\r\n", "\n").strip()
    if len(files) != 1 or normalize(files[0].get("content", "")) != normalize(source):
        raise ValueError("rules-do-not-match")


def configure(request, activate, source, commit):
    # The enable write can happen only after an exact comparison of the deployed rules.
    verify_rules(request, source)
    if activate:
        payload = {"fields": {
            "enabled": {"booleanValue": True}, "version": {"integerValue": "1"},
            "deployedCommit": {"stringValue": commit},
            "activatedAt": {"timestampValue": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")},
        }}
        mask = "&".join("updateMask.fieldPaths=" + key for key in payload["fields"])
        request(CONFIG_URL + "?" + mask, method="PATCH", payload=payload)
    state = request(CONFIG_URL)
    return state.get("fields", {}).get("enabled", {}).get("booleanValue") is True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--activate", action="store_true", help="Ativar após confirmar as regras; sem esta opção, apenas consulta.")
    args = parser.parse_args()
    try:
        token = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, timeout=40, check=True).stdout.strip()
        if not token or "\n" in token:
            raise ValueError("invalid-authentication")

        def request(url, method="GET", payload=None):
            data = json.dumps(payload).encode() if payload is not None else None
            req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=25) as response:
                return json.load(response)

        commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, timeout=10, check=True).stdout.strip()
        enabled = configure(request, args.activate, (ROOT / "firestore.rules").read_text(), commit)
        if not enabled:
            print("REGRAS VERIFICADAS. O módulo de avaliação ainda não está ativo.")
            return 2
        print("VERIFICADO: regras publicadas e módulo de avaliação ativo em circ-coimbra.")
        print("Entre em https://circ-coimbra.org/admin/avaliacoes para adicionar revisores e atribuir trabalhos.")
        return 0
    except ValueError as error:
        if str(error) == "rules-do-not-match":
            print("As regras publicadas não correspondem à versão local. A avaliação não foi ativada. Execute bash scripts/activate-scientific-review.sh.", file=sys.stderr)
        else:
            print("Não foi possível validar a configuração do projeto. A ativação não foi confirmada.", file=sys.stderr)
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        print("Execute no Google Cloud Shell com a conta que gere o Firebase circ-coimbra e autorize o terminal.", file=sys.stderr)
    except urllib.error.HTTPError as error:
        print(f"A API Google respondeu HTTP {error.code}. Confirme a conta e as permissões no projeto circ-coimbra. A ativação não foi confirmada.", file=sys.stderr)
    except (urllib.error.URLError, TimeoutError, KeyError, TypeError):
        print("Não foi possível confirmar o resultado. Repita python3 scripts/configure-scientific-review.py para consultar o estado.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

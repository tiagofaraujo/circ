#!/usr/bin/env python3
"""Remove stored management roles from the requested CIRC reviewer test account."""
import argparse
import json
import runpy
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "circ-coimbra"
TARGET_EMAIL = "araujotiagofc@gmail.com"
AUTH_URL = f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:lookup"
DOCUMENTS_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
verify_rules = runpy.run_path(str(ROOT / "scripts/configure-scientific-review.py"))["verify_rules"]


def prepare(request, apply, source):
    if TARGET_EMAIL in source:
        raise ValueError("legacy-access-still-present")
    verify_rules(request, source)
    accounts = request(AUTH_URL, method="POST", payload={"email": [TARGET_EMAIL]}).get("users", [])
    if len(accounts) != 1 or accounts[0].get("email", "").lower() != TARGET_EMAIL:
        raise ValueError("account-not-identified")
    uid = accounts[0].get("localId")
    if not isinstance(uid, str) or not uid or "/" in uid or uid in (".", ".."):
        raise ValueError("account-not-identified")
    url = f"{DOCUMENTS_URL}/users/{urllib.parse.quote(uid, safe='')}"
    try:
        profile = request(url)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return True
        raise
    if not profile.get("fields", {}).get("roles", {}).get("mapValue", {}).get("fields"):
        return True
    if not apply:
        return False
    version = profile.get("updateTime")
    if not version:
        raise ValueError("profile-version-missing")
    query = urllib.parse.urlencode({"updateMask.fieldPaths": "roles", "currentDocument.updateTime": version})
    # The explicit mask removes only roles; the version precondition prevents lost updates.
    request(url + "?" + query, method="PATCH", payload={"fields": {}})
    result = request(url)
    return not result.get("fields", {}).get("roles", {}).get("mapValue", {}).get("fields")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Remover apenas as permissões de gestão guardadas no perfil da conta indicada no script.")
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

        if not prepare(request, args.apply, (ROOT / "firestore.rules").read_text()):
            print("A conta ainda tem permissões guardadas. Execute novamente com --apply.")
            return 2
        print(f"VERIFICADO: {TARGET_EMAIL} sem permissões de gestão.")
        print("O perfil, as inscrições e as avaliações foram preservados. O acesso de revisor depende do diretório de revisores.")
        return 0
    except ValueError as error:
        messages = {
            "legacy-access-still-present": "Atualize a cópia de main: esta versão ainda atribui gestão à conta.",
            "rules-do-not-match": "Publique primeiro as regras atualizadas com bash scripts/activate-scientific-review.sh.",
            "account-not-identified": "Não foi possível identificar uma única conta com o email esperado. Nenhuma permissão foi alterada.",
        }
        print(messages.get(str(error), "Não foi possível validar a conta e as permissões. O resultado não foi confirmado."), file=sys.stderr)
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        print("Execute no Google Cloud Shell com a conta que gere circ-coimbra.", file=sys.stderr)
    except urllib.error.HTTPError as error:
        print(f"A API Google respondeu HTTP {error.code}. Confirme as permissões da sessão; se o perfil mudou durante a operação, repita o comando. O resultado não foi confirmado.", file=sys.stderr)
    except (urllib.error.URLError, TimeoutError, KeyError, TypeError):
        print("Não foi possível confirmar o resultado. Repita o comando sem --apply para consultar o estado.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

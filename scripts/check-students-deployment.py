#!/usr/bin/env python3
"""Read-only check of the student release in Cloud Shell. Never prints tokens or documents."""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "circ-coimbra"
RULES_API = "https://firebaserules.googleapis.com/v1/"
FIRESTORE_API = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/collectionGroups/"


def matching_rules(local_source, remote_files):
    # Ignore line-ending differences only; every actual rule must match.
    normalize = lambda text: text.replace("\r\n", "\n").strip()
    return len(remote_files) == 1 and normalize(remote_files[0].get("content", "")) == normalize(local_source)


def index_key(index):
    return (index.get("queryScope"), tuple(
        (field.get("fieldPath"), field.get("order"), field.get("arrayConfig"))
        for field in index.get("fields", []) if field.get("fieldPath") != "__name__"
    ))


def indexes_ready(expected, actual):
    ready = {index_key(index) for index in actual if index.get("state") == "READY"}
    return all(index_key(index) in ready for index in expected)


def proof_index_exemption_ready(field):
    config = field.get("indexConfig")
    # REST omits protobuf booleans whose value is false. An explicit empty
    # indexConfig disables indexes; an absent indexConfig inherits defaults.
    return isinstance(config, dict) and not config.get("indexes") \
        and not config.get("usesAncestorConfig", False) and not config.get("reverting", False)


def main():
    try:
        auth = subprocess.run(
            ["gcloud", "auth", "print-access-token"],
            capture_output=True, text=True, timeout=40, check=True,
        )
        token = auth.stdout.strip()
        if not token or "\n" in token:
            raise ValueError("invalid-token")

        def get(url):
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=20) as response:
                return json.load(response)

        release = get(f"{RULES_API}projects/{PROJECT}/releases/cloud.firestore")
        ruleset_name = release.get("rulesetName", "")
        if not re.fullmatch(r"projects/(?:circ-coimbra|[0-9]+)/rulesets/[A-Za-z0-9_-]+", ruleset_name):
            raise ValueError("unexpected-ruleset")
        ruleset = get(RULES_API + ruleset_name)
        local_rules = (ROOT / "firestore.rules").read_text(encoding="utf-8")
        if not matching_rules(local_rules, ruleset.get("source", {}).get("files", [])):
            print("POR CONCLUIR: as regras publicadas não correspondem a esta versão. Não integrar a PR ainda.")
            return 1
        print("OK: regras publicadas correspondem à versão local, incluindo ULS e estudantes.")

        expected = [index for index in json.loads((ROOT / "firestore.indexes.json").read_text(encoding="utf-8"))["indexes"]
                    if index.get("collectionGroup") == "studentVerifications"]
        if len(expected) != 2:
            raise ValueError("unexpected-local-indexes")
        actual = []
        page_token = ""
        for _ in range(100):
            query = urllib.parse.urlencode({"pageSize": 100, "pageToken": page_token})
            page = get(FIRESTORE_API + "studentVerifications/indexes?" + query)
            actual.extend(page.get("indexes", []))
            page_token = page.get("nextPageToken", "")
            if not page_token:
                break
        else:
            raise ValueError("index-pagination-incomplete")

        field = get(FIRESTORE_API + "studentProofs/fields/%2A")
        ready = indexes_ready(expected, actual)
        exempt = proof_index_exemption_ready(field)
        print("OK: os dois índices dos pedidos estão disponíveis." if ready else
              "A AGUARDAR: os dois índices dos pedidos ainda não estão disponíveis.")
        print("OK: comprovativos excluídos da indexação automática." if exempt else
              "A AGUARDAR: a isenção de índices dos comprovativos ainda não foi confirmada.")
        if not ready or not exempt:
            print("Repita daqui a alguns minutos: python3 scripts/check-students-deployment.py")
            return 2
        print("VERIFICADO: Firebase preparado para a PR de estudantes em circ-coimbra.")
        print("Falta integrar a PR27 em main e testar envio e aprovação com duas contas distintas.")
        return 0
    except FileNotFoundError:
        print("Não foi possível verificar. Execute na cópia do projeto no Cloud Shell, onde existe gcloud.", file=sys.stderr)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        print("Não foi possível obter a sessão Google. Autorize o Cloud Shell com a conta que gere circ-coimbra.", file=sys.stderr)
    except urllib.error.HTTPError as error:
        print(f"Não foi possível verificar: resposta HTTP {error.code} da API Google. Confirme a conta e as permissões no projeto.", file=sys.stderr)
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError):
        print("Não foi possível confirmar o estado remoto. Nenhum dado foi alterado por esta verificação.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

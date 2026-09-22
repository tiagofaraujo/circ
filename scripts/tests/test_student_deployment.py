import importlib.util
import contextlib
import io
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse

spec = importlib.util.spec_from_file_location("deployment", Path(__file__).resolve().parents[1] / "check-students-deployment.py")
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


class DeploymentCheckTests(unittest.TestCase):
    def test_rules_must_match_in_full(self):
        self.assertTrue(deployment.matching_rules("rule one;\nrule two;\n", [{"content": "rule one;\r\nrule two;"}]))
        self.assertFalse(deployment.matching_rules("rule one;\nrule two;", [{"content": "rule one;"}]))
        self.assertFalse(deployment.matching_rules("rule one;", [{"content": "rule one;"}, {"content": "allow everything;"}]))

    def test_building_or_missing_indexes_are_not_ready(self):
        expected = [{"queryScope": "COLLECTION", "fields": [{"fieldPath": "eventId", "order": "ASCENDING"}, {"fieldPath": "updatedAt", "order": "DESCENDING"}]}]
        actual = {**expected[0], "state": "CREATING"}
        self.assertFalse(deployment.indexes_ready(expected, [actual]))
        self.assertFalse(deployment.indexes_ready(expected, []))
        actual["state"] = "READY"
        actual["fields"] = actual["fields"] + [{"fieldPath": "__name__", "order": "DESCENDING"}]
        self.assertTrue(deployment.indexes_ready(expected, [actual]))

    def test_wrong_order_or_scope_is_not_the_required_index(self):
        expected = [{"queryScope": "COLLECTION", "fields": [{"fieldPath": "updatedAt", "order": "DESCENDING"}]}]
        for fields, scope in [([{"fieldPath": "updatedAt", "order": "ASCENDING"}], "COLLECTION"), (expected[0]["fields"], "COLLECTION_GROUP")]:
            self.assertFalse(deployment.indexes_ready(expected, [{"state": "READY", "queryScope": scope, "fields": fields}]))

    def test_proof_exemption_must_be_explicit_and_finished(self):
        for config in [{}, {"indexes": []}, {"usesAncestorConfig": False}]:
            self.assertTrue(deployment.proof_index_exemption_ready({"indexConfig": config}))
        for config in [{"usesAncestorConfig": True}, {"usesAncestorConfig": False, "indexes": [{}]}, {"usesAncestorConfig": False, "reverting": True}]:
            self.assertFalse(deployment.proof_index_exemption_ready({"indexConfig": config}))
        self.assertFalse(deployment.proof_index_exemption_ready({}))


class RemoteVerificationTests(unittest.TestCase):
    def test_listing_respects_firestore_zero_only_page_size(self):
        # Reproduce the production API restriction, not a permissive HTTP mock.
        def firestore_get(url):
            params = parse_qs(urlparse(url).query)
            if params.get("pageSize", ["0"]) != ["0"]:
                raise HTTPError(url, 400, "Invalid page size. Only 0 is supported.", {}, io.BytesIO(b'{}'))
            return {}

        for resource in ["indexes", "fields"]:
            with self.subTest(resource=resource):
                self.assertEqual(deployment.list_admin_resources(firestore_get, resource), [])

    def test_pagination_uses_database_endpoint_and_only_real_page_tokens(self):
        get = Mock(side_effect=[{"indexes": [{"id": 1}], "nextPageToken": "a+b/c="}, {"indexes": [{"id": 2}]}])
        self.assertEqual(deployment.list_admin_resources(get, "indexes"), [{"id": 1}, {"id": 2}])
        first, second = [urlparse(call.args[0]) for call in get.call_args_list]
        self.assertTrue(first.path.endswith("/collectionGroups/-/indexes"))
        self.assertNotIn("pageToken", parse_qs(first.query, keep_blank_values=True))
        self.assertEqual(parse_qs(second.query)["pageToken"], ["a+b/c="])

    def test_field_overrides_use_database_listing_including_every_page(self):
        get = Mock(side_effect=[{"fields": [], "nextPageToken": "next"}, {"fields": [{"name": "proof-exemption"}]}])
        self.assertEqual(deployment.list_admin_resources(get, "fields"), [{"name": "proof-exemption"}])
        for call in get.call_args_list:
            parsed = urlparse(call.args[0])
            self.assertTrue(parsed.path.endswith("/collectionGroups/-/fields"))
            self.assertEqual(parse_qs(parsed.query)["filter"], ["indexConfig.usesAncestorConfig=false"])

    def test_repeated_pagination_token_cannot_report_complete(self):
        get = Mock(return_value={"indexes": [], "nextPageToken": "same"})
        with self.assertRaisesRegex(ValueError, "repeated-page-token"):
            deployment.list_admin_resources(get, "indexes")

    def remote_responses(self, *, state="READY", foreign_indexes=False, foreign_exemption=False):
        local = json.loads((deployment.ROOT / "firestore.indexes.json").read_text())
        indexes = [index for index in local["indexes"] if index["collectionGroup"] == "studentVerifications"]
        prefix = "projects/123456/databases/(default)/collectionGroups/"
        group = "otherCollection" if foreign_indexes else "studentVerifications"
        remote_indexes = [{**index, "name": prefix + group + "/indexes/" + str(i), "state": state} for i, index in enumerate(indexes)]
        proof_group = "otherProofs" if foreign_exemption else "studentProofs"
        return [
            {"rulesetName": "projects/circ-coimbra/rulesets/test-release"},
            {"source": {"files": [{"content": (deployment.ROOT / "firestore.rules").read_text()}]}},
            {"indexes": remote_indexes},
            {"fields": [{"name": prefix + proof_group + "/fields/*", "indexConfig": {}}]},
        ]

    def run_check(self, responses):
        replies = iter(responses)

        def reply(request, **kwargs):
            self.assertEqual(request.get_method(), "GET")
            self.assertNotIn("/documents", request.full_url)
            value = next(replies)
            if isinstance(value, Exception):
                raise value
            return io.BytesIO(json.dumps(value).encode())

        output, errors = io.StringIO(), io.StringIO()
        with patch.object(deployment.subprocess, "run", return_value=SimpleNamespace(stdout="private-test-token")), \
                patch.object(deployment.urllib.request, "urlopen", side_effect=reply), \
                contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            result = deployment.main()
        self.assertNotIn("private-test-token", output.getvalue() + errors.getvalue())
        return result, output.getvalue(), errors.getvalue()

    def test_full_read_only_check_accepts_ready_configuration(self):
        code, output, errors = self.run_check(self.remote_responses())
        self.assertEqual(code, 0)
        self.assertIn("VERIFICADO:", output)
        self.assertEqual(errors, "")

    def test_pending_indexes_or_other_collections_cannot_unlock_release(self):
        for args in [{"state": "CREATING"}, {"foreign_indexes": True}, {"foreign_exemption": True}]:
            with self.subTest(args=args):
                code, output, _ = self.run_check(self.remote_responses(**args))
                self.assertEqual(code, 2)
                self.assertNotIn("VERIFICADO:", output)

    def test_bad_request_identifies_failed_stage_without_blame_or_token(self):
        responses = self.remote_responses()
        responses[-1] = HTTPError("https://firestore.googleapis.com/", 400, "Bad request", {},
                                 io.BytesIO(json.dumps({"error": {"message": "Invalid private-test-token request"}}).encode()))
        code, output, errors = self.run_check(responses)
        self.assertEqual(code, 1)
        self.assertIn("OK: os dois índices", output)
        self.assertIn("consulta da isenção", errors)
        self.assertIn("HTTP 400", errors)
        self.assertNotIn("permissões", errors)
        self.assertNotIn("VERIFICADO:", output)

    def test_authorization_failure_still_reports_permissions(self):
        responses = self.remote_responses()
        responses[2] = HTTPError("https://firestore.googleapis.com/", 403, "Forbidden", {}, io.BytesIO(b'{}'))
        code, _, errors = self.run_check(responses)
        self.assertEqual(code, 1)
        self.assertIn("consulta dos índices", errors)
        self.assertIn("permissões", errors)


if __name__ == "__main__":
    unittest.main()

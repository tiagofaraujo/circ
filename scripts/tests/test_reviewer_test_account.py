import importlib.util
import urllib.error
import urllib.parse
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[1] / "prepare-reviewer-test-account.py"
spec = importlib.util.spec_from_file_location("reviewer_test_account", MODULE)
account = importlib.util.module_from_spec(spec)
spec.loader.exec_module(account)


class ReviewerTestAccountTests(unittest.TestCase):
    def mock(self, accounts=None, roles=True, deployed="new rules", missing=False):
        calls = []
        fields = {"displayName": {"stringValue": "Participante"}}
        if roles:
            fields["roles"] = {"mapValue": {"fields": {"submissions": {"booleanValue": True}, "secretariat": {"booleanValue": True}}}}

        def request(url, method="GET", payload=None):
            calls.append((url, method, payload))
            if "/releases/" in url:
                return {"rulesetName": "projects/circ-coimbra/rulesets/validated"}
            if "/rulesets/" in url:
                return {"source": {"files": [{"content": deployed}]}}
            if url == account.AUTH_URL:
                return {"users": accounts if accounts is not None else [{"email": account.TARGET_EMAIL, "localId": "target-uid"}]}
            if missing:
                raise urllib.error.HTTPError(url, 404, "Missing profile", {}, None)
            if method == "PATCH":
                fields.pop("roles", None)
            return {"fields": fields.copy(), "updateTime": "2026-09-27T08:00:00Z"}
        return request, calls, fields

    def test_removes_only_roles_from_exact_account_and_reads_result(self):
        request, calls, fields = self.mock()
        self.assertTrue(account.prepare(request, True, "new rules"))
        writes = [call for call in calls if call[1] == "PATCH"]
        self.assertEqual(len(writes), 1)
        url, _, payload = writes[0]
        self.assertEqual(url.split("?")[0], account.DOCUMENTS_URL + "/users/target-uid")
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlsplit(url).query), {"updateMask.fieldPaths": ["roles"], "currentDocument.updateTime": ["2026-09-27T08:00:00Z"]})
        self.assertEqual(payload, {"fields": {}})
        self.assertEqual(fields, {"displayName": {"stringValue": "Participante"}})
        self.assertEqual(calls[-1][1], "GET")

    def test_inspection_does_not_remove_roles(self):
        request, calls, _ = self.mock()
        self.assertFalse(account.prepare(request, False, "new rules"))
        self.assertNotIn("PATCH", [method for _, method, _ in calls])

    def test_already_normal_and_missing_profile_are_not_written(self):
        for options in [{"roles": False}, {"missing": True}]:
            request, calls, _ = self.mock(**options)
            self.assertTrue(account.prepare(request, True, "new rules"))
            self.assertNotIn("PATCH", [method for _, method, _ in calls])

    def test_wrong_or_ambiguous_identity_is_never_modified(self):
        for accounts in [[], [{"email": "other@example.test", "localId": "other"}], [{"email": account.TARGET_EMAIL, "localId": "wrong/path"}], [{"email": account.TARGET_EMAIL, "localId": ".."}], [{"email": account.TARGET_EMAIL, "localId": "one"}, {"email": account.TARGET_EMAIL, "localId": "two"}]]:
            request, calls, _ = self.mock(accounts=accounts)
            with self.assertRaisesRegex(ValueError, "account-not-identified"):
                account.prepare(request, True, "new rules")
            self.assertNotIn("PATCH", [method for _, method, _ in calls])

    def test_old_local_or_deployed_rules_block_changes(self):
        request, calls, _ = self.mock()
        with self.assertRaisesRegex(ValueError, "legacy-access-still-present"):
            account.prepare(request, True, account.TARGET_EMAIL)
        self.assertEqual(calls, [])
        request, calls, _ = self.mock(deployed="old rules")
        with self.assertRaisesRegex(ValueError, "rules-do-not-match"):
            account.prepare(request, True, "new rules")
        self.assertTrue(all(method == "GET" for _, method, _ in calls))

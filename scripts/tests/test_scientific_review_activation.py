import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[1] / "configure-scientific-review.py"
spec = importlib.util.spec_from_file_location("scientific_review_activation", MODULE)
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)


class ScientificReviewActivationTests(unittest.TestCase):
    def request(self, source="exact rules"):
        calls = []

        def mock(url, method="GET", payload=None):
            calls.append((url, method, payload))
            if "/releases/" in url:
                return {"rulesetName": "projects/circ-coimbra/rulesets/validated"}
            if "/rulesets/" in url:
                return {"source": {"files": [{"content": source}]}}
            return {"fields": {"enabled": {"booleanValue": True}}}
        return mock, calls

    def test_mismatched_rules_cannot_enable_reviews(self):
        request, calls = self.request("old rules")
        with self.assertRaisesRegex(ValueError, "rules-do-not-match"):
            activation.configure(request, True, "exact rules", "commit")
        self.assertTrue(all(method == "GET" for _, method, _ in calls))

    def test_check_is_read_only(self):
        request, calls = self.request()
        self.assertTrue(activation.configure(request, False, "exact rules", "commit"))
        self.assertTrue(all(method == "GET" for _, method, _ in calls))

    def test_activation_writes_only_the_event_config_then_reads_it_back(self):
        request, calls = self.request()
        self.assertTrue(activation.configure(request, True, "exact rules", "commit"))
        writes = [call for call in calls if call[1] != "GET"]
        self.assertEqual(len(writes), 1)
        self.assertTrue(writes[0][0].startswith(activation.CONFIG_URL + "?updateMask.fieldPaths="))
        self.assertEqual(writes[0][2]["fields"]["enabled"], {"booleanValue": True})
        self.assertEqual(calls[-1][0], activation.CONFIG_URL)

    def test_unexpected_project_release_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unexpected-ruleset"):
            activation.verify_rules(lambda _: {"rulesetName": "projects/other/rulesets/example"}, "exact rules")

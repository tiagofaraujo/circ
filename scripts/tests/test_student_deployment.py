import importlib.util
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()

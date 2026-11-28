"""Offline regression coverage for public, exact-ID Networker usernames."""
import unittest
import urllib.error

from tools.build_network_usernames import SOURCE, build, exact_id, missing_ids, verified_response

NOW = "2026-11-27T23:10:00Z"


class UsernameLookupTests(unittest.TestCase):
    def test_only_missing_username_ids_requested(self):
        snapshot = {
            "accounts": [{"id": "10", "username": "Known"}, {"id": "11", "username": ""}],
            "network_nodes": [
                {"id": "12", "username": "", "display_name": "Friendly"},
                {"id": "13", "username": "AlreadyObserved"},
                {"id": "12", "username": ""},
                {"id": 0, "username": ""},
                {"id": "-2", "username": ""},
            ],
        }
        self.assertEqual(missing_ids(snapshot), ["11", "12"])
        self.assertIsNone(exact_id(True))
        self.assertIsNone(exact_id("0012"))

    def test_returns_only_exact_requested_ids_and_valid_usernames(self):
        result = verified_response({"data": [
            {"id": 12, "name": "RealUser12", "displayName": "Friendly"},
            {"id": 123, "name": "Unrequested"},
            {"id": 11, "name": "<script>", "displayName": "Not a user"},
            {"id": "12", "name": "RealUser12", "displayName": "Friendly"},
        ]}, {"11", "12"}, NOW)
        self.assertEqual(list(result), ["12"])
        self.assertEqual(result["12"]["username"], "RealUser12")
        self.assertEqual(result["12"]["source_url"], SOURCE)
        self.assertEqual(result["12"]["observed_at"], NOW)

    def test_build_is_batched_and_keeps_original_network_snapshot_untouched(self):
        sample = {"network_nodes": [{"id": str(i), "username": ""} for i in range(1, 102)],
                  "accounts": [{"id": "120", "username": "Unchanged"}]}
        seen = []
        def request(ids):
            seen.append(list(ids))
            return {"data": [{"id": int(i), "name": f"User{i}", "displayName": ""} for i in ids]}
        result = build(sample, request_fn=request, pause_fn=lambda _: None, now=NOW)
        self.assertEqual(list(map(len, seen)), [50, 50, 1])
        self.assertEqual(result["resolved_count"], 101)
        self.assertFalse(result["lookup_incomplete"])
        self.assertEqual(result["users"]["100"]["username"], "User100")
        self.assertNotIn("users", sample)

    def test_failed_public_lookup_stops_without_alt_routes_or_fake_names(self):
        count = [0]
        def denied(_):
            count[0] += 1
            raise urllib.error.HTTPError(SOURCE, 403, "Forbidden", {}, None)
        result = build({"network_nodes": [{"id": "25", "username": ""}]},
                       request_fn=denied, pause_fn=lambda _: None, now=NOW)
        self.assertEqual(count[0], 1)
        self.assertTrue(result["lookup_incomplete"])
        self.assertEqual(result["users"], {})

    def test_invalid_payload_does_not_create_identity(self):
        self.assertEqual(verified_response({"data": [{"id": 12, "name": "Other"}]}, {"13"}, NOW), {})
        self.assertEqual(verified_response({"wrong": []}, {"12"}, NOW), {})


if __name__ == "__main__":
    unittest.main()

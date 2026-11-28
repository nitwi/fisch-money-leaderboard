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

    def test_profile_only_build_uses_saved_profile_and_prior_static_without_roblox_api(self):
        from tools.build_network_usernames import MERGED_SOURCE, profile_queue
        snapshot = {
            "network_nodes": [{"id": "10", "username": ""}, {"id": "11", "username": ""}, {"id": "12", "username": ""}],
            "accounts": [{"id": "1", "username": "Leaderboard", "ledger": True}],
            "historical_friend_edges": [
                {"kind": "friend", "from": "1", "to": "11", "evidence": [{"observed_at": NOW}]},
                {"kind": "friend", "from": "1", "to": "12", "evidence": [{"observed_at": NOW}]},
                {"kind": "friend", "from": "11", "to": "12", "evidence": [{"observed_at": NOW}]},
            ],
        }
        api_record = {"id": "10", "username": "PriorKnown", "display_name": "",
                      "observed_at": "2026-11-26T18:00:00Z", "source_url": SOURCE}
        profile_record = {"id": "11", "username": "ObservedOnPage", "display_name": "Some Display",
                          "observed_at": NOW, "source_url": "https://www.roblox.com/users/11/profile"}
        calls = []
        def prohibited_api(_):
            calls.append(1)
            raise AssertionError("No Roblox API in website-profile-only mode")
        data = build(snapshot, request_fn=prohibited_api, profiles_only=True, now=NOW,
                     prior_users={"10": api_record}, profile_users={"11": profile_record})
        self.assertEqual(calls, [])
        self.assertEqual(data["source_url"], MERGED_SOURCE)
        self.assertEqual(data["resolved_count"], 2)
        self.assertEqual(data["users"]["11"]["source_url"], profile_record["source_url"])
        self.assertEqual(data["users"]["10"]["username"], "PriorKnown")
        queue = profile_queue(snapshot, data["users"])
        self.assertEqual(queue["remaining_ids"], 1)
        self.assertEqual(queue["priority"][0]["id"], "12")
        self.assertEqual(queue["priority"][0]["distinct_ledger_connections"], 1)

    def test_profile_observation_replaces_older_api_name_without_guessing(self):
        previous = {"id": "11", "username": "EarlierName", "display_name": "",
                    "observed_at": "2026-11-24T11:00:00Z", "source_url": SOURCE}
        observed = {"id": "11", "username": "NewerName", "display_name": "",
                    "observed_at": NOW, "source_url": "https://www.roblox.com/users/11/profile"}
        snapshot = {"network_nodes": [{"id": "11", "username": ""}]}
        data = build(snapshot, profiles_only=True, prior_users={"11": previous},
                     profile_users={"11": observed}, now=NOW)
        self.assertEqual(data["users"]["11"]["username"], "NewerName")
        fake = {**observed, "id": "12"}
        data = build(snapshot, profiles_only=True, profile_users={"11": fake}, now=NOW)
        self.assertEqual(data["users"], {})

    def test_invalid_payload_does_not_create_identity(self):
        self.assertEqual(verified_response({"data": [{"id": 12, "name": "Other"}]}, {"13"}, NOW), {})
        self.assertEqual(verified_response({"wrong": []}, {"12"}, NOW), {})


if __name__ == "__main__":
    unittest.main()

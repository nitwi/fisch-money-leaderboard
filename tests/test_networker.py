"""Offline contract tests for public-only network snapshot collection."""

import io
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import scan_networker as scan


NOW = "2026-11-24T08:00:00Z"


class FakeClock:
    def __init__(self):
        self.value = 0.0
        self.sleeps = []

    def now(self):
        return self.value

    def sleep(self, value):
        self.sleeps.append(value)
        self.value += value


class FakeResponse:
    def __init__(self, data, status=200, headers=None):
        self.data, self.status, self.headers = data, status, headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, size=-1):
        return json.dumps(self.data).encode()[:size]


class FakeOpener:
    def __init__(self, outcomes):
        self.outcomes, self.requests = list(outcomes), []

    def open(self, request, timeout):
        self.requests.append(request)
        result = self.outcomes.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class StubClient:
    def __init__(self, results):
        self.results, self.requests = list(results), []

    def request(self, url, **kwargs):
        self.requests.append((url, kwargs))
        result = self.results.pop(0)
        result.url = url
        return result


def good(payload):
    return scan.ApiResult("", NOW, 200, payload)


def denied(status=403):
    return scan.ApiResult("", NOW, status, error="Request denied")


class NetworkerTests(unittest.TestCase):
    def test_exact_ids_are_stable_and_invalid_inputs_are_rejected(self):
        self.assertEqual(scan.stable_id("0012026234206"), "12026234206")
        for value in (True, 12.0, "1e3", "12x", "-1", 0, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                scan.stable_id(value)

    def test_ledger_identity_merge_preserves_aliases_and_latest_presence(self):
        ledger = {
            "players": [{"roblox_id": "7", "name": "Old", "roblox_name": "Current"}, {"roblox_id": 7, "name": "Other"}, {"roblox_id": "8", "name": "Absent"}],
            "checkpoints": [{"id": "old", "at": "2026-11-22T00:00:00Z", "day_key": "2026-11-21"}, {"id": "new", "at": "2026-11-24T00:00:00Z", "day_key": "2026-11-23"}],
            "observations": [{"key": "id:7", "username": "Historic", "checkpoint": "new", "at": "2026-11-24T00:00:00Z", "rank": 2}, {"key": "id:8", "username": "Absent", "checkpoint": "old", "at": "2026-11-22T00:00:00Z", "rank": 1}],
        }
        accounts, checkpoint, notes = scan.ledger_accounts(ledger)
        self.assertEqual(len(accounts), 2)
        self.assertEqual(accounts[0]["id"], "7")
        self.assertEqual(accounts[0]["latest_rank"], 2)
        self.assertEqual(set(accounts[0]["aliases"]), {"Old", "Other", "Current", "Historic"})
        self.assertIsNone(accounts[1]["latest_rank"])
        self.assertEqual(accounts[1]["last_seen_day"], "2026-11-21")
        self.assertEqual(checkpoint["id"], "new")

    def test_target_lookup_requires_exact_requested_username_and_valid_id(self):
        client = StubClient([good({"data": [
            {"requestedUsername": "Lunary811", "id": 99, "name": "Lunary811"},
            {"requestedUsername": "Lunary810", "id": "12013950464", "name": "Lunary810", "displayName": "Lunary"},
        ]})])
        accounts = []
        ids, notes = scan.resolve_targets(client, accounts, ["Lunary810"])
        self.assertEqual(ids, ["12013950464"])
        self.assertEqual(accounts[0]["display_name"], "Lunary")
        self.assertFalse(accounts[0]["ledger"])
        self.assertFalse(client.requests[0][1]["body"]["excludeBannedUsers"])

    def test_target_lookup_refreshes_existing_id_and_preserves_all_aliases(self):
        client = StubClient([good({"data": [{"requestedUsername": "Requested", "id": 7, "name": "Returned", "displayName": "Display"}]})])
        accounts = [{"id": "7", "username": "OldName", "aliases": ["Historic"], "ledger": True}]
        ids, notes = scan.resolve_targets(client, accounts, ["Requested"])
        self.assertEqual(ids, ["7"])
        self.assertEqual(len(accounts), 1)
        self.assertEqual(accounts[0]["username"], "Returned")
        self.assertEqual(set(accounts[0]["aliases"]), {"Historic", "OldName", "Requested", "Returned"})
        self.assertTrue(accounts[0]["ledger"])

    def test_http_401_is_unavailable_without_retry_or_zero_count(self):
        error = urllib.error.HTTPError("https://friends.roblox.com/", 401, "Denied", {}, io.BytesIO(b'{"errors":[{"message":"Authentication token is missing"}]}'))
        opener = FakeOpener([error])
        client = scan.ApiClient(opener=opener, now=lambda: NOW)
        record = scan.collect_social(client, "7", "followers", {}, 2)
        self.assertEqual(record["status"], "unavailable")
        self.assertEqual(record["http_status"], 401)
        self.assertNotIn("total_count", record)
        self.assertEqual(len(opener.requests), 1)

    def test_retry_after_is_honored_in_chunks_and_retry_budget_aborts(self):
        clock = FakeClock()
        error = urllib.error.HTTPError("https://avatar.roblox.com/", 429, "Rate limited", {"Retry-After": "65"}, io.BytesIO(b'{}'))
        opener = FakeOpener([error, FakeResponse({"ok": True})])
        client = scan.ApiClient(opener=opener, sleep=clock.sleep, monotonic=clock.now, wall_time=lambda: 1000, max_retry_wait=90)
        result = client.request("https://avatar.roblox.com/v1/users/7/avatar", group="avatar")
        self.assertTrue(result.ok)
        self.assertGreaterEqual(sum(clock.sleeps), 65)
        self.assertLessEqual(max(clock.sleeps), 30)
        clock2 = FakeClock()
        error2 = urllib.error.HTTPError("https://avatar.roblox.com/", 429, "Rate limited", {"Retry-After": "120"}, io.BytesIO(b'{}'))
        opener2 = FakeOpener([error2])
        result2 = scan.ApiClient(opener=opener2, sleep=clock2.sleep, monotonic=clock2.now, max_retry_wait=30).request("https://avatar.roblox.com/v1/users/7/avatar")
        self.assertEqual(result2.status, 429)
        self.assertIn("budget", result2.error)
        self.assertEqual(len(opener2.requests), 1)
        self.assertEqual(clock2.sleeps, [])

    def test_rate_reset_and_avatar_start_pacing(self):
        clock = FakeClock()
        opener = FakeOpener([FakeResponse({}), FakeResponse({}), FakeResponse({})])
        client = scan.ApiClient(opener=opener, sleep=clock.sleep, monotonic=clock.now)
        for value in (7, 8, 9):
            client.request(f"https://avatar.roblox.com/v1/users/{value}/avatar", group="avatar")
        self.assertEqual(clock.sleeps, [2.0, 2.0])
        self.assertEqual(scan.header_delay({"x-ratelimit-reset": "42"}, 1000), 42)
        self.assertEqual(scan.header_delay({"retry-after": "10", "x-ratelimit-reset": "42"}, 1000), 42)

    def test_cooldown_budget_skip_does_not_claim_an_actual_fetch(self):
        clock = FakeClock()
        opener = FakeOpener([])
        client = scan.ApiClient(opener=opener, sleep=clock.sleep, monotonic=clock.now, max_retry_wait=5)
        client.next_allowed["avatar"] = 120
        accounts = [{"id": "7"}]
        scan.collect_avatars(client, accounts)
        self.assertEqual(accounts[0]["avatar"]["status"], "unavailable")
        self.assertFalse(accounts[0]["avatar"]["attempted"])
        self.assertIsNone(accounts[0]["avatar"]["fetched_at"])
        self.assertEqual(opener.requests, [])

    def test_later_retry_gate_preserves_the_real_failed_attempt(self):
        clock = FakeClock()
        error = urllib.error.HTTPError("https://avatar.roblox.com/", 500, "Server error", {}, io.BytesIO(b'{}'))
        opener = FakeOpener([error])
        client = scan.ApiClient(opener=opener, sleep=clock.sleep, monotonic=clock.now, now=lambda: NOW, max_retry_wait=1)
        result = client.request("https://avatar.roblox.com/v1/users/7/avatar", group="avatar")
        self.assertTrue(result.attempted)
        self.assertEqual(result.status, 500)
        self.assertEqual(result.fetched_at, NOW)
        self.assertEqual(len(opener.requests), 1)
        self.assertIn("remaining wait budget", result.error)

    def test_failed_required_target_preserves_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = Path(directory) / "ledger.json"
            output = Path(directory) / "snapshot.json"
            ledger.write_text(json.dumps({"players": [{"roblox_id": "7", "name": "Known"}]}))
            output.write_text("previous snapshot")
            with patch.object(scan, "resolve_targets", return_value=([], ["Exact target lookup unavailable"])):
                with self.assertRaises(SystemExit) as context:
                    scan.main(["--ledger", str(ledger), "--output", str(output), "--target", "Lunary810"])
            self.assertEqual(context.exception.code, 1)
            self.assertEqual(output.read_text(), "previous snapshot")

    def test_pagination_dedupes_stable_ids_and_marks_caps_partial(self):
        client = StubClient([good({"PageItems": [{"id": 7}], "NextCursor": "abc+/=", "HasMore": True}), good({"PageItems": [{"id": "7"}, {"id": 8}], "NextCursor": None, "HasMore": False})])
        result = scan.collect_social(client, "1", "friends", {"7": {"username": "Known"}}, 2)
        self.assertEqual(result["status"], "complete")
        self.assertEqual([item["id"] for item in result["items"]], ["7", "8"])
        self.assertEqual(result["total_count"], 2)
        self.assertIn("cursor=abc%2B%2F%3D", client.requests[1][0])
        capped = scan.collect_social(StubClient([good({"data": [{"id": 8}], "nextPageCursor": "more"})]), "1", "followers", {}, 1)
        self.assertEqual(capped["status"], "partial")
        self.assertNotIn("total_count", capped)

    def test_complete_empty_is_distinct_from_malformed_response(self):
        empty = scan.collect_social(StubClient([good({"data": [], "nextPageCursor": None})]), "1", "following", {}, 1)
        malformed = scan.collect_social(StubClient([good({"unexpected": []})]), "1", "following", {}, 1)
        self.assertEqual((empty["status"], empty["total_count"]), ("complete", 0))
        self.assertEqual(malformed["status"], "unavailable")
        self.assertNotIn("total_count", malformed)

    def test_partial_results_survive_later_failure_and_repeated_cursor(self):
        client = StubClient([good({"data": [{"id": 7}], "nextPageCursor": "same"}), denied(403)])
        record = scan.collect_social(client, "1", "followers", {}, 2)
        self.assertEqual(record["status"], "partial")
        self.assertEqual(record["items"][0]["id"], "7")
        repeated = StubClient([good({"data": [{"id": 7}], "nextPageCursor": "same"}), good({"data": [{"id": 8}], "nextPageCursor": "same"})])
        record = scan.collect_social(repeated, "1", "followers", {}, 3)
        self.assertEqual(len(record["items"]), 2)
        self.assertEqual(len(repeated.requests), 2)
        self.assertIn("Repeated", record["error"])

    def test_partial_failure_keeps_successful_page_evidence_timestamp_and_url(self):
        later = "2026-11-24T09:30:00Z"
        client = StubClient([
            good({"data": [{"id": 7}], "nextPageCursor": "page2"}),
            scan.ApiResult("", "2026-11-24T08:01:00Z", 200, {"data": [{"id": 8}], "nextPageCursor": "page3"}),
            scan.ApiResult("", later, 403, error="Unavailable"),
        ])
        record = scan.collect_social(client, "1", "followers", {}, 3)
        self.assertEqual(record["fetched_at"], "2026-11-24T08:01:00Z")
        self.assertEqual(record["checked_at"], later)
        self.assertEqual(record["failed_at"], later)
        self.assertEqual(record["items"][0]["observed_at"], NOW)
        self.assertEqual(record["items"][1]["observed_at"], "2026-11-24T08:01:00Z")
        self.assertIn("cursor=page2", record["items"][1]["source_url"])
        self.assertNotIn("cursor=", record["items"][0]["source_url"])

    def test_capability_denials_skip_other_accounts_without_false_fetch_time(self):
        accounts = [{"id": str(i), "username": f"User{i}"} for i in range(1, 6)]
        client = StubClient([denied()] * 12)
        capabilities = scan.collect_social_capabilities(client, accounts, ["1", "2", "3", "4"], 2)
        self.assertEqual(len(client.requests), 12)
        for relation in scan.SOCIAL_PATHS:
            self.assertEqual(capabilities[relation]["status"], "unavailable")
            self.assertIsNone(accounts[4][relation]["fetched_at"])
            self.assertFalse(accounts[4][relation]["attempted"])
            self.assertIsNone(accounts[0][relation]["fetched_at"])
            self.assertEqual(accounts[0][relation]["checked_at"], NOW)
            self.assertNotIn("total_count", accounts[4][relation])

    def test_avatar_normalization_preserves_asset_meta_and_rejects_fake_empty(self):
        source = {"assets": [
            {"id": 9, "name": "Hair", "assetType": {"id": 41, "name": "HairAccessory"}, "meta": {"order": 2}},
            {"id": "2", "name": "Shirt", "assetType": {"id": 11, "name": "Shirt"}},
            {"id": 9, "name": "Hair", "assetType": {"id": 41, "name": "HairAccessory"}, "meta": {"order": 2}},
        ], "bodyColors": {"headColorId": 1}, "scales": {"height": 1}, "playerAvatarType": "R15"}
        result = scan.normalize_avatar(source)
        self.assertEqual([a["id"] for a in result["assets"]], ["2", "9"])
        self.assertEqual(result["assets"][1]["meta"], {"order": 2})
        self.assertEqual(result["rig_type"], "R15")
        with self.assertRaises(ValueError):
            scan.normalize_avatar({"errors": []})

    def test_thumbnail_mapping_uses_target_id_and_requires_completed_official_url(self):
        accounts = [{"id": "7", "avatar_thumbnail": None}, {"id": "8", "avatar_thumbnail": None}]
        client = StubClient([good({"data": [
            {"targetId": 8, "state": "Completed", "imageUrl": "https://tr.rbxcdn.com/avatar8.png"},
            {"targetId": 7, "state": "Pending", "imageUrl": "https://tr.rbxcdn.com/avatar7.png"},
            {"targetId": 9, "state": "Completed", "imageUrl": "https://tr.rbxcdn.com/avatar9.png"},
        ]})])
        scan.collect_thumbnails(client, accounts)
        self.assertIsNone(accounts[0]["avatar_thumbnail"])
        self.assertEqual(accounts[1]["avatar_thumbnail"], "https://tr.rbxcdn.com/avatar8.png")
        self.assertEqual(accounts[0]["thumbnail"]["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()

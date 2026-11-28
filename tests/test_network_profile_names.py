"""Offline regression tests for exact-ID visible Roblox profile observations."""
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

from tools.import_network_profile_names import (
    METHOD, append, exact_id, load_journal, normalize, verified_latest
)


def observation(user_id="123", username="CurrentHandle",
                when="2026-11-27T22:03:00Z", status="verified", display="Pretty Name"):
    return {
        "schema_version": 1,
        "method": METHOD,
        "user_id": user_id,
        "username": username if status == "verified" else "",
        "display_name": display,
        "status": status,
        "observed_at": when,
        "source_url": f"https://www.roblox.com/users/{user_id}/profile",
    }


class ProfileNameTests(unittest.TestCase):
    def test_normalizes_actual_profile_observation_and_rejects_guessed_identity(self):
        saved = normalize(observation())
        self.assertEqual(saved["username"], "CurrentHandle")
        self.assertEqual(saved["user_id"], "123")
        self.assertEqual(saved["source_url"], "https://www.roblox.com/users/123/profile")
        self.assertTrue(saved["observation_id"].startswith("profile_"))
        again = normalize(saved)
        self.assertEqual(again, saved)

        bad = observation()
        bad["source_url"] = "https://www.roblox.com/users/124/profile"
        with self.assertRaisesRegex(ValueError, "exactly match"):
            normalize(bad)
        bad = observation()
        bad["username"] = "@DisplayName"
        with self.assertRaisesRegex(ValueError, "exact visible"):
            normalize(bad)
        bad = observation()
        bad["display_name"] = "<script>"  # Text is allowed; never parsed as HTML by UI.
        self.assertEqual(normalize(bad)["display_name"], "<script>")
        bad["username"] = "<script>"
        with self.assertRaises(ValueError):
            normalize(bad)
        bad = observation()
        bad["extra_guess"] = "Probably someone else"
        with self.assertRaisesRegex(ValueError, "Unknown"):
            normalize(bad)

    def test_rejects_unavailable_observation_claiming_verified_name(self):
        with self.assertRaisesRegex(ValueError, "guessed username"):
            normalize(observation(status="unavailable", username="fake"))
        verified = normalize(observation(status="unavailable"))
        self.assertEqual(verified["username"], "")
        self.assertEqual(verified["status"], "unavailable")

    def test_append_is_deduplicated_and_immutable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            journal, snapshot = root / "profile.jsonl", root / "snapshot.json"
            snapshot.write_text(json.dumps({"accounts": [{"id": "123"}], "network_nodes": [
                {"id": "456", "username": ""}]}), encoding="utf-8")
            records = [observation(), observation(user_id="456", username="OtherHandle")]
            result = append(records, journal=journal, snapshot=snapshot)
            self.assertEqual(result["added"], 2)
            self.assertEqual(append(records, journal=journal, snapshot=snapshot)["duplicates"], 2)
            self.assertEqual(len(load_journal(journal)), 2)
            self.assertEqual(len(journal.read_text().splitlines()), 2)
            with self.assertRaisesRegex(ValueError, "absent"):
                append([observation(user_id="789")], journal=journal, snapshot=snapshot)
            self.assertEqual(len(load_journal(journal)), 2)

    def test_latest_verified_name_preserved_after_inaccessible_profile(self):
        records = [
            normalize(observation(username="OldName", when="2026-11-25T10:00:00Z")),
            normalize(observation(username="", status="unavailable", when="2026-11-27T11:00:00Z")),
            normalize(observation(username="NewName", when="2026-11-27T22:03:00.500Z")),
            normalize(observation(username="MiddleName", when="2026-11-27T22:03:00Z")),
        ]
        latest = verified_latest(records)["123"]
        self.assertEqual(latest["username"], "NewName")
        self.assertEqual(latest["observed_at"], "2026-11-27T22:03:00.500Z")

    def test_ids_and_times_are_exact(self):
        for bad in [True, 0, "0", "00123", "12-3", "1"*22]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                exact_id(bad)
        for bad in ["2026-11-27T22:03:00+00:00", "tomorrow", "2026-11-32T22:03:00Z"]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                normalize(observation(when=bad))


if __name__ == "__main__":
    unittest.main()

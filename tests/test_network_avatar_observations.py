import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from tools import import_network_observations as network


class AvatarObservationsTest(unittest.TestCase):
    def setUp(self):
        self.rules = network.load_json(network.RBI_PRESETS)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.friends = self.dir / "friends.jsonl"
        self.avatars = self.dir / "avatars.jsonl"
        self.snapshot = self.dir / "input.json"
        self.output = self.dir / "review.json"
        self.db = self.dir / "review.sqlite"
        self.input_scans = self.dir / "scans.json"
        self.snapshot.write_text(json.dumps({"accounts": [
            {"id": "10", "ledger": True, "username": "Root"},
        ]}))
        network.append_journal([{
            "source_id": "10", "source_profile_url": network.profile_url("10"),
            "observed_at": "2026-11-24T05:00:00Z", "page_url": "https://www.roblox.com/users/10/friends",
            "coverage": {}, "friends": [{"id": "20", "profile_url": network.profile_url("20")}],
        }], self.friends)

    def scan(self, status, assets, minute=0, user_id="20", **kwargs):
        return {"status": status, "asset_ids": assets, "user_id": user_id,
                "observed_at": f"2026-11-24T05:{minute:02}:00Z",
                "source_url": network.profile_url(user_id), **kwargs}

    def import_scans(self, scans):
        self.input_scans.write_text(json.dumps(scans))
        return network.main(["import-avatars", "--input", str(self.input_scans),
                             "--journal", str(self.friends), "--snapshot", str(self.snapshot),
                             "--avatar-journal", str(self.avatars)])

    def build(self, snapshot=None):
        return network.main(["build", "--snapshot", str(snapshot or self.snapshot), "--journal",
                             str(self.friends), "--avatar-journal", str(self.avatars),
                             "--output", str(self.output), "--sqlite", str(self.db)])

    def test_corrected_rule_and_status(self):
        self.assertEqual(len(self.rules["presets"]), 22)
        green = next(p for p in self.rules["presets"] if p["id"] == "greenbean")
        self.assertEqual(green["assetIds"], ["617605556"])
        positive = network.recheck_avatar_presets(network.normalize_avatar_scan(
            self.scan("partial", ["617605556", "144076760", "999"])), self.rules)
        self.assertEqual(positive["status"], "full")
        presets = {p["id"]: p for p in positive["presets"]}
        self.assertEqual(presets["greenbean"]["matchedIds"], ["617605556"])
        self.assertEqual(presets["bacon"]["status"], "partial")
        self.assertEqual(presets["bacon"]["missingIds"], [])
        self.assertEqual(set(presets["bacon"]["unverifiedIds"]), {"144076358", "63690008"})
        self.assertEqual(presets["summer"]["status"], "unknown")
        for status, expected in (("complete", "none"), ("partial", "unknown"), ("unavailable", "unavailable")):
            result = network.recheck_avatar_presets(network.normalize_avatar_scan(self.scan(status, [])), self.rules)
            self.assertEqual(result["status"], expected)

    def test_cli_offline_import_and_rebuild_keeps_complete_history(self):
        first_scan = self.scan("complete", [617605556, 999], 1)
        second_scan = self.scan("unavailable", [], 2)
        baseline_friends = self.friends.read_bytes()
        self.assertEqual(self.import_scans([first_scan, second_scan, first_scan]), 0)
        self.assertEqual(self.build(), 0)
        self.assertEqual(self.friends.read_bytes(), baseline_friends)
        snapshot = json.loads(self.output.read_text())
        node = next(n for n in snapshot["network_nodes"] if n["id"] == "20")
        self.assertEqual(node["avatar"]["status"], "unavailable")
        self.assertEqual(node["avatar_preset_review"]["status"], "unavailable")
        self.assertEqual(len(snapshot["avatar_observations"]["scan_ids"]), 2)
        with sqlite3.connect(self.db) as conn:
            results = conn.execute("SELECT user_id, preset_review_json FROM avatar_observations ORDER BY observed_at").fetchall()
            self.assertEqual([json.loads(r[1])["status"] for r in results], ["full", "unavailable"])
            self.assertEqual([r[0] for r in results], ["20", "20"])
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM friendship_evidence").fetchone(), (1,))
        self.assertEqual(self.build(snapshot=self.output), 0)
        self.avatars.unlink()
        with self.assertRaises(SystemExit):
            self.build(snapshot=self.output)

    def test_rejects_unverifiable_sources_and_unknown_nodes(self):
        wrong = {**self.scan("complete", [999]), "source_url": network.profile_url("21")}
        for invalid in (wrong, self.scan("unavailable", [999]), self.scan("partial", [True])):
            with self.assertRaises(ValueError):
                network.normalize_avatar_scan(invalid)
        with self.assertRaises(SystemExit):
            self.import_scans([self.scan("complete", [], user_id="21")])
        self.assertFalse(self.avatars.exists())


if __name__ == "__main__":
    unittest.main()

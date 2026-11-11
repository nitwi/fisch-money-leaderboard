import json
import sys
import unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from build import checked_amount, safe_path


class LedgerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "site/data.json").read_text(encoding="utf-8"))

    def test_exact_integer_policy(self):
        self.assertEqual(checked_amount("305812172036"), "305812172036")
        for invalid in ("", " 10", "1.5", "-1", "1,000", "1e9"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                checked_amount(invalid)
        with self.assertRaises(ValueError):
            safe_path(ROOT, "../outside.png")

    def test_proof_and_missing_are_distinct(self):
        data = self.data
        self.assertEqual(len(data["checkpoints"]), 35)
        self.assertEqual(len(data["evidence"]), 160)
        self.assertEqual(len(data["observations"]), 1750)
        self.assertTrue(all(len([o for o in data["observations"] if o["checkpoint"] == cp["id"]]) == 50 for cp in data["checkpoints"]))
        proofs = {e["id"]: e for e in data["evidence"]}
        for row in data["observations"]:
            if row["status"] == "verified":
                self.assertTrue(row["username"] and row["balance"] and row["evidence"])
                self.assertTrue(all(proofs[e]["checkpoint"] == row["checkpoint"] and proofs[e]["min"] <= row["rank"] <= proofs[e]["max"] for e in row["evidence"]))
            if row["status"] in ("captured_pending_transcription", "not_captured"):
                self.assertFalse(row["balance"])

    def test_observed_rate_and_roblox_identity(self):
        data = self.data
        rows = {o["id"]: o for o in data["observations"]}
        first = rows["2026-10-10_1613_R01"]
        second = rows["2026-10-11_2149_R01"]
        self.assertEqual(int(second["balance"]) - int(first["balance"]), -313608792)
        self.assertEqual(first["key"], second["key"])
        self.assertEqual((datetime.fromisoformat(data["checkpoints"][1]["at"].replace("Z", "+00:00")) - datetime.fromisoformat(data["checkpoints"][0]["at"].replace("Z", "+00:00"))).total_seconds() / 3600, 29.6)
        renamed = rows["2026-10-10_1613_R20"]
        latest = rows["2026-11-10_2130_R14"]
        self.assertEqual(renamed["key"], latest["key"], "Verified Roblox account rename should retain a single history")
        self.assertTrue(any(p["roblox_id"] == "1316700350" and p["headshot"] for p in data["players"]))


if __name__ == "__main__":
    unittest.main()

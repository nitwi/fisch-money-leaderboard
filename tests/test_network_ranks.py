"""Networker ranks are always derived from the latest complete screenshot-backed board."""
import unittest

from tools.build_network_ranks import current_rank_overlay


class NetworkRankTests(unittest.TestCase):
    @staticmethod
    def board(checkpoint, *, alias_id=None, verified=True, shift=False):
        rows=[]
        for rank in range(1,51):
            user_id=rank
            if shift:
                if rank==25: user_id=27
                elif rank==27: user_id=25
            rows.append({"checkpoint":checkpoint,"rank":rank,
                         "status":"verified" if verified else "captured_pending_transcription",
                         "key":f"id:{user_id}","username":f"User{user_id}"})
        return rows

    def fixture(self):
        return {
          "players":[{"roblox_id":str(i),"roblox_name":f"User{i}",
                      "headshot":None} for i in range(1,51)],
          "checkpoints":[
            {"id":"earlier","at":"2026-11-25T20:00:00Z","day_key":"2026-11-25","complete":True},
            {"id":"latest","at":"2026-11-27T20:57:00Z","day_key":"2026-11-27","complete":True},
          ],
          "observations":[*self.board("earlier"),*self.board("latest",shift=True)],
        }

    def test_uses_newest_verified_board_not_old_social_snapshot(self):
        result=current_rank_overlay(self.fixture())
        self.assertEqual(result["source"],"photo_verified_ledger")
        self.assertEqual(result["checkpoint"]["id"],"latest")
        self.assertEqual(result["checkpoint"]["day_key"],"2026-11-27")
        self.assertEqual(result["verified_rank_slots"],50)
        self.assertEqual(result["resolved_ranked_accounts"],50)
        ali=next(entry for entry in result["entries"] if entry["id"]=="27")
        self.assertEqual(ali["rank"],25)
        self.assertEqual(ali["username"],"User27")

    def test_rejects_unverified_newest_board_and_keeps_last_valid(self):
        source=self.fixture()
        source["checkpoints"].append({"id":"partial","at":"2026-11-28T20:00:00Z",
                                       "day_key":"2026-11-28","complete":False})
        source["observations"].extend(self.board("partial",verified=False))
        result=current_rank_overlay(source)
        self.assertEqual(result["checkpoint"]["id"],"latest")

    def test_unresolved_id_is_omitted_not_invented(self):
        source=self.fixture()
        source["observations"][-1]["key"]="username:UnresolvedSomeone"
        result=current_rank_overlay(source)
        self.assertEqual(result["resolved_ranked_accounts"],49)
        self.assertFalse(any(entry["rank"]==50 for entry in result["entries"]))

    def test_duplicate_ids_are_rejected(self):
        source=self.fixture()
        latest=[row for row in source["observations"] if row["checkpoint"]=="latest"]
        latest[0]["key"]=latest[1]["key"]
        with self.assertRaisesRegex(ValueError,"multiple ranks"):
            current_rank_overlay(source)

    def test_only_verified_checkpoints_and_exact_ids(self):
        source=self.fixture()
        source["checkpoints"][1]["complete"]=False
        self.assertEqual(current_rank_overlay(source)["checkpoint"]["id"],"earlier")
        source["checkpoints"][0]["complete"]=False
        with self.assertRaisesRegex(ValueError,"No complete"):
            current_rank_overlay(source)


if __name__ == "__main__":
    unittest.main()

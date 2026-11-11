import json
import sys
import unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from build import checked_amount, safe_path
from extract_screenshots import parse_image
from sessions import group_sessions


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
        self.assertEqual(len(data["captures"]), 35)
        self.assertEqual(len(data["capture_observations"]), 1750)
        self.assertEqual(len(data["checkpoints"]), 33)
        self.assertEqual(len(data["evidence"]), 160)
        self.assertEqual(len(data["observations"]), 1650)
        self.assertTrue(all(len([o for o in data["observations"] if o["checkpoint"] == cp["id"]]) == 50 for cp in data["checkpoints"]))
        proofs = {e["id"]: e for e in data["evidence"]}
        for row in data["observations"]:
            if row["status"] in ("verified","ocr_crosschecked","ocr_provisional"):
                self.assertTrue(row["username"] and row["balance"] and row["evidence"])
                self.assertTrue(all(proofs[e]["checkpoint"] in row["source_checkpoints"] and proofs[e]["min"] <= row["rank"] <= proofs[e]["max"] for e in row["evidence"]))
            if row["status"] in ("captured_pending_transcription", "not_captured"):
                self.assertFalse(row["balance"])
        self.assertFalse((ROOT/"data/source/data/observations.csv").exists(), "Excel-derived observations must not be an input")
        self.assertEqual(sum(cp['verified'] for cp in data['captures']), 1568)
        self.assertEqual(sum(cp['coverage'] for cp in data['captures']), 1571)
        self.assertEqual(sum(row['status']=='not_captured' for row in data['capture_observations']),179)
        self.assertEqual(sum(row['status']=='captured_pending_transcription' for row in data['capture_observations']),3)
        self.assertEqual(sum(row['status']=='verified' for row in data['observations']),1538)
        self.assertEqual(sum(row['status']=='captured_pending_transcription' for row in data['observations']),1)
        self.assertEqual(sum(cp['complete'] for cp in data['checkpoints']),28)
        self.assertFalse(any(row['status'].startswith('ocr_') for row in data['observations']))

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
        self.assertEqual(rows["2026-10-10_1613_R46"]["key"],rows["2026-10-16_2028_R49"]["key"],"Roundaway/casketdream rename should retain one history")
        self.assertEqual(int(rows["2026-11-10_2130_R20"]["balance"])-int(rows["2026-11-09_2122_R33"]["balance"]),24_146_585_213)
        self.assertTrue(any(p["roblox_id"] == "1316700350" and p["headshot"] for p in data["players"]))

    def test_near_time_capture_sessions_preserve_bottom_band_and_proof(self):
        data=self.data
        sessions={cp['id']:cp for cp in data['checkpoints']}
        morning=sessions['2026-11-04_0142']
        evening=sessions['2026-11-04_2100']
        self.assertEqual(morning['source_checkpoints'],['2026-11-04_0142','2026-11-04_0152'])
        self.assertEqual(evening['source_checkpoints'],['2026-11-04_2100','2026-11-04_2101'])
        self.assertEqual((morning['verified'],morning['coverage'],len(morning['evidence'])),(50,50,6))
        self.assertEqual((evening['verified'],evening['coverage'],len(evening['evidence'])),(50,50,6))
        self.assertNotIn('2026-11-04_0152',sessions)
        self.assertNotIn('2026-11-04_2101',sessions)
        self.assertEqual(morning['captured_to'],'2026-11-04T07:52:00Z')
        self.assertEqual(evening['captured_to'],'2026-11-05T03:01:00Z')
        self.assertEqual(len([cp for cp in data['captures'] if cp['id'].startswith('2026-11-04_')]),4)
        self.assertTrue(any(row['id']=='2026-11-04_0152_R01' for row in data['capture_observations']))
        by_session={(row['checkpoint'],row['rank']):row for row in data['observations']}
        for cp in (morning,evening):
            self.assertEqual(by_session[(cp['id'],50)]['status'],'verified')
            self.assertTrue(by_session[(cp['id'],50)]['evidence'])
            self.assertEqual(by_session[(cp['id'],1)]['source_checkpoints'],cp['source_checkpoints'])
        self.assertEqual(len([row for row in data['observations'] if row['key']==by_session[(morning['id'],1)]['key']]),33)
        october=[cp for cp in data['checkpoints'] if cp['id'].startswith('2026-10-17_')]
        self.assertEqual(len(october),2,"12h-spaced photos with changed balances must remain distinct")
        self.assertEqual([cp['verified'] for cp in october],[14,50])

    def test_session_merge_rejects_changed_rows_and_preserves_actual_row_time(self):
        base={'id':'a','at':'2026-11-04T07:42:00Z','precision':'user-supplied',
              'evidence':['EV1'],'coverage':50,'verified':50,'visible':50,'complete':True}
        follow={**base,'id':'b','at':'2026-11-04T07:52:00Z','evidence':['EV2'],
                'coverage':16,'verified':16,'visible':16,'complete':False}
        observations=[]
        for cp in (base,follow):
            for rank in range(1,51):
                visible=cp['id']=='a' or rank<=16
                observations.append({'id':f"{cp['id']}_R{rank:02d}",'checkpoint':cp['id'],
                    'rank':rank,'key':f'user:{rank}' if visible else '',
                    'username':f'user{rank}' if visible else '',
                    'balance':str(100-rank) if visible else '',
                    'status':'verified' if visible else 'not_captured',
                    'evidence':[cp['evidence'][0]] if visible else []})
        sessions,rows,_=group_sessions([base,follow],observations)
        self.assertEqual(len(sessions),1)
        self.assertEqual(len(rows),50)
        self.assertEqual(next(row for row in rows if row['rank']==1)['evidence'],['EV1','EV2'])
        self.assertEqual(next(row for row in rows if row['rank']==50)['evidence'],['EV1'])
        changed=[{**row,'balance':'777'} if row['id']=='b_R01' else row for row in observations]
        self.assertEqual(len(group_sessions([base,follow],changed)[0]),2)
        # Complementary partial bands remain one point, but the row's own time
        # is retained for per-player hourly-rate calculations.
        early={**base,'coverage':16,'verified':16,'visible':16,'complete':False}
        late={**follow,'coverage':34,'verified':34,'visible':34}
        mixed=[]
        for cp in (early,late):
            for rank in range(1,51):
                visible=rank<=16 if cp['id']=='a' else rank>=17
                mixed.append({'id':f"{cp['id']}_R{rank:02d}",'checkpoint':cp['id'],
                    'rank':rank,'key':f'user:{rank}' if visible else '',
                    'username':f'user{rank}' if visible else '',
                    'balance':str(100-rank) if visible else '',
                    'status':'verified' if visible else 'not_captured',
                    'evidence':[cp['evidence'][0]] if visible else []})
        grouped,merged,_=group_sessions([early,late],mixed)
        self.assertEqual(len(grouped),1)
        self.assertEqual(grouped[0]['at'],early['at'])
        self.assertEqual(next(row for row in merged if row['rank']==50)['at'],late['at'])
        distant={**late,'at':'2026-11-04T09:42:00Z'}
        self.assertEqual(len(group_sessions([early,distant],mixed)[0]),2,
                         'Disjoint bands photographed hours apart must not be presumed a session')

    def test_screenshot_ocr_alignment_keeps_known_bad_digits_out(self):
        draft=json.loads((ROOT/"data/ocr_draft.json").read_text(encoding="utf-8"))
        self.assertEqual(parse_image(draft['EV0001'])[0][11]['balance'],'118291817342')
        self.assertEqual(parse_image(draft['EV0005'])[0][1]['balance'],'290322317214')
        self.assertEqual(parse_image(draft['EV0013'])[0][1]['balance'],'291440445299')
        self.assertNotIn(17,parse_image(draft['EV0129'])[0],"A dropped OCR digit must not look like a 90B loss")
        self.assertEqual(parse_image(draft['EV0130'])[0][40]['name'],'pflugerson')


if __name__ == "__main__":
    unittest.main()

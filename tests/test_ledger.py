import json
import sys
import unittest
from types import SimpleNamespace
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from build import checked_amount, safe_path
from daily import local_time, select_daily
from extract_screenshots import parse_image
from import_capture import png_metadata, prepare
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
        self.assertGreaterEqual(len(data["captures"]), 38)
        self.assertEqual(len(data["capture_observations"]), 50*len(data["captures"]))
        self.assertEqual(len(data["session_observations"]), 50*len(data["sessions"]))
        self.assertEqual(len(data["observations"]), 50*len(data["checkpoints"]))
        self.assertEqual(len(data["evidence"]),sum(len(cp['evidence']) for cp in data['captures']))
        self.assertGreaterEqual(len(data["evidence"]),172)
        self.assertTrue(all(len([o for o in data["observations"] if o["checkpoint"] == cp["id"]]) == 50 for cp in data["checkpoints"]))
        proofs = {e["id"]: e for e in data["evidence"]}
        for row in data["observations"]:
            if row["status"] in ("verified","ocr_crosschecked","ocr_provisional"):
                self.assertTrue(row["username"] and row["balance"] and row["evidence"])
                self.assertTrue(all(proofs[e]["checkpoint"] in row["source_checkpoints"] and proofs[e]["min"] <= row["rank"] <= proofs[e]["max"] for e in row["evidence"]))
            if row["status"] in ("captured_pending_transcription", "not_captured"):
                self.assertFalse(row["balance"])
        self.assertFalse((ROOT/"data/source/data/observations.csv").exists(), "Excel-derived observations must not be an input")
        self.assertGreaterEqual(sum(cp['verified'] for cp in data['captures']),1718)
        self.assertEqual(sum(cp['coverage'] for cp in data['captures']),50*len(data['captures'])-sum(row['status']=='not_captured' for row in data['capture_observations']))
        self.assertGreaterEqual(sum(row['status']=='captured_pending_transcription' for row in data['capture_observations']),3)
        self.assertEqual(sum(row['status']=='verified' for row in data['session_observations']),sum(cp['verified'] for cp in data['sessions']))
        self.assertEqual(sum(row['status']=='verified' for row in data['observations']),sum(cp['verified'] for cp in data['checkpoints']))
        for row_id in ('2026-10-17_1014_R15','2026-11-04_0152_R16','2026-11-04_2101_R16'):
            self.assertEqual(next(row['status'] for row in data['capture_observations'] if row['id']==row_id),'captured_pending_transcription')
        self.assertGreaterEqual(sum(cp['complete'] for cp in data['checkpoints']),30)
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
        sessions={cp['id']:cp for cp in data['sessions']}
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
        by_session={(row['checkpoint'],row['rank']):row for row in data['session_observations']}
        for cp in (morning,evening):
            self.assertEqual(by_session[(cp['id'],50)]['status'],'verified')
            self.assertTrue(by_session[(cp['id'],50)]['evidence'])
            self.assertEqual(by_session[(cp['id'],1)]['source_checkpoints'],cp['source_checkpoints'])
        self.assertGreaterEqual(len([row for row in data['session_observations'] if row['key']==by_session[(morning['id'],1)]['key']]),33)
        october=[cp for cp in data['sessions'] if cp['id'].startswith('2026-10-17_')]
        self.assertEqual(len(october),2,"12h-spaced photos with changed balances must remain distinct")
        self.assertEqual([cp['verified'] for cp in october],[14,50])

    def test_daily_ticks_keep_latest_cycle_photo(self):
        data=self.data
        dates={cp['day_key']:cp for cp in data['checkpoints']}
        self.assertEqual(dates['2026-10-13']['id'],'2026-10-14_0045')
        self.assertEqual(dates['2026-11-03']['id'],'2026-11-04_0142')
        self.assertEqual(dates['2026-11-07']['id'],'2026-11-08_0116')
        self.assertEqual(dates['2026-11-07']['earlier_session_ids'],['2026-11-07_1046'])
        self.assertEqual(len(dates['2026-11-07']['evidence']),9)
        self.assertEqual(dates['2026-11-08']['id'],'2026-11-09_0052')
        self.assertEqual(dates['2026-11-09']['id'],'2026-11-09_2122')
        self.assertEqual(dates['2026-10-17']['id'],'2026-10-17_2214')
        self.assertEqual(dates['2026-10-17']['earlier_session_ids'],['2026-10-17_1014'])
        self.assertEqual(len(dates['2026-10-17']['evidence']),6)
        self.assertNotIn('2026-10-18',dates)
        self.assertEqual(dates['2026-11-11']['id'],'2026-11-12_0036')
        self.assertEqual(dates['2026-11-11']['earlier_session_ids'],['2026-11-11_2233'])
        self.assertEqual(dates['2026-11-12']['id'],'2026-11-12_2258')
        self.assertEqual(dates['2026-11-12']['earlier_session_ids'],[])
        self.assertEqual(sum(row['status']=='verified' for row in data['observations'] if row['day_key']=='2026-11-03'),50)
        self.assertGreaterEqual(len([row for row in data['observations'] if row['key']==next(r['key'] for r in data['observations'] if r['day_key']=='2026-10-10' and r['rank']==1)]),31)

    def test_overnight_update_uses_latest_photo_and_preserves_both_full_captures(self):
        data=self.data
        captures={cp['id']:cp for cp in data['captures']}
        first=captures['2026-11-11_2233'];updated=captures['2026-11-12_0036']
        self.assertEqual((first['coverage'],first['verified'],len(first['evidence'])),(50,50,4))
        self.assertEqual((updated['coverage'],updated['verified'],len(updated['evidence'])),(50,50,4))
        self.assertEqual(data['session_day_assignment'][updated['id']],'2026-11-11',"Close overnight updates belong to the prior daily cycle")
        self.assertEqual(updated['at'],'2026-11-12T06:36:00Z')
        selected=next(cp for cp in data['checkpoints'] if cp['day_key']=='2026-11-11')
        self.assertEqual((selected['id'],selected['at']), (updated['id'],updated['at']))
        self.assertEqual((selected['verified'],len(selected['evidence'])),(50,8))
        self.assertEqual(selected['daily_source_sessions'],[first['id'],updated['id']])
        self.assertEqual(selected['primary_evidence'],updated['evidence'])
        self.assertTrue(selected['early_am_rollover'])
        rows={row['id']:row for row in data['capture_observations']}
        self.assertEqual(rows['2026-11-11_2233_R50']['balance'],'53818853769')
        self.assertEqual(rows['2026-11-12_0036_R50']['balance'],'53829367842')
        self.assertEqual(int(rows['2026-11-12_0036_R02']['balance'])-int(rows['2026-11-11_2233_R02']['balance']),529_650_336)
        self.assertEqual((datetime.fromisoformat(updated['at'].replace('Z','+00:00'))-datetime.fromisoformat(first['at'].replace('Z','+00:00'))).total_seconds()/3600,2.05)
        old=rows['2026-11-10_2130_R35']
        new=rows['2026-11-11_2233_R35']
        self.assertEqual(new['username'],'ewoofs')
        self.assertEqual(new['key'],old['key'],"Exact Roblox ID must merge renamed player's history")
        self.assertEqual(rows['2026-11-12_0036_R35']['key'],old['key'])
        self.assertEqual(next(row['balance'] for row in data['observations'] if row['day_key']=='2026-11-11' and row['rank']==2),rows['2026-11-12_0036_R02']['balance'])
        self.assertTrue(next(p for p in data['players'] if p['key']==rows['2026-11-11_2233_R50']['key'])['roblox_id'])
        proofs={proof['id']:proof for proof in data['evidence']}
        self.assertEqual(proofs['EV0161']['captured_at'],first['at'])
        self.assertEqual(proofs['EV0168']['captured_at'],updated['at'])

    def test_november_12_evening_capture_starts_a_new_daily_cycle(self):
        data=self.data
        capture=next(cp for cp in data['captures'] if cp['id']=='2026-11-12_2258')
        selected=next(cp for cp in data['checkpoints'] if cp['day_key']=='2026-11-12')
        self.assertEqual((capture['coverage'],capture['verified'],len(capture['evidence'])),(50,50,4))
        self.assertEqual((selected['id'],selected['at']),(capture['id'],'2026-11-13T04:58:00Z'))
        self.assertEqual(selected['daily_source_sessions'],[capture['id']])
        self.assertFalse(selected['early_am_rollover'])
        self.assertEqual(data['session_day_assignment']['2026-11-12_0036'],'2026-11-11')
        self.assertEqual(data['session_day_assignment'][capture['id']],'2026-11-12')
        rows={row['id']:row for row in data['capture_observations']}
        by_day={row['rank']:row for row in data['observations'] if row['day_key']=='2026-11-12'}
        self.assertEqual(rows['2026-11-12_2258_R01']['balance'],'307471340304')
        self.assertEqual(rows['2026-11-12_2258_R02']['balance'],'268545154674')
        self.assertEqual((by_day[14]['username'],by_day[14]['balance']),('Ceruleanflare2','117282689120'))
        self.assertEqual((by_day[35]['username'],by_day[36]['username']),('minmin8280','ewoofs'))
        self.assertEqual(by_day[36]['key'],rows['2026-11-12_0036_R35']['key'])
        self.assertEqual(rows['2026-11-12_2258_R50']['balance'],'53844564474')
        self.assertEqual(by_day[50]['evidence'],['EV0172'])
        proofs={proof['id']:proof for proof in data['evidence']}
        self.assertEqual([proofs[proof]['captured_at'] for proof in selected['evidence']],[capture['at']]*4)
        self.assertEqual((proofs['EV0172']['min'],proofs['EV0172']['max']),(48,50))

    def test_daily_import_rejects_duplicate_checkpoint_without_changing_originals(self):
        photo=ROOT/'site/evidence/screenshots/2026-11-11_2233/EV0161_Screenshot_2026-11-11_223212.png'
        self.assertTrue(photo.is_file())
        width,height=png_metadata(photo)
        self.assertGreater(width,400)
        self.assertGreater(height,350)
        with self.assertRaisesRegex(ValueError,'Checkpoint already exists'):
            prepare(SimpleNamespace(date='2026-11-11',time='22:33',image=[],precision='user-supplied'))

    def test_rollover_synthetic_dst(self):
        dates={cp['day_key']:cp for cp in self.data['checkpoints']}
        def cp(name,at):
            return {'id':name,'at':at,'captured_from':at,'captured_to':at,
                    'source_checkpoints':[name],'evidence':[name],
                    'coverage':50,'verified':50,'visible':50,'complete':True}
        def observation(capture):
            return [{'checkpoint':capture['id'],'rank':rank,'id':f"{capture['id']}_R{rank:02d}",
                     'status':'verified','balance':str(100-rank),'username':f'user{rank}',
                     'key':f'user:{rank}','evidence':[capture['id']],'at':capture['at']}
                    for rank in range(1,51)]
        midnight=cp('midnight','2026-11-09T06:52:00Z')  # 00:52 CST
        evening=cp('evening','2026-11-10T03:22:00Z')  # Nov 9 at 21:22 CST
        picked,_,_,_=select_daily([midnight,evening],observation(midnight)+observation(evening),[midnight,evening])
        self.assertEqual([row['day_key'] for row in picked],['2026-11-08','2026-11-09'])
        prior=cp('prior','2026-11-09T00:00:00Z')  # Nov 8 at 18:00 CST
        picked,_,_,_=select_daily([prior,midnight,evening],observation(prior)+observation(midnight)+observation(evening),[prior,midnight,evening])
        self.assertEqual([row['id'] for row in picked],['prior','evening'])
        self.assertEqual(picked[-1]['earlier_session_ids'],['midnight'])
        late=cp('late','2026-11-12T04:33:00Z')  # Nov 11 at 22:33 CST
        update=cp('update','2026-11-12T06:36:00Z')  # Nov 12 at 00:36 CST
        followup=cp('followup','2026-11-12T07:50:00Z')  # Nov 12 at 01:50 CST
        daytime=cp('daytime','2026-11-13T01:00:00Z')  # Nov 12 at 19:00 CST
        photos=[late,update,followup,daytime]
        picked,selected,_,assigned=select_daily(photos,sum((observation(photo) for photo in photos),[]),photos)
        self.assertEqual([row['day_key'] for row in picked],['2026-11-11','2026-11-12'])
        self.assertEqual([row['id'] for row in picked],['followup','daytime'])
        self.assertEqual(picked[0]['earlier_session_ids'],['late','update'])
        self.assertEqual(assigned['update'],assigned['followup'])
        self.assertEqual(next(row for row in selected if row['day_key']=='2026-11-11' and row['rank']==1)['id'],'followup_R01')
        distant=cp('distant','2026-11-12T00:00:00Z')  # Nov 11 at 18:00 CST, over six hours before update
        picked,_,_,_=select_daily([distant,update],observation(distant)+observation(update),[distant,update])
        self.assertEqual([row['day_key'] for row in picked],['2026-11-11','2026-11-12'])
        at_limit=cp('at_limit','2026-11-12T07:59:00Z')  # Nov 12 at 01:59 CST
        just_within=cp('just_within','2026-11-12T04:59:00Z')  # Exactly three hours earlier
        just_beyond=cp('just_beyond','2026-11-12T04:58:00Z')  # Three hours and one minute earlier
        picked,_,_,_=select_daily([just_within,at_limit],observation(just_within)+observation(at_limit),[just_within,at_limit])
        self.assertEqual([row['id'] for row in picked],['at_limit'])
        picked,_,_,_=select_daily([just_beyond,at_limit],observation(just_beyond)+observation(at_limit),[just_beyond,at_limit])
        self.assertEqual([row['day_key'] for row in picked],['2026-11-11','2026-11-12'])
        after_cutoff=cp('after_cutoff','2026-11-12T08:01:00Z')  # Nov 12 at 02:01 CST
        picked,_,_,_=select_daily([late,after_cutoff],observation(late)+observation(after_cutoff),[late,after_cutoff])
        self.assertEqual([row['day_key'] for row in picked],['2026-11-11','2026-11-12'])
        self.assertEqual(local_time('2026-11-01T07:30:00Z').hour,1)  # Fall-back hour stays Chicago-local
        halloween=dates['2026-10-31']['at']
        november_first=dates['2026-11-01']['at']
        self.assertEqual((datetime.fromisoformat(november_first.replace('Z','+00:00'))-
                          datetime.fromisoformat(halloween.replace('Z','+00:00'))).total_seconds()/3600,
                         19+47/60, "DST crossing uses actual UTC elapsed hours, not wall-clock subtraction")

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

import csv
import hashlib
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
        self.assertGreaterEqual(len(data["captures"]), 42)
        self.assertEqual(len(data["capture_observations"]), 50*len(data["captures"]))
        self.assertEqual(len(data["session_observations"]), 50*len(data["sessions"]))
        self.assertEqual(len(data["observations"]), 50*len(data["checkpoints"]))
        self.assertEqual(len(data["evidence"]),sum(len(cp['evidence']) for cp in data['captures'])+len(data['profile_updates']))
        self.assertGreaterEqual(len(data["evidence"]),192)
        self.assertTrue(all(len([o for o in data["observations"] if o["checkpoint"] == cp["id"]]) == 50 for cp in data["checkpoints"]))
        proofs = {e["id"]: e for e in data["evidence"]}
        for row in data["observations"]:
            if row["status"] in ("verified","ocr_crosschecked","ocr_provisional"):
                self.assertTrue(row["username"] and row["balance"] and row["evidence"])
                self.assertTrue(all(proofs[e]["checkpoint"] in row["source_checkpoints"] and proofs[e]["min"] <= row["rank"] <= proofs[e]["max"] for e in row["evidence"]))
            if row["status"] in ("captured_pending_transcription", "not_captured"):
                self.assertFalse(row["balance"])
        self.assertFalse((ROOT/"data/source/data/observations.csv").exists(), "Excel-derived observations must not be an input")
        self.assertGreaterEqual(sum(cp['verified'] for cp in data['captures']),1960)
        self.assertEqual(sum(cp['coverage'] for cp in data['captures']),50*len(data['captures'])-sum(row['status']=='not_captured' for row in data['capture_observations']))
        self.assertGreaterEqual(sum(row['status']=='captured_pending_transcription' for row in data['capture_observations']),3)
        self.assertEqual(sum(row['status']=='verified' for row in data['session_observations']),sum(cp['verified'] for cp in data['sessions']))
        self.assertEqual(sum(row['status']=='verified' for row in data['observations']),sum(cp['verified'] for cp in data['checkpoints']))
        for row_id in ('2026-10-17_1014_R15','2026-11-04_0152_R16','2026-11-04_2101_R16'):
            self.assertEqual(next(row['status'] for row in data['capture_observations'] if row['id']==row_id),'captured_pending_transcription')
        self.assertGreaterEqual(sum(cp['complete'] for cp in data['checkpoints']),35)
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
        self.assertEqual([proofs[proof]['captured_at'] for proof in selected['primary_evidence']],[capture['at']]*4)
        self.assertEqual(selected['profile_updates'],['PU0001'])
        self.assertEqual(selected['evidence'],capture['evidence']+['PU0001'])
        self.assertEqual((proofs['EV0172']['min'],proofs['EV0172']['max']),(48,50))

    def test_november_13_complete_capture_preserves_previous_profile_time(self):
        data=self.data
        chosen=next(cp for cp in data['checkpoints'] if cp['day_key']=='2026-11-13')
        raw=next(cp for cp in data['captures'] if cp['id']=='2026-11-13_2152')
        self.assertEqual((chosen['id'],chosen['at']),('2026-11-13_2152','2026-11-14T03:52:00Z'))
        self.assertEqual((chosen['coverage'],chosen['verified'],chosen['complete']),(50,50,True))
        self.assertEqual(chosen['evidence'],['EV0173','EV0174','EV0175','EV0176'])
        self.assertEqual(raw['evidence'],chosen['evidence'])
        self.assertEqual(chosen['daily_source_sessions'],['2026-11-13_2152'])
        rows={row['rank']:row for row in data['observations'] if row['day_key']=='2026-11-13'}
        self.assertEqual((len(rows),rows[1]['balance'],rows[50]['balance']),(50,'309378891620','53905288849'))
        self.assertEqual((rows[13]['username'],rows[13]['balance']),('Ceruleanflare2','118861548522'))
        self.assertEqual((rows[24]['username'],rows[25]['username']),('LasTnIghT2011','JPaltaa'))
        self.assertEqual((rows[40]['username'],rows[45]['username']),('AliceSekai','zNaN_Rot'))
        self.assertEqual((rows[2]['balance'],rows[2]['evidence']),('270130469438',['EV0173']))
        previous=next(row for row in data['observations'] if row['day_key']=='2026-11-12' and row['key']==rows[2]['key'])
        self.assertEqual((previous['balance'],previous['at'],previous['balance_evidence']),('269064293664','2026-11-13T05:38:50Z',['PU0001']))
        self.assertEqual(int(rows[2]['balance'])-int(previous['balance']),1_066_175_774)
        self.assertEqual((datetime.fromisoformat(rows[2]['at'].replace('Z','+00:00'))-datetime.fromisoformat(previous['at'].replace('Z','+00:00'))).total_seconds(),22*3600+13*60+10)
        proofs={proof['id']:proof for proof in data['evidence']}
        self.assertEqual((proofs['EV0175']['min'],proofs['EV0175']['max']),(32,47))
        self.assertEqual((proofs['EV0176']['min'],proofs['EV0176']['max']),(47,50))

    def test_november_14_saturday_settlement_uses_latest_full_photo_and_keeps_both_originals(self):
        data=self.data
        saturday=[cp for cp in data['checkpoints'] if cp['day_key']=='2026-11-14']
        self.assertEqual(len(saturday),1)
        selected=saturday[0]
        self.assertTrue(selected['weekend_settlement'])
        self.assertEqual((selected['day_snapshot_number'],selected['day_snapshot_count']),(1,1))
        self.assertEqual((selected['verified'],selected['coverage']),(50,50))
        self.assertIn('2026-11-14_1124',selected['earlier_session_ids'])
        self.assertIn('2026-11-14_1128',selected['earlier_session_ids'])
        self.assertIn('2026-11-14_2223',selected['daily_source_sessions'])
        self.assertTrue(set(['EV0180','EV0181','EV0182','EV0183','EV0184','EV0185','EV0186','EV0187']).issubset(selected['evidence']))
        captures={cp['id']:cp for cp in data['captures']}
        morning=captures['2026-11-14_1124'];sell=captures['2026-11-14_1128']
        self.assertEqual((morning['at'],sell['at']),('2026-11-14T17:24:00Z','2026-11-14T17:28:00Z'))
        self.assertEqual((morning['verified'],sell['verified']),(50,50))
        rows={(row['checkpoint'],row['rank']):row for row in data['capture_observations']}
        before=rows[(morning['id'],2)];after=rows[(sell['id'],2)]
        self.assertEqual((before['key'],after['key']),('id:1316700350','id:1316700350'))
        self.assertEqual((before['balance'],after['balance']),('270468412868','295783485068'))
        self.assertEqual(int(after['balance'])-int(before['balance']),25_315_072_200)
        self.assertEqual((datetime.fromisoformat(after['at'].replace('Z','+00:00'))-datetime.fromisoformat(before['at'].replace('Z','+00:00'))).total_seconds(),240)
        self.assertEqual((rows[(morning['id'],50)]['balance'],rows[(sell['id'],50)]['balance']),('53947555782','53947556832'))
        self.assertEqual(rows[(sell['id'],50)]['evidence'],['EV0187'])
        if selected['id']==sell['id']:
            self.assertEqual(selected['at'],sell['at'])
            self.assertEqual(selected['primary_evidence'],sell['evidence'])
            self.assertEqual(selected['evidence'],morning['evidence']+sell['evidence'])
            self.assertEqual(next(row['balance'] for row in data['observations'] if row['checkpoint']==selected['id'] and row['rank']==2),after['balance'])
        proofs={item['id']:item for item in data['evidence']}
        self.assertEqual(proofs['EV0180']['sha256'],'1dcce2d5b1168dc520b06de4019f86ec54102d95acdf5674e5dbfb228753fbfe')
        self.assertEqual(proofs['EV0184']['sha256'],'4d7eaed39ae3d62fb8e94436360bb9d862e6fa390644cb3ad3799e833d10d59f')
        self.assertEqual(proofs['EV0187']['sha256'],'9e0708d707ab3669046f9da46e43d64c6651da4cef027134244f88ebb4bb9f0a')

    def test_november_14_late_full_capture_replaces_saturday_baseline_only(self):
        data=self.data
        late=next(cp for cp in data['captures'] if cp['id']=='2026-11-14_2223')
        self.assertEqual((late['at'],late['coverage'],late['verified']),('2026-11-15T04:23:00Z',50,50))
        self.assertEqual(late['evidence'],['EV0188','EV0189','EV0190','EV0191'])
        selected=next(cp for cp in data['checkpoints'] if cp['day_key']=='2026-11-14')
        self.assertTrue(selected['weekend_settlement'])
        self.assertIn(late['id'],selected['daily_source_sessions'])
        self.assertTrue(set(late['evidence']).issubset(selected['evidence']))
        if selected['id']==late['id']:
            self.assertEqual(selected['at'],late['at'])
            self.assertEqual(selected['daily_source_sessions'],['2026-11-14_1124','2026-11-14_1128',late['id']])
            self.assertEqual(selected['primary_evidence'],late['evidence'])
            self.assertEqual(len(selected['evidence']),12)
            by_day={row['rank']:row for row in data['observations'] if row['day_key']=='2026-11-14'}
            self.assertEqual(len(by_day),50)
            self.assertEqual((by_day[1]['balance'],by_day[2]['balance']),('310638173443','296016651408'))
            self.assertEqual((by_day[32]['username'],by_day[32]['balance'],by_day[32]['key']),('hc2khunowpng43ntk1','72629575868','id:11482999303'))
            self.assertEqual((by_day[50]['username'],by_day[50]['balance'],by_day[50]['evidence']),('1234mysterio','55494769267',['EV0191']))
            self.assertNotIn('ForcePush_Sith',[row['username'] for row in by_day.values()])
        self.assertTrue(next(player for player in data['players'] if player['key']=='id:11482999303')['headshot'])
        raw={row['id']:row for row in data['capture_observations']}
        self.assertEqual(int(raw['2026-11-14_2223_R02']['balance'])-int(raw['2026-11-14_1128_R02']['balance']),233_166_340)
        proofs={proof['id']:proof for proof in data['evidence']}
        self.assertEqual((proofs['EV0189']['min'],proofs['EV0189']['max']),(16,31))
        self.assertEqual((proofs['EV0190']['min'],proofs['EV0190']['max']),(30,45))
        self.assertEqual((proofs['EV0191']['min'],proofs['EV0191']['max']),(44,50))

    def test_november_15_complete_board_follows_saturday_baseline(self):
        data=self.data
        index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-15_2140')
        current=data['checkpoints'][index]
        previous=data['checkpoints'][index-1]
        self.assertEqual((current['day_key'],current['at'],current['precision']),('2026-11-15','2026-11-16T03:40:00Z','screenshot-filename-minute'))
        self.assertEqual((current['complete'],current['coverage'],current['verified'],current['weekend_settlement']),(True,50,50,False))
        self.assertEqual(current['primary_evidence'],['EV0192','EV0193','EV0194','EV0195'])
        self.assertEqual((current['evidence'],current['daily_source_sessions']),(current['primary_evidence'],['2026-11-15_2140']))
        self.assertEqual((previous['id'],previous['weekend_settlement']),('2026-11-14_2223',True))
        rows={row['rank']:row for row in data['observations'] if row['checkpoint']==current['id']}
        former={row['key']:row for row in data['observations'] if row['checkpoint']==previous['id']}
        self.assertEqual(len(rows),50)
        self.assertTrue(all(row['status']=='verified' and row['key'] in former for row in rows.values()))
        self.assertEqual((rows[1]['balance'],rows[2]['balance'],rows[50]['balance']),('310638245713','296175744231','55478619899'))
        self.assertEqual((rows[4]['username'],rows[4]['balance'],rows[5]['username']),('n6sy','188128107282','xNnoel'))
        self.assertEqual((rows[20]['username'],rows[20]['balance']),('0egoistic','92199178765'))
        self.assertEqual((rows[32]['username'],rows[32]['balance'],rows[32]['key'],rows[32]['evidence']),('hc2khunowpng43ntk1','72351910368','id:11482999303',['EV0193']))
        self.assertEqual(int(rows[32]['balance'])-int(former[rows[32]['key']]['balance']),-277_665_500)
        self.assertEqual(int(rows[2]['balance'])-int(former[rows[2]['key']]['balance']),159_092_823)
        self.assertEqual((rows[43]['balance'],rows[44]['balance'],rows[45]['balance']),('61871485099','61674336721','59417872848'))
        proofs={proof['id']:proof for proof in data['evidence']}
        for proof_id,filename,span in (
            ('EV0192','Screenshot_2026-11-15_213719.png',(1,16)),
            ('EV0193','Screenshot_2026-11-15_213923.png',(17,32)),
            ('EV0194','Screenshot_2026-11-15_214005.png',(30,45)),
            ('EV0195','Screenshot_2026-11-15_214017.png',(43,50)),
        ):
            proof=proofs[proof_id]
            self.assertEqual((proof['min'],proof['max']),span)
            self.assertTrue(proof['url'].endswith(filename))
            self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),proof['sha256'])

    def test_november_16_complete_board_preserves_verified_returning_identity(self):
        data=self.data
        index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-16_2223')
        current=data['checkpoints'][index]
        previous=data['checkpoints'][index-1]
        self.assertEqual((current['id'],current['at'],current['precision']),('2026-11-16_2223','2026-11-17T04:23:00Z','screenshot-filename-minute'))
        self.assertEqual((current['verified'],current['coverage'],current['complete'],current['weekend_settlement']),(50,50,True,False))
        self.assertEqual((previous['id'],previous['verified']),('2026-11-15_2140',50))
        self.assertEqual((current['primary_evidence'],current['daily_source_sessions']),(['EV0196','EV0197','EV0198','EV0199'],[current['id']]))
        rows={row['rank']:row for row in data['observations'] if row['checkpoint']==current['id']}
        old={row['key']:row for row in data['observations'] if row['checkpoint']==previous['id']}
        self.assertEqual(len(rows),50)
        self.assertTrue(all(row['status']=='verified' for row in rows.values()))
        self.assertEqual((rows[1]['balance'],rows[2]['balance'],rows[50]['balance']),('310638292243','298170470872','55616982300'))
        self.assertEqual(int(rows[2]['balance'])-int(old[rows[2]['key']]['balance']),1_994_726_641)
        self.assertEqual((rows[21]['username'],rows[22]['username']),('Aumjung8267','Canizan'))
        self.assertEqual((rows[32]['balance'],rows[32]['key']),('72353975828','id:11482999303'))
        self.assertEqual((rows[42]['username'],rows[43]['username']),('10ne17','pflugerson'))
        self.assertEqual((rows[48]['username'],rows[48]['balance'],rows[48]['key'],rows[48]['evidence']),('Minkib7661','57299541862','id:1528395974',['EV0199']))
        self.assertNotIn(rows[48]['key'],old)
        self.assertEqual(next(row['key'] for row in data['observations'] if row['day_key']=='2026-11-06' and row['username']=='Minkib7661'),rows[48]['key'])
        self.assertEqual(int(rows[48]['balance'])-int(old[next(row['key'] for row in data['observations'] if row['checkpoint']==previous['id'] and row['rank']==50)]['balance']),1_820_921_963)
        self.assertEqual(rows[50]['username'],'KNG_GBS')
        self.assertNotIn('1234mysterio',[row['username'] for row in rows.values()])
        proofs={proof['id']:proof for proof in data['evidence']}
        for proof_id,filename,span in (
            ('EV0196','Screenshot_2026-11-16_222242.png',(1,16)),
            ('EV0197','Screenshot_2026-11-16_222306.png',(16,31)),
            ('EV0198','Screenshot_2026-11-16_222317.png',(30,45)),
            ('EV0199','Screenshot_2026-11-16_222331.png',(36,50)),
        ):
            proof=proofs[proof_id]
            self.assertEqual((proof['min'],proof['max']),span)
            self.assertTrue(proof['url'].endswith(filename))
            self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),proof['sha256'])

    def test_november_17_new_leader_and_rank_15_have_exact_id_and_floor_bounds(self):
        data=self.data
        index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-17_2350')
        current=data['checkpoints'][index]
        previous=data['checkpoints'][index-1]
        self.assertEqual((current['id'],current['at'],current['precision']),('2026-11-17_2350','2026-11-18T05:50:00Z','screenshot-filename-minute'))
        self.assertEqual((current['verified'],current['coverage'],current['complete'],current['weekend_settlement']),(50,50,True,False))
        self.assertEqual((previous['id'],previous['verified']),('2026-11-16_2223',50))
        self.assertEqual((current['primary_evidence'],current['daily_source_sessions']),(['EV0200','EV0201','EV0202','EV0203'],[current['id']]))
        rows={row['rank']:row for row in data['observations'] if row['checkpoint']==current['id']}
        old={row['key']:row for row in data['observations'] if row['checkpoint']==previous['id']}
        self.assertEqual(len(rows),50)
        self.assertTrue(all(row['status']=='verified' for row in rows.values()))
        self.assertEqual((rows[1]['username'],rows[1]['balance'],rows[1]['key'],rows[1]['evidence']),('75percent3r','1195852462505654','id:8144154137',['EV0200']))
        self.assertEqual((rows[15]['username'],rows[15]['balance'],rows[15]['key']),('Farniluque049','119647603225','id:8204267816'))
        self.assertNotIn(rows[1]['key'],old)
        self.assertNotIn(rows[15]['key'],old)
        self.assertEqual((rows[2]['username'],rows[2]['balance'],rows[3]['balance']),('LowTierNova','310638332173','299419468977'))
        self.assertEqual((rows[34]['username'],rows[34]['balance']),('hc2khunowpng43ntk1','72353975828'))
        self.assertEqual((rows[50]['username'],rows[50]['balance']),('Minkib7661','57254241892'))
        self.assertNotIn('KNG_GBS',[row['username'] for row in rows.values()])
        self.assertNotIn('Zantrille',[row['username'] for row in rows.values()])
        self.assertEqual(int(rows[1]['balance'])-int(old[next(row['key'] for row in data['observations'] if row['checkpoint']==previous['id'] and row['rank']==50)]['balance']),1_195_796_845_523_354)
        self.assertEqual(int(rows[15]['balance'])-int(old[next(row['key'] for row in data['observations'] if row['checkpoint']==previous['id'] and row['rank']==50)]['balance']),64_030_620_925)
        proofs={proof['id']:proof for proof in data['evidence']}
        for proof_id,filename,span in (
            ('EV0200','Screenshot_2026-11-17_235001.png',(1,16)),
            ('EV0201','Screenshot_2026-11-17_235029.png',(16,31)),
            ('EV0202','Screenshot_2026-11-17_235048.png',(30,45)),
            ('EV0203','Screenshot_2026-11-17_235055.png',(36,50)),
        ):
            proof=proofs[proof_id]
            self.assertEqual((proof['min'],proof['max']),span)
            self.assertTrue(proof['url'].endswith(filename))
            self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),proof['sha256'])

    def test_november_18_full_capture_keeps_banned_leader_and_flags_cerulean(self):
        data=self.data
        index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-18_2237')
        current=data['checkpoints'][index]
        previous=data['checkpoints'][index-1]
        self.assertEqual((current['id'],current['at'],current['precision']),('2026-11-18_2237','2026-11-19T04:37:00Z','screenshot-filename-minute'))
        self.assertEqual((current['verified'],current['coverage'],current['complete'],current['weekend_settlement']),(50,50,True,False))
        self.assertEqual((previous['id'],previous['verified']),('2026-11-17_2350',50))
        self.assertEqual((current['primary_evidence'],current['daily_source_sessions']),(['EV0204','EV0205','EV0206','EV0207'],[current['id']]))
        rows={row['rank']:row for row in data['observations'] if row['checkpoint']==current['id']}
        earlier={row['key']:row for row in data['observations'] if row['checkpoint']==previous['id']}
        self.assertEqual(len(rows),50)
        self.assertTrue(all(row['status']=='verified' for row in rows.values()))
        self.assertEqual((rows[1]['username'],rows[1]['balance'],rows[1]['key']),('75percent3r','1195852462505654','id:8144154137'))
        self.assertEqual((rows[2]['balance'],rows[3]['balance'],rows[50]['balance']),('316432240192','300245789872','56911822954'))
        self.assertEqual((rows[7]['username'],rows[7]['balance'],rows[7]['evidence']),('Ceruleanflare2','179087576757',['EV0204']))
        prior=earlier[rows[7]['key']]
        self.assertEqual((prior['rank'],prior['balance']),(14,'123676737521'))
        self.assertEqual((prior['rank']-rows[7]['rank'],int(rows[7]['balance'])-int(prior['balance'])),(7,55_410_839_236))
        self.assertEqual((rows[33]['username'],rows[33]['balance']),('hc2khunowpng43ntk1','72353975828'))
        self.assertEqual((rows[50]['username'],rows[50]['key']),('Zantrille','id:5088236758'))
        self.assertNotIn('Farniluque049',[row['username'] for row in rows.values()])
        proofs={proof['id']:proof for proof in data['evidence']}
        for proof_id,filename,span in (
            ('EV0204','Screenshot_2026-11-18_223552.png',(1,16)),
            ('EV0205','Screenshot_2026-11-18_223637.png',(16,31)),
            ('EV0206','Screenshot_2026-11-18_223657.png',(30,45)),
            ('EV0207','Screenshot_2026-11-18_223704.png',(36,50)),
        ):
            proof=proofs[proof_id]
            self.assertEqual((proof['min'],proof['max']),span)
            self.assertTrue(proof['url'].endswith(filename))
            self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),proof['sha256'])

    def test_november_20_early_am_completes_november_19_cycle_with_original_time(self):
        data=self.data
        index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-20_0008')
        current=data['checkpoints'][index]
        previous=data['checkpoints'][index-1]
        raw=next(cp for cp in data['captures'] if cp['id']=='2026-11-20_0008')
        self.assertEqual((raw['at'],raw['verified'],raw['coverage']),('2026-11-20T06:08:00Z',50,50))
        self.assertEqual((current['id'],current['day_key'],current['early_am_rollover']),('2026-11-20_0008','2026-11-19',True))
        self.assertEqual(current['day_snapshot_count'],1)
        self.assertEqual((current['complete'],current['verified'],current['coverage'],current['weekend_settlement']),(True,50,50,False))
        self.assertEqual((current['primary_evidence'],current['daily_source_sessions']),(['EV0208','EV0209','EV0210','EV0211'],[raw['id']]))
        self.assertEqual((previous['id'],previous['day_key']),('2026-11-18_2237','2026-11-18'))
        previous_rows={row['rank']:row for row in data['observations'] if row['checkpoint']==previous['id']}
        self.assertEqual((previous_rows[1]['username'],previous_rows[7]['balance']),('75percent3r','179087576757'))
        rows={row['rank']:row for row in data['observations'] if row['checkpoint']==current['id']}
        self.assertEqual(len(rows),50)
        self.assertTrue(all(row['status']=='verified' and row['day_key']=='2026-11-19' for row in rows.values()))
        self.assertEqual((rows[1]['username'],rows[1]['balance'],rows[2]['balance']),('LowTierNova','317828434415','302070128990'))
        self.assertEqual((rows[6]['username'],rows[6]['balance']),('Ceruleanflare2','179111299561'))
        self.assertEqual((rows[48]['username'],rows[48]['balance'],rows[48]['key']),('sanguifereum','59059200357','id:8804353958'))
        self.assertEqual((rows[50]['username'],rows[50]['balance']),('Zantrille','56911822954'))
        self.assertEqual(int(rows[48]['balance'])-int(previous_rows[50]['balance']),2_147_377_403)
        self.assertNotIn('75percent3r',[row['username'] for row in rows.values()])
        proofs={proof['id']:proof for proof in data['evidence']}
        for proof_id,filename,span in (
            ('EV0208','Screenshot_2026-11-20_000725.png',(1,16)),
            ('EV0209','Screenshot_2026-11-20_000745.png',(16,31)),
            ('EV0210','Screenshot_2026-11-20_000757.png',(30,45)),
            ('EV0211','Screenshot_2026-11-20_000804.png',(36,50)),
        ):
            proof=proofs[proof_id]
            self.assertEqual((proof['min'],proof['max']),span)
            self.assertTrue(proof['url'].endswith(filename))
            self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),proof['sha256'])

    def test_november_20_evening_starts_its_own_day_after_early_am_prior_cycle(self):
        data=self.data
        index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-20_2256')
        current=data['checkpoints'][index]
        previous=data['checkpoints'][index-1]
        self.assertEqual((current['id'],current['day_key'],current['at']),('2026-11-20_2256','2026-11-20','2026-11-21T04:56:00Z'))
        self.assertEqual((previous['id'],previous['day_key'],previous['at']),('2026-11-20_0008','2026-11-19','2026-11-20T06:08:00Z'))
        self.assertFalse(current['early_am_rollover'])
        self.assertEqual((current['verified'],current['coverage'],current['complete']),(50,50,True))
        self.assertEqual((current['primary_evidence'],current['daily_source_sessions']),(['EV0212','EV0213','EV0214','EV0215'],[current['id']]))
        rows={row['rank']:row for row in data['observations'] if row['checkpoint']==current['id']}
        earlier={row['key']:row for row in data['observations'] if row['checkpoint']==previous['id']}
        self.assertEqual(len(rows),50)
        self.assertTrue(all(row['status']=='verified' and row['day_key']=='2026-11-20' for row in rows.values()))
        self.assertEqual((rows[1]['balance'],rows[2]['balance'],rows[50]['balance']),('319490885797','303092694285','56911822954'))
        self.assertEqual((rows[6]['username'],rows[6]['balance']),('Ceruleanflare2','179135125490'))
        self.assertEqual((rows[48]['username'],rows[48]['balance'],rows[48]['key'],rows[48]['evidence']),('sanguifereum','59062373946','id:8804353958',['EV0215']))
        self.assertEqual(int(rows[48]['balance'])-int(earlier[rows[48]['key']]['balance']),3_173_589)
        self.assertNotIn('75percent3r',[row['username'] for row in rows.values()])
        proofs={proof['id']:proof for proof in data['evidence']}
        for proof_id,filename,span in (
            ('EV0212','Screenshot_2026-11-20_225526.png',(1,16)),
            ('EV0213','Screenshot_2026-11-20_225620.png',(16,31)),
            ('EV0214','Screenshot_2026-11-20_225634.png',(30,41)),
            ('EV0215','Screenshot_2026-11-20_225644.png',(36,50)),
        ):
            proof=proofs[proof_id]
            self.assertEqual((proof['min'],proof['max']),span)
            self.assertTrue(proof['url'].endswith(filename))
            self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),proof['sha256'])

    def test_november_21_saturday_settlement_flags_verified_gains_without_earning_rate(self):
        data=self.data
        index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-21_2214')
        current=data['checkpoints'][index]
        previous=data['checkpoints'][index-1]
        self.assertEqual((current['id'],current['day_key'],current['at']),('2026-11-21_2214','2026-11-21','2026-11-22T04:14:00Z'))
        self.assertEqual((current['complete'],current['coverage'],current['verified'],current['weekend_settlement'],current['precision']),(True,50,50,True,'user-supplied'))
        self.assertEqual((previous['id'],previous['weekend_settlement']),('2026-11-20_2256',False))
        self.assertEqual((current['primary_evidence'],current['daily_source_sessions']),(['EV0216','EV0217','EV0218','EV0219'],[current['id']]))
        rows={row['rank']:row for row in data['observations'] if row['checkpoint']==current['id']}
        before={row['key']:row for row in data['observations'] if row['checkpoint']==previous['id']}
        self.assertEqual(len(rows),50)
        self.assertTrue(all(row['status']=='verified' for row in rows.values()))
        self.assertEqual((rows[1]['username'],rows[1]['balance'],rows[2]['balance']),('ismyaimbotworking','346829902904','321171513317'))
        self.assertEqual((before[rows[1]['key']]['rank'],before[rows[1]['key']]['balance']),(2,'303092694285'))
        self.assertEqual(int(rows[1]['balance'])-int(before[rows[1]['key']]['balance']),43_737_208_619)
        self.assertEqual((rows[31]['username'],rows[31]['balance'],rows[31]['evidence']),('sabbath553','73958417974',['EV0217']))
        self.assertEqual((before[rows[31]['key']]['rank'],before[rows[31]['key']]['balance']),(41,'64036705041'))
        self.assertEqual((before[rows[31]['key']]['rank']-rows[31]['rank'],int(rows[31]['balance'])-int(before[rows[31]['key']]['balance'])),(10,9_921_712_933))
        self.assertEqual((rows[50]['username'],rows[50]['balance'],rows[50]['key']),('ForcePush_Sith','58029148644','id:4700793500'))
        self.assertNotIn(rows[50]['key'],before)
        self.assertEqual(int(rows[50]['balance'])-int(next(row['balance'] for row in before.values() if row['rank']==50)),1_117_325_690)
        self.assertNotIn('Zantrille',[row['username'] for row in rows.values()])
        self.assertNotIn('75percent3r',[row['username'] for row in rows.values()])
        proofs={proof['id']:proof for proof in data['evidence']}
        for proof_id,span,digest in (
            ('EV0216',(1,16),'a68daa9ce2cc84b1d226a6665a851e99a3b70ee10eda266984b1adb6a56064ee'),
            ('EV0217',(16,31),'d365bef023f428282a50f379fbbe05c7b9a677710c800cd4319d71866e4da3a7'),
            ('EV0218',(30,45),'e142729c85c05575dff8acc386d918d5e12031872bce3ab39a8e92cb303f28ed'),
            ('EV0219',(36,50),'27aa6e22cb05027b071ecacc594b6cd42a01d0eb5113dffdd6f61064f8a22870'),
        ):
            proof=proofs[proof_id]
            self.assertEqual((proof['min'],proof['max']),span)
            self.assertEqual(proof['sha256'],digest)
            self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),digest)
        with (ROOT/'data/source/data/evidence_manifest.csv').open(encoding='utf-8-sig',newline='') as stream:
            original_names={row['evidence_id']:row['original_filename'] for row in csv.DictReader(stream)}
        self.assertTrue(all(original_names[proof_id]=='image.png' for proof_id in current['primary_evidence']))

    def test_november_22_sunday_is_separate_from_weekend_settlement(self):
        data=self.data
        index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-22_2213')
        current=data['checkpoints'][index]
        previous=data['checkpoints'][index-1]
        self.assertEqual((current['id'],current['day_key'],current['at']),('2026-11-22_2213','2026-11-22','2026-11-23T04:13:00Z'))
        self.assertEqual((current['complete'],current['coverage'],current['verified'],current['weekend_settlement'],current['precision']),(True,50,50,False,'user-supplied'))
        self.assertEqual((previous['id'],previous['weekend_settlement']),('2026-11-21_2214',True))
        self.assertEqual((current['primary_evidence'],current['daily_source_sessions']),(['EV0220','EV0221','EV0222','EV0223'],[current['id']]))
        rows={row['rank']:row for row in data['observations'] if row['checkpoint']==current['id']}
        before={row['key']:row for row in data['observations'] if row['checkpoint']==previous['id']}
        self.assertEqual(len(rows),50)
        self.assertTrue(all(row['status']=='verified' for row in rows.values()))
        self.assertEqual((rows[1]['username'],rows[1]['balance'],rows[2]['balance']),('ismyaimbotworking','346827970518','322555706255'))
        self.assertEqual((int(rows[1]['balance'])-int(before[rows[1]['key']]['balance']),int(rows[2]['balance'])-int(before[rows[2]['key']]['balance'])),(-1_932_386,1_384_192_938))
        self.assertEqual((rows[31]['username'],rows[31]['balance']),('sabbath553','74013903088'))
        self.assertEqual((rows[48]['username'],rows[48]['balance']),('sanguifereum','59062376966'))
        self.assertEqual((rows[50]['username'],rows[50]['balance']),('ForcePush_Sith','57979483659'))
        self.assertEqual(int(rows[50]['balance'])-int(before[rows[50]['key']]['balance']),-49_664_985)
        self.assertTrue(all(row['key'] in before for row in rows.values()))
        self.assertEqual(next(row['balance'] for row in data['observations'] if row['checkpoint']==previous['id'] and row['rank']==1),'346829902904')
        proofs={proof['id']:proof for proof in data['evidence']}
        for proof_id,span,digest in (
            ('EV0220',(1,16),'d7c07542ef48f61d52ffff5b66fd8ff86c370eb475269e6ad1a1de3849d9b337'),
            ('EV0221',(16,31),'77c7943143e59e6b1e17ffeb697e43566c946d9412821e9ba87f7c41b58d521c'),
            ('EV0222',(30,45),'c99cc9db0dc8ced802c2aa15c45e9a08863d138e93f1eae9a9e30ce8c533224a'),
            ('EV0223',(36,50),'15d326d2705a2266e41779e04c782a3e6c0cae220c8f5e17ccb12950a4256393'),
        ):
            proof=proofs[proof_id]
            self.assertEqual((proof['min'],proof['max']),span)
            self.assertEqual(proof['sha256'],digest)
            self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),digest)
        with (ROOT/'data/source/data/evidence_manifest.csv').open(encoding='utf-8-sig',newline='') as stream:
            original_names={row['evidence_id']:row['original_filename'] for row in csv.DictReader(stream)}
        self.assertTrue(all(original_names[proof_id]=='image.png' for proof_id in current['primary_evidence']))

    def test_november_23_owner_minute_and_exact_leaders_preserve_original_proof(self):
        data=self.data
        index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-23_2317')
        current=data['checkpoints'][index]
        previous=data['checkpoints'][index-1]
        self.assertEqual((current['day_key'],current['local'],current['at'],current['precision']),('2026-11-23','2026-11-23T23:17:00-06:00','2026-11-24T05:17:00Z','user-supplied'))
        self.assertEqual((current['complete'],current['coverage'],current['verified'],current['weekend_settlement'],current['early_am_rollover']),(True,50,50,False,False))
        self.assertEqual((current['primary_evidence'],current['daily_source_sessions']),(['EV0224','EV0225','EV0226','EV0227'],[current['id']]))
        self.assertEqual((previous['id'],previous['at'],previous['verified']),('2026-11-22_2213','2026-11-23T04:13:00Z',50))
        rows={row['rank']:row for row in data['observations'] if row['checkpoint']==current['id']}
        self.assertEqual(set(rows),set(range(1,51)))
        self.assertTrue(all(row['status']=='verified' and row['at']==current['at'] for row in rows.values()))
        self.assertEqual((rows[1]['username'],rows[1]['balance']),('BloxHeroj8','23018702725151'))
        self.assertEqual((rows[2]['username'],rows[2]['balance']),('Nexvolt00','23000015499673'))
        self.assertEqual(next(row['balance'] for row in data['observations'] if row['checkpoint']==previous['id'] and row['rank']==1),'346827970518')
        proofs={proof['id']:proof for proof in data['evidence']}
        with (ROOT/'data/source/data/evidence_manifest.csv').open(encoding='utf-8-sig',newline='') as stream:
            original_names={row['evidence_id']:row['original_filename'] for row in csv.DictReader(stream)}
        for proof_id,span,filename,digest in (
            ('EV0224',(1,16),'image(20261124-051724).png','0d95a78accc2e142ff9c61370c5e0ca4df4852b79dd7d87b0a036f355248c660'),
            ('EV0225',(16,31),'image(20261124-051744).png','e0cd15dbaffb319a1ebbf21c177ca9b21f29cef5b73e09fe26d643b37b9e2284'),
            ('EV0226',(30,45),'image(20261124-051801).png','4c605df8bb4922f09ef79ed9e23212d307264c424542a30f94b6342f3d0e375a'),
            ('EV0227',(36,50),'image(20261124-051813).png','0173b4aa57be48a69702a501724e13d185dd395167816f3b6403307cc7dbd361'),
        ):
            with self.subTest(evidence=proof_id):
                proof=proofs[proof_id]
                self.assertEqual((proof['min'],proof['max']),span)
                self.assertEqual((proof['checkpoint'],proof['captured_at']),(current['id'],current['at']))
                self.assertEqual(original_names[proof_id],filename)
                self.assertEqual(proof['sha256'],digest)
                self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),digest)

    def test_lower_band_backfills_complete_three_existing_days_without_rewriting_oct30_rank_47(self):
        data=self.data
        days={cp['day_key']:cp for cp in data['checkpoints']}
        by_day={(row['day_key'],row['rank']):row for row in data['observations']}
        proofs={proof['id']:proof for proof in data['evidence']}
        for day,checkpoint,new_proof,rank,username,balance in (
            ('2026-10-23','2026-10-23_2200','EV0177',36,'NoRoblox_Support','59651360685'),
            ('2026-10-30','2026-10-30_2253','EV0178',33,'johncenagaming347v2','66225096182'),
            ('2026-11-02','2026-11-02_2128','EV0179',33,'kawaiicatsophi67','66832438429'),
        ):
            selected=days[day]
            self.assertEqual(selected['id'],checkpoint)
            self.assertEqual((selected['verified'],selected['coverage'],selected['complete']),(50,50,True))
            self.assertIn(new_proof,selected['evidence'])
            self.assertEqual((by_day[(day,rank)]['username'],by_day[(day,rank)]['balance']), (username,balance))
            self.assertEqual(by_day[(day,rank)]['evidence'],[new_proof])
            self.assertEqual(hashlib.sha256((ROOT/'site'/proofs[new_proof]['url']).read_bytes()).hexdigest(),proofs[new_proof]['sha256'])
        self.assertEqual((by_day[('2026-10-23',46)]['username'],by_day[('2026-10-23',46)]['balance']),('BigBoyyChriss','52529149818'))
        self.assertEqual((by_day[('2026-10-30',45)]['username'],by_day[('2026-10-30',45)]['balance']),('1234mysterio','55619059997'))
        later=by_day[('2026-10-30',47)]
        self.assertEqual((later['username'],later['balance'],later['evidence']),('zackbourbon','54021982503',['EV0082']))
        with (ROOT/'data/source/data/evidence_manifest.csv').open(encoding='utf-8-sig',newline='') as stream:
            self.assertIn('54021982113',next(row['notes'] for row in csv.DictReader(stream) if row['evidence_id']=='EV0178'))
        self.assertEqual((by_day[('2026-11-02',47)]['username'],by_day[('2026-11-02',47)]['balance']),('10ne17','54914164531'))
        self.assertEqual(by_day[('2026-11-02',33)]['key'],next(row['key'] for row in data['observations'] if row['day_key']=='2026-11-13' and row['username']=='ewoofs'))

    def test_apathy_profile_photo_updates_only_the_balance_and_uses_exact_photo_interval(self):
        data=self.data
        self.assertEqual(data['version'],6)
        self.assertEqual(len(data['profile_updates']),1)
        update=data['profile_updates'][0]
        old=next(row for row in data['capture_observations'] if row['id']=='2026-11-12_2258_R02')
        latest=next(row for row in data['observations'] if row['day_key']=='2026-11-12' and row['key']==old['key'])
        previous=next(row for row in data['observations'] if row['day_key']=='2026-11-11' and row['key']==old['key'])
        self.assertEqual((update['id'],update['key'],update['source_rank']),('PU0001','id:1316700350',2))
        self.assertEqual((old['balance'],old['at']),("268545154674","2026-11-13T04:58:00Z"))
        self.assertEqual((latest['balance'],latest['at']),('269064293664','2026-11-13T05:38:50Z'))
        self.assertEqual((latest['board_balance'],latest['board_at']),(old['balance'],'2026-11-13T04:56:50Z'))
        self.assertEqual((latest['rank'],latest['evidence'],latest['balance_evidence']),(2,['EV0169'],['PU0001']))
        self.assertEqual((update['source_balance'],update['source_evidence']),('268545154674','EV0169'))
        self.assertEqual(int(latest['balance'])-int(update['source_balance']),519_138_990)
        self.assertEqual((datetime.fromisoformat(update['at'].replace('Z','+00:00'))-datetime.fromisoformat(update['source_at'].replace('Z','+00:00'))).total_seconds(),42*60)
        self.assertEqual(round(519_138_990/(42/60)),741_627_129)
        self.assertEqual(int(latest['balance'])-int(previous['balance']),1_010_878_152)
        elapsed=(datetime.fromisoformat(latest['at'].replace('Z','+00:00'))-datetime.fromisoformat(previous['at'].replace('Z','+00:00'))).total_seconds()/3600
        self.assertAlmostEqual(elapsed,23+2/60+50/3600)
        self.assertEqual(round(1_010_878_152/elapsed),43_861_171)
        self.assertEqual(next(row['balance'] for row in data['capture_observations'] if row['id']=='2026-11-12_2258_R01'),'307471340304')
        proof=next(proof for proof in data['evidence'] if proof['id']=='PU0001')
        self.assertEqual((proof['kind'],proof['min'],proof['max']),("profile",None,None))
        self.assertEqual(proof['captured_at'],latest['at'])
        self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),proof['sha256'])

    def test_daily_import_rejects_duplicate_checkpoint_without_changing_originals(self):
        photo=ROOT/'site/evidence/screenshots/2026-11-11_2233/EV0161_Screenshot_2026-11-11_223212.png'
        self.assertTrue(photo.is_file())
        width,height=png_metadata(photo)
        self.assertGreater(width,400)
        self.assertGreater(height,350)
        with self.assertRaisesRegex(ValueError,'Checkpoint already exists'):
            prepare(SimpleNamespace(date='2026-11-11',time='22:33',image=[],precision='user-supplied'))

    def test_owner_november_26_mark_preserves_november_27_real_timestamp(self):
        capture = next(cp for cp in self.data['checkpoints'] if cp['id']=='2026-11-27_0221')
        self.assertEqual((capture['day_key'],capture['at'],capture['local']),
                         ('2026-11-26','2026-11-27T08:21:00Z','2026-11-27T02:21:00-06:00'))
        self.assertEqual((capture['verified'],capture['coverage'],capture['complete'],capture['early_am_rollover']),
                         (50,50,True,True))
        self.assertEqual(capture['primary_evidence'],['EV0236','EV0237','EV0238','EV0239'])
        rows={r['rank']:r for r in self.data['observations'] if r['checkpoint']==capture['id']}
        self.assertEqual(len(rows),50)
        self.assertEqual((rows[4]['username'],rows[4]['balance']),('ismyaimbotworking','349127410768'))
        self.assertEqual((rows[50]['username'],rows[50]['balance']),('Minkib7661','61606102687'))
        proofs={p['id']:p for p in self.data['evidence']}
        for image_id in capture['primary_evidence']:
            proof=proofs[image_id]
            self.assertEqual(proof['captured_at'],'2026-11-27T08:21:00Z')
            self.assertEqual(hashlib.sha256((ROOT/'site'/proof['url']).read_bytes()).hexdigest(),proof['sha256'])

    def test_explicit_daily_override_leaves_normal_cutoff_unchanged(self):
        cp={'id':'manual','at':'2026-11-27T08:21:00Z','captured_from':'2026-11-27T08:21:00Z',
            'captured_to':'2026-11-27T08:21:00Z','source_checkpoints':['manual'],
            'evidence':['proof'],'coverage':50,'verified':50,'visible':50,'complete':True}
        obs=[{'checkpoint':'manual','rank':rank,'id':f'manual_R{rank:02d}',
              'status':'verified','balance':str(100-rank),'username':f'user{rank}',
              'key':f'user:{rank}','evidence':['proof'],'at':cp['at']} for rank in range(1,51)]
        plain,_,_,_=select_daily([cp],obs,[cp])
        custom,_,_,_=select_daily([cp],obs,[cp],day_overrides={'manual':'2026-11-26'})
        self.assertEqual(plain[0]['day_key'],'2026-11-27')
        self.assertEqual((custom[0]['day_key'],custom[0]['at']),('2026-11-26',cp['at']))
        with self.assertRaises(ValueError):
            select_daily([cp],obs,[cp],day_overrides={'manual':'2026-11-25'})

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

    def test_saturday_selects_one_latest_full_settlement_and_keeps_earlier_proofs(self):
        def photo(name,at,complete=True):
            return {'id':name,'at':at,'captured_from':at,'captured_to':at,
                    'source_checkpoints':[name],'evidence':[name],
                    'coverage':50 if complete else 16,'verified':50 if complete else 16,
                    'visible':50 if complete else 16,'complete':complete}
        def readings(cp):
            return [{'checkpoint':cp['id'],'rank':rank,'id':f"{cp['id']}_R{rank:02d}",
                     'status':'verified' if cp['complete'] or rank<=16 else 'not_captured',
                     'balance':str(100_000_000_000-rank+len(cp['id'])) if cp['complete'] or rank<=16 else '',
                     'username':f'user{rank}' if cp['complete'] or rank<=16 else '',
                     'key':f'id:{rank}' if cp['complete'] or rank<=16 else '',
                     'evidence':[cp['id']] if cp['complete'] or rank<=16 else [],'at':cp['at']}
                    for rank in range(1,51)]
        friday=photo('friday','2026-11-14T03:52:00Z')
        before=photo('before','2026-11-14T17:24:00Z')
        partial=photo('partial','2026-11-14T17:26:00Z',False)
        sell=photo('sell','2026-11-14T17:28:00Z')
        evening=photo('evening','2026-11-15T03:00:00Z')
        sunday=photo('sunday','2026-11-15T17:00:00Z')
        sources=[friday,before,partial,sell,evening,sunday]
        chosen,rows,_,assignment=select_daily(sources,sum((readings(cp) for cp in sources),[]),sources)
        self.assertEqual([(cp['day_key'],cp['id']) for cp in chosen],[
            ('2026-11-13','friday'),('2026-11-14','evening'),('2026-11-15','sunday')])
        self.assertEqual((chosen[1]['day_snapshot_number'],chosen[1]['day_snapshot_count']),(1,1))
        self.assertTrue(chosen[1]['weekend_settlement'])
        self.assertFalse(chosen[0]['weekend_settlement'])
        self.assertEqual(chosen[1]['earlier_session_ids'],['before','partial','sell'])
        self.assertEqual(chosen[1]['daily_source_sessions'],['before','partial','sell','evening'])
        self.assertEqual(chosen[1]['evidence'],['before','partial','sell','evening'])
        self.assertEqual(assignment['partial'],'2026-11-14')
        self.assertEqual([row['checkpoint'] for row in rows if row['day_key']=='2026-11-14' and row['rank']==2],['evening'])
        now=[friday,before,partial,sell]
        current,_,_,_=select_daily(now,sum((readings(cp) for cp in now),[]),now)
        self.assertEqual(current[-1]['id'],'sell')
        self.assertEqual(current[-1]['evidence'],['before','partial','sell'])
        old_morning=photo('old_morning','2026-10-31T15:00:00Z')
        old_evening=photo('old_evening','2026-11-01T04:40:00Z')
        old=[old_morning,old_evening]
        older,_,_,_=select_daily(old,sum((readings(cp) for cp in old),[]),old)
        self.assertEqual([cp['id'] for cp in older],['old_evening'])
        self.assertTrue(older[0]['weekend_settlement'])
        next_morning=photo('next_morning','2026-11-16T16:00:00Z')
        next_noon=photo('next_noon','2026-11-16T18:00:00Z')
        weekday=[next_morning,next_noon]
        selected,_,_,_=select_daily(weekday,sum((readings(cp) for cp in weekday),[]),weekday)
        self.assertEqual([cp['id'] for cp in selected],['next_noon'],"Other weekdays still show only the latest session")

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

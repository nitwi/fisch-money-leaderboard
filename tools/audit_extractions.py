"""Compare fresh screenshot-only OCR candidates to independently photo-read rows."""
import csv
from collections import Counter,defaultdict
from pathlib import Path

root=Path(__file__).resolve().parents[1]
def rows(name):
    with (root/name).open(encoding='utf-8-sig',newline='') as h:
        return list(csv.DictReader(h))
manual={r['observation_id']:r for r in rows('data/reviewed.csv')}
extracted={r['observation_id']:r for r in rows('data/screenshot_extractions.csv')}
stats=Counter();misses=defaultdict(list)
for key,manual_row in manual.items():
    found=extracted.get(key)
    if not found:
        stats['manual_not_found']+=1
        misses[key.rsplit('_R',1)[0]].append(key.rsplit('_R',1)[1])
        continue
    stats['matched_manual_rows']+=1
    if found['username_raw'].casefold()==manual_row['username_raw'].casefold():stats['name_match']+=1
    if found['balance_c']==manual_row['balance_c']:stats['money_match']+=1
    if found['balance_c']==manual_row['balance_c'] and found['username_raw'].casefold()==manual_row['username_raw'].casefold():stats['both_match']+=1
    else:
        print(f"DIFFER {key} OCR={found['username_raw']}:{found['balance_c']} PHOTO={manual_row['username_raw']}:{manual_row['balance_c']} conf={found['confidence']} conflict={found['conflict']}")
print('SUMMARY',dict(stats))
print('MANUALLY_READ_ROWS_OCR_MISSED', {key:','.join(ranks) for key,ranks in misses.items()})
print('NEW_SCREENSHOT_OCR_ROWS',len(set(extracted)-set(manual)))

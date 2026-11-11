"""Assess second OCR engine against only photo-confirmed measurements."""
import csv,json
from collections import Counter,defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
with (ROOT/'data/reviewed.csv').open(encoding='utf-8-sig',newline='') as h:
    checked={r['observation_id']:r for r in csv.DictReader(h)}
draft=json.loads((ROOT/'data/tesseract_draft.json').read_text(encoding='utf-8'))
counts=Counter();matched=defaultdict(list)
for image_id,image in draft.items():
    for rank,row in image['rows'].items():
        key=f'{image["checkpoint"]}_R{int(rank):02d}'
        if key in checked:
            if row['balance']==checked[key]['balance_c']:counts['money_matches']+=1
            else:counts['money_mismatches']+=1
            if row['name'].casefold()==checked[key]['username_raw'].casefold():counts['name_matches']+=1
            else:counts['name_mismatches']+=1
        matched[key].append((row['name'],row['balance']))
print(dict(counts))
print('unique rows',len(matched),'overlap manually checked',len(set(matched)&set(checked)))

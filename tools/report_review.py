"""Show per-rank original-image OCR next to already photo-checked readings."""
import csv
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1]
capture=sys.argv[1]
def read(path):
    with (root/path).open(encoding='utf-8-sig',newline='') as stream:
        return list(csv.DictReader(stream))
candidate={r['observation_id']:r for r in read('data/screenshot_extractions.csv')}
checked={r['observation_id']:r for r in read('data/reviewed.csv')}
photo_path=root/'data/photo_verified.csv'
if photo_path.exists():
    checked.update({r['observation_id']:r for r in read('data/photo_verified.csv')})
proofs=read('data/source/data/evidence_manifest.csv')
for rank in range(1,51):
    key=f'{capture}_R{rank:02d}'
    evidence=';'.join(p['evidence_id'] for p in proofs if p['checkpoint_id']==capture and int(p['min_visible_rank'])<=rank<=int(p['max_visible_rank']))
    if not evidence:continue
    found=candidate.get(key,{});saved=checked.get(key,{})
    status='V' if saved else ('!' if found.get('conflict')=='yes' else '?')
    name=saved.get('username_raw') or found.get('username_raw') or ''
    money=saved.get('balance_c') or found.get('balance_c') or ''
    print(f'{status} #{rank:02d} {name:<24} {money:>13} [{evidence}]')

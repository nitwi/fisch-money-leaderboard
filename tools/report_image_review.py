"""One original PNG's photographed ranks beside OCR candidates and corrections."""
import csv,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
def read(path):
    with (root/path).open(encoding='utf-8-sig',newline='') as h:return list(csv.DictReader(h))
id=sys.argv[1]
proof=next(row for row in read('data/source/data/evidence_manifest.csv') if row['evidence_id']==id)
ocr={row['observation_id']:row for row in read('data/screenshot_extractions.csv')}
manual={row['observation_id']:row for row in read('data/reviewed.csv')}
print(id,proof['checkpoint_id'],proof['relative_path'])
for rank in range(int(proof['min_visible_rank']),int(proof['max_visible_rank'])+1):
    key=f"{proof['checkpoint_id']}_R{rank:02d}"
    photo=manual.get(key)
    row=photo or ocr.get(key)
    if not row:print(f'#{rank:02d} NO OCR READING');continue
    tag='PHOTO' if photo else ('OTHER IMAGE' if id not in row['evidence_ids'].split(';') else 'OCR')
    print(f"#{rank:02d} {tag:<11} {row['username_raw']:<23} {row['balance_c']:>14} {'CONFLICT' if row.get('conflict')=='yes' else ''}")

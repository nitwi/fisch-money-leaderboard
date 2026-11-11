#!/usr/bin/env python3
"""Print source seed and OCR candidates, with original proof IDs, for one capture."""
import csv
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
capture = sys.argv[1]
max_rank = int(sys.argv[2]) if len(sys.argv) > 2 else 50
with (root / "data/source/data/evidence_manifest.csv").open(encoding="utf-8-sig", newline="") as handle:
    proofs = [row for row in csv.DictReader(handle) if row['checkpoint_id'] == capture]
with (root / "data/reviewed.csv").open(encoding="utf-8-sig", newline="") as handle:
    reviewed = {row['observation_id']:row for row in csv.DictReader(handle)}
draft = json.loads((root / "data/ocr_draft.json").read_text(encoding="utf-8"))
for rank in range(1, max_rank+1):
    suggestions = []
    for proof in proofs:
        if not int(proof['min_visible_rank']) <= rank <= int(proof['max_visible_rank']):
            continue
        image_id=proof['evidence_id']
        item = draft.get(image_id, {}).get("rows", {}).get(str(rank))
        if item:
            suggestions.append(f"{image_id}:{item['name']}={item['balance']}")
    accepted=reviewed.get(f'{capture}_R{rank:02d}')
    verified=f" [photo checked {accepted['username_raw']}={accepted['balance_c']}]" if accepted else ""
    print(f"#{rank:>2} {'; '.join(suggestions) or '?':<55}{verified}")

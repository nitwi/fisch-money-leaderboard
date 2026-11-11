#!/usr/bin/env python3
"""Print source seed and OCR candidates, with original proof IDs, for one capture."""
import csv
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
capture = sys.argv[2]
max_rank = int(sys.argv[3]) if len(sys.argv) > 3 else 50
with (source / "data/observations.csv").open(encoding="utf-8-sig", newline="") as handle:
    rows = [row for row in csv.DictReader(handle) if row["checkpoint_id"] == capture]
draft = json.loads((root / "data/ocr_draft.json").read_text(encoding="utf-8"))
for row in rows:
    rank = row["rank"]
    if int(rank) > max_rank:
        continue
    suggestions = []
    for proof in row["evidence_ids"].split(";"):
        item = draft.get(proof, {}).get("rows", {}).get(str(int(rank)))
        if item:
            suggestions.append(f"{proof}:{item['name']}={item['balance']}")
    seed = f" [seed {row['username_raw']}={row['balance_c']} {row['capture_status']}]" if row["username_raw"] else ""
    print(f"#{rank:>2} {'; '.join(suggestions) or '?':<55}{seed}")

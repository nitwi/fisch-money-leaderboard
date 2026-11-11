"""Print screenshot extraction coverage and unreadable image regions."""
import csv
import json
from collections import Counter
from pathlib import Path

root=Path(__file__).resolve().parents[1]
with (root/'data/source/data/checkpoints.csv').open(encoding='utf-8-sig',newline='') as handle:
    checkpoints=list(csv.DictReader(handle))
with (root/'data/screenshot_extractions.csv').open(encoding='utf-8-sig',newline='') as handle:
    rows=list(csv.DictReader(handle))
diagnostics=json.loads((root/'data/extraction_diagnostics.json').read_text(encoding='utf-8'))['images']
counts=Counter(row['observation_id'].rsplit('_R',1)[0] for row in rows)
for cp in checkpoints:
    stats=' '.join(f"{e}:{diagnostics[e]['accepted_rows']}({diagnostics[e]['rank_tokens']}/{diagnostics[e]['name_tokens']}/{diagnostics[e]['money_tokens']})" for e in cp['evidence_ids'].split(';'))
    print(f"{cp['checkpoint_id']:<20} {counts[cp['checkpoint_id']]:>2}/{cp['covered_rank_count']} {stats}")

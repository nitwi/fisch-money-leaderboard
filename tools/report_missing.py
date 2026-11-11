"""Show remaining photographed rows that have no firsthand confirmation."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'site/data.json').read_text(encoding='utf-8'))
for row in data['observations']:
    if row['status'] not in ('not_captured','verified'):
        print(row['id'],row['status'],row['username'],row['balance'],row['evidence'])

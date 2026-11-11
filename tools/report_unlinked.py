"""Identify photo-confirmed names with no verified Roblox numeric profile match."""
import json
from pathlib import Path
data=json.loads((Path(__file__).resolve().parents[1]/'site/data.json').read_text(encoding='utf-8'))
print([(p['name'],p['key']) for p in data['players'] if not p['roblox_id']])

"""List OCR-only isolated extreme values for screenshot-level follow-up."""
import json
from collections import defaultdict
from pathlib import Path

data=json.loads((Path(__file__).resolve().parents[1]/'site/data.json').read_text(encoding='utf-8'))
by_player=defaultdict(list)
for row in data['observations']:
    if row['balance']:
        by_player[row['key']].append(row)
        if row['status']!='verified' and row['rank']<=20 and int(row['balance'])<48_000_000_000:
            print('RANK/AMOUNT WARNING',row['id'],row['username'],row['balance'],row['evidence'])
for name,rows in by_player.items():
    if len(rows)<3:continue
    for before,row,after in zip(rows,rows[1:],rows[2:]):
        if row['status']=='verified':continue
        value=int(row['balance']);low=min(int(before['balance']),int(after['balance']));high=max(int(before['balance']),int(after['balance']))
        if value<low//2 or value>high*2:
            print(row['id'],row['username'],row['balance'],'vs',before['balance'],after['balance'],row['evidence'])

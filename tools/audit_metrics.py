"""List large consecutive screenshot-backed changes for direct evidence review."""
import json
from datetime import datetime
from pathlib import Path

data=json.loads((Path(__file__).resolve().parents[1]/'site/data.json').read_text(encoding='utf-8'))
ordered=data['checkpoints'];index={cp['id']:i for i,cp in enumerate(ordered)}
by_user={}
for row in data['observations']:
    if row['status']=='verified':by_user.setdefault(row['key'],[]).append(row)
events=[]
for rows in by_user.values():
    rows.sort(key=lambda row:index[row['checkpoint']])
    for before,after in zip(rows,rows[1:]):
        if index[after['checkpoint']]!=index[before['checkpoint']]+1:continue
        delta=int(after['balance'])-int(before['balance'])
        if delta<8_000_000_000:continue
        a=datetime.fromisoformat(ordered[index[before['checkpoint']]]['at'].replace('Z','+00:00'))
        b=datetime.fromisoformat(ordered[index[after['checkpoint']]]['at'].replace('Z','+00:00'))
        duration=(b-a).total_seconds()/3600
        events.append((delta,after['username'],before['checkpoint'],after['checkpoint'],duration,before['evidence'],after['evidence']))
for delta,name,start,end,duration,first,last in sorted(events,reverse=True):
    print(f'{name:<22} +{delta:,} C$ in {duration:.1f}h  {start} {first} -> {end} {last}')
print(f'{len(events)} verified adjacent +8B events; all net held-balance changes not confirmed sales')

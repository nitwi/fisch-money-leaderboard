"""Inventory unphotographed days, incomplete daily boards, and unreadable originals."""
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

root=Path(__file__).resolve().parents[1]
data=json.loads((root/'site/data.json').read_text(encoding='utf-8'))
by_day=defaultdict(list)
for row in data['observations']:
    by_day[row['day_key']].append(row)


def spans(ranks):
    ranges=[]
    for rank in sorted(set(ranks)):
        if ranges and rank==ranges[-1][-1]+1:ranges[-1].append(rank)
        else:ranges.append([rank])
    return ', '.join(f'#{part[0]}' if len(part)==1 else f'#{part[0]}-#{part[-1]}' for part in ranges) or 'none'


start=date.fromisoformat(data['checkpoints'][0]['day_key'])
end=date.fromisoformat(data['checkpoints'][-1]['day_key'])
missing_days=[]
day=start
while day<=end:
    if day.isoformat() not in by_day:missing_days.append(day.isoformat())
    day+=timedelta(days=1)
print('CALENDAR_DAYS_WITHOUT_SELECTED_PHOTO:', ', '.join(missing_days) or 'none')
print('INCOMPLETE_SELECTED_DAILY_BOARDS:')
for cp in data['checkpoints']:
    rows=by_day[cp['day_key']]
    if len(rows)!=50:raise ValueError(f'Missing rank slots in generated daily data: {cp["day_key"]}')
    unpictured=spans(row['rank'] for row in rows if row['status']=='not_captured')
    unreadable=spans(row['rank'] for row in rows if row['status']=='captured_pending_transcription')
    if unpictured!='none' or unreadable!='none':
        print(f'  {cp["day_key"]}: {cp["verified"]}/50 verified; not pictured {unpictured}; photographed but unreadable {unreadable}; chosen photo {cp["id"]}')
print('ORIGINAL_PHOTOGRAPHED_RANKS_STILL_UNREADABLE:')
proofs={item['id']:item for item in data['evidence']}
unreadable=[row for row in data['capture_observations'] if row['status']=='captured_pending_transcription']
for row in unreadable:
    images=', '.join(f'{proof}: {proofs[proof]["url"]}' for proof in row['evidence'])
    print(f'  {row["checkpoint"]} rank #{row["rank"]}: {images}')
print(f'RAW_UNPICTURED_RANK_SLOTS: {sum(row["status"]=="not_captured" for row in data["capture_observations"])} (cannot be read from existing originals)')

#!/usr/bin/env python3
"""Preview/apply an untouched player-profile PNG as one unranked balance reading.

The referenced full-board photo supplies rank context and the earlier balance;
the profile screenshot never asserts a new Top-50 position for other players.
"""
import argparse
import csv
import hashlib
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from import_capture import png_metadata

ROOT=Path(__file__).resolve().parents[1]
UPDATES=ROOT/'data/profile_updates.csv'
MANIFEST=ROOT/'data/source/data/evidence_manifest.csv'
PROFILES=ROOT/'site/evidence/profiles'
CHICAGO=ZoneInfo('America/Chicago')


def read_csv(path):
    with path.open(encoding='utf-8-sig',newline='') as stream:
        return list(csv.DictReader(stream))


def photo_time(name):
    match=re.fullmatch(r'Screenshot (\d{4}-\d{2}-\d{2}) (\d{6})\.png',name)
    if not match:raise ValueError(f'Exact screenshot filename timestamp required: {name}')
    local=datetime.strptime(' '.join(match.groups()),'%Y-%m-%d %H%M%S').replace(tzinfo=CHICAGO)
    return local.isoformat(timespec='seconds')


def preview(args):
    source=Path(args.image).resolve()
    if not source.is_file():raise ValueError(f'Missing original: {source}')
    width,height=png_metadata(source)
    if width<200 or height<90:raise ValueError('Original profile image is too small to review')
    source_manifest=next((row for row in read_csv(MANIFEST) if row['evidence_id']==args.source_evidence),None)
    if not source_manifest or source_manifest['checkpoint_id']!=args.source_checkpoint or not int(source_manifest['min_visible_rank'])<=args.source_rank<=int(source_manifest['max_visible_rank']):
        raise ValueError('Source leaderboard proof does not show the specified rank/checkpoint')
    old=json.loads((ROOT/'site/data.json').read_text(encoding='utf-8'))
    board=next((row for row in old['capture_observations'] if row['checkpoint']==args.source_checkpoint and row['rank']==args.source_rank),None)
    identity=json.loads((ROOT/'data/roblox.json').read_text(encoding='utf-8')).get(args.username.casefold(),{})
    if not board or board['status']!='verified' or board['key']!=f'id:{args.roblox_id}' or identity.get('id')!=args.roblox_id:
        raise ValueError('Profile account must match a verified photographed leaderboard player')
    source_day=next((session['day_key'] for session in old['sessions'] if args.source_checkpoint in session['source_checkpoints']),None)
    if source_day!=args.day:
        raise ValueError('Source board photo belongs to a different daily cycle')
    if args.source_evidence not in board['evidence']:
        raise ValueError('Source proof is not attached to this player and rank')
    date=photo_time(source.name)
    original_at=photo_time(source_manifest['original_filename'])
    if datetime.fromisoformat(date)<=datetime.fromisoformat(original_at):
        raise ValueError('New balance must be photographed after the source board amount')
    if not re.fullmatch(r'[0-9]+',args.balance):raise ValueError('Exact whole C$ balance required')
    updates=read_csv(UPDATES)
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    if any(row['sha256']==digest for row in updates):raise ValueError('Original profile screenshot already imported')
    number=max((int(row['id'][2:]) for row in updates),default=0)+1
    evidence_id=f'PU{number:04d}'
    destination=PROFILES/f'{evidence_id}_{source.name.replace(" ","_")}'
    return {'id':evidence_id,'day_key':args.day,'username':args.username,'roblox_id':str(args.roblox_id),
            'balance_c':args.balance,'captured_at_local':date,'source_checkpoint':args.source_checkpoint,
            'source_rank':str(args.source_rank),'source_evidence':args.source_evidence,'source_at_local':original_at,
            'image_path':f'profiles/{destination.name}','sha256':digest,
            'note':args.note,
            'source':source,'destination':destination,'board_balance':board['balance']}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image',required=True)
    parser.add_argument('--day',required=True,help='Existing leaderboard cycle YYYY-MM-DD')
    parser.add_argument('--username',required=True)
    parser.add_argument('--roblox-id',required=True,type=int)
    parser.add_argument('--balance',required=True)
    parser.add_argument('--source-checkpoint',required=True)
    parser.add_argument('--source-rank',required=True,type=int)
    parser.add_argument('--source-evidence',required=True)
    parser.add_argument('--note',default='Profile username and exact held balance read from original PNG')
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    update=preview(args)
    print(json.dumps({key:str(value) if isinstance(value,Path) else value for key,value in update.items()},indent=2))
    if not args.apply:return
    if not PROFILES.parent.is_dir():raise ValueError(f'Unexpected proof parent: {PROFILES.parent}')
    PROFILES.mkdir(exist_ok=True)
    if update['destination'].exists():raise ValueError('Destination already exists')
    shutil.copyfile(update['source'],update['destination'])
    if hashlib.sha256(update['destination'].read_bytes()).hexdigest()!=update['sha256']:
        raise ValueError('Original copy failed SHA-256 check')
    with UPDATES.open(encoding='utf-8-sig',newline='') as stream:
        fields=next(csv.reader(stream))
    with UPDATES.open('a',encoding='utf-8',newline='') as stream:
        csv.writer(stream,lineterminator='\n').writerow([update[key] for key in fields])
    print(f'IMPORTED {update["id"]} without claiming a new board rank')


if __name__=='__main__':main()

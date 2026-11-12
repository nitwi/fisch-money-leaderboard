#!/usr/bin/env python3
"""Import untouched leaderboard PNGs and their source indexes, preview first.

Example: python tools/import_capture.py --date 2026-11-11 --time 22:33
  --image '1-16=C:/Pictures/top.png' --image '17-32=C:/Pictures/mid.png'
  --image '33-48=C:/Pictures/low.png' --image '46-50=C:/Pictures/bottom.png'
Then repeat with --apply. Actual readings go only in photo corrections/audits.
"""
import argparse
import csv
import hashlib
import json
import re
import shutil
import struct
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
CHECKPOINTS=ROOT/'data/source/data/checkpoints.csv'
MANIFEST=ROOT/'data/source/data/evidence_manifest.csv'
SCREENSHOTS=ROOT/'site/evidence/screenshots'

def read_csv(path):
    with path.open(encoding='utf-8-sig',newline='') as stream:
        return list(csv.DictReader(stream))

def png_metadata(path):
    with path.open('rb') as stream:
        header=stream.read(24)
    if len(header)!=24 or header[:8]!=b'\x89PNG\r\n\x1a\n' or header[12:16]!=b'IHDR':
        raise ValueError(f'Original must be a PNG file: {path}')
    return struct.unpack('>II',header[16:24])

def prepare(args):
    if not SCREENSHOTS.is_dir():
        raise ValueError(f'Wrong screenshot parent directory: {SCREENSHOTS}')
    local=datetime.fromisoformat(f'{args.date}T{args.time}').replace(tzinfo=ZoneInfo('America/Chicago'))
    if local.strftime('%Y-%m-%d %H:%M')!=f'{args.date} {args.time}':
        raise ValueError('Invalid local capture date/time')
    checkpoint=f'{args.date}_{args.time.replace(":", "")}'
    if any(row['checkpoint_id']==checkpoint for row in read_csv(CHECKPOINTS)):
        raise ValueError(f'Checkpoint already exists: {checkpoint}')
    existing=read_csv(MANIFEST)
    known_ids={row['evidence_id'] for row in existing}
    max_id=max((int(match[1]) for row in existing if (match:=re.fullmatch(r'EV(\d+)',row['evidence_id']))),default=0)
    target=SCREENSHOTS/checkpoint
    images=[];covered=set()
    for offset,entry in enumerate(args.image,1):
        if '=' not in entry:raise ValueError(f'Use min-max=file for --image: {entry}')
        span,path_text=entry.split('=',1)
        match=re.fullmatch(r'(\d+)-(\d+)',span)
        if not match:raise ValueError(f'Invalid rank span: {span}')
        lo,hi=map(int,match.groups())
        if not 1<=lo<=hi<=50:raise ValueError(f'Invalid rank span: {span}')
        source=Path(path_text).resolve()
        if not source.is_file():raise ValueError(f'Original screenshot is missing: {source}')
        width,height=png_metadata(source)
        digest=hashlib.sha256(source.read_bytes()).hexdigest()
        image_id=f'EV{max_id+offset:04d}'
        if image_id in known_ids:raise ValueError(f'Duplicate evidence ID: {image_id}')
        filename=f'{image_id}_{source.name.replace(" ", "_")}'
        dest=target/filename
        if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest()!=digest:
            raise ValueError(f'Existing image would be overwritten: {dest}')
        images.append({'id':image_id,'source':source,'dest':dest,'sha256':digest,'width':width,'height':height,'min':lo,'max':hi})
        covered.update(range(lo,hi+1))
    if not images or not covered:
        raise ValueError('At least one original rank screenshot is required')
    utc=local.astimezone(timezone.utc)
    return checkpoint,target,local,utc,images,covered

def append_csv(path,fields):
    with path.open('a',encoding='utf-8',newline='') as stream:
        csv.writer(stream,lineterminator='\n').writerow(fields)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date',required=True,help='Chicago capture date YYYY-MM-DD')
    parser.add_argument('--time',required=True,help='Chicago session time HH:MM')
    parser.add_argument('--precision',default='user-supplied',help='Source of minute-precision session time')
    parser.add_argument('--image',action='append',required=True,help='visible-rank-range=original-PNG-path')
    parser.add_argument('--apply',action='store_true',help='Copy originals and append two source-index CSVs')
    args=parser.parse_args()
    checkpoint,target,local,utc,images,covered=prepare(args)
    print(json.dumps({'mode':'apply' if args.apply else 'preview','checkpoint':checkpoint,
        'local':local.isoformat(timespec='seconds'),'utc':utc.isoformat(timespec='seconds'),
        'covered_ranks':len(covered),'evidence':[{'id':item['id'],'rank_span':f"{item['min']}-{item['max']}",
          'source':str(item['source']),'destination':str(item['dest']),'sha256':item['sha256']}
          for item in images]},indent=2))
    if not args.apply:return
    target.mkdir(parents=False,exist_ok=True)
    for item in images:
        if not item['dest'].exists():shutil.copyfile(item['source'],item['dest'])
        if hashlib.sha256(item['dest'].read_bytes()).hexdigest()!=item['sha256']:
            raise ValueError(f'Original copy failed hash verification: {item["dest"]}')
    already_covered=set()
    for item in images:
        rank_span=set(range(item['min'],item['max']+1))
        role='overlap' if already_covered.intersection(rank_span) else 'primary'
        already_covered.update(rank_span)
        append_csv(MANIFEST,[item['id'],checkpoint,f'screenshots/{checkpoint}/{item["dest"].name}',item['source'].name,
             item['sha256'],item['width'],item['height'],item['min'],item['max'],
             role,f'Original user screenshot; {args.precision} session {local.isoformat(timespec="minutes")}'])
    append_csv(CHECKPOINTS,[checkpoint,args.date,args.time,local.isoformat(timespec='seconds'),utc.isoformat(timespec='seconds'),
         args.precision,50,len(covered),50-len(covered),len(images),';'.join(item['id'] for item in images),
         f'User screenshot set retained unmodified; capture time {args.time} Chicago' if args.precision=='user-supplied' else 'Original screenshot filenames establish the minute-precision capture window',''])
    print(f'IMPORTED {checkpoint} with {len(images)} hash-checked original images')

if __name__=='__main__':main()

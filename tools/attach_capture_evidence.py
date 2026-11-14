#!/usr/bin/env python3
"""Preview/apply an unchanged PNG to an existing, owner-timed capture.

Overlapping values must be reviewed against existing images before applying;
photo_corrections.csv separately identifies which proof supports each balance.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import shutil
from pathlib import Path

from import_capture import CHECKPOINTS, MANIFEST, SCREENSHOTS, png_metadata, read_csv


def prepare(args):
    checkpoints=read_csv(CHECKPOINTS)
    cp=next((row for row in checkpoints if row['checkpoint_id']==args.checkpoint),None)
    if not cp:raise ValueError(f'Unknown capture checkpoint: {args.checkpoint}')
    prior=read_csv(MANIFEST)
    if not 1<=args.min_rank<=args.max_rank<=50:raise ValueError('Invalid visible rank span')
    source=Path(args.image).resolve()
    if not source.is_file():raise ValueError(f'Missing original PNG: {source}')
    width,height=png_metadata(source)
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    if any(row['sha256']==digest for row in prior):raise ValueError('Original image is already indexed')
    max_id=max((int(match.group(1)) for row in prior if (match:=re.fullmatch(r'EV(\d+)',row['evidence_id']))),default=0)
    evidence_id=f'EV{max_id+1:04d}'
    target=SCREENSHOTS/args.checkpoint/f'{evidence_id}_{source.name.replace(" ","_")}'
    if not target.parent.is_dir() or target.exists():raise ValueError(f'Unexpected or occupied proof destination: {target}')
    associated=[row for row in prior if row['checkpoint_id']==args.checkpoint]
    if len(associated)!=int(cp['evidence_count']):raise ValueError('Checkpoint evidence count is inconsistent')
    covered={rank for row in associated for rank in range(int(row['min_visible_rank']),int(row['max_visible_rank'])+1)}
    overlap=sorted(covered.intersection(range(args.min_rank,args.max_rank+1)))
    covered.update(range(args.min_rank,args.max_rank+1))
    if len(covered)<=int(cp['covered_rank_count']):raise ValueError('New image would not fill any missing rank')
    return {'checkpoint':cp,'source':source,'target':target,'id':evidence_id,'sha256':digest,
            'width':width,'height':height,'covered':len(covered),'overlap':overlap,'notes':args.notes,
            'min_rank':args.min_rank,'max_rank':args.max_rank}


def apply(item):
    checkpoint_lines=CHECKPOINTS.read_text(encoding='utf-8').splitlines(keepends=True)
    lines=[];matches=0
    for line in checkpoint_lines:
        if line.startswith(item['checkpoint']['checkpoint_id']+','):
            entry=dict(item['checkpoint'])
            entry['covered_rank_count']=str(item['covered'])
            entry['not_captured_rank_count']=str(50-item['covered'])
            entry['evidence_count']=str(int(entry['evidence_count'])+1)
            entry['evidence_ids']+=';'+item['id']
            entry['notes']+='; '+item['notes']
            fields=list(item['checkpoint'])  # read_csv strips any UTF-8 BOM from the header.
            buffer=io.StringIO(newline='')
            csv.DictWriter(buffer,fieldnames=fields,lineterminator='\n').writerow(entry)
            line=buffer.getvalue()
            matches+=1
        lines.append(line)
    if matches!=1:raise ValueError('Cannot identify a unique checkpoint row')
    shutil.copyfile(item['source'],item['target'])
    if hashlib.sha256(item['target'].read_bytes()).hexdigest()!=item['sha256']:
        raise ValueError('Copied proof did not preserve original SHA-256')
    with MANIFEST.open('a',encoding='utf-8',newline='') as stream:
        csv.writer(stream,lineterminator='\n').writerow([
            item['id'],item['checkpoint']['checkpoint_id'],
            f'screenshots/{item["checkpoint"]["checkpoint_id"]}/{item["target"].name}',
            item['source'].name,item['sha256'],item['width'],item['height'],
            item['min_rank'],item['max_rank'],'overlap' if item['overlap'] else 'primary',item['notes']])
    CHECKPOINTS.write_text(''.join(lines),encoding='utf-8',newline='')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint',required=True)
    parser.add_argument('--image',required=True)
    parser.add_argument('--min-rank',required=True,type=int)
    parser.add_argument('--max-rank',required=True,type=int)
    parser.add_argument('--notes',required=True)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    item=prepare(args)
    print(json.dumps({'mode':'apply' if args.apply else 'preview','checkpoint':args.checkpoint,
        'evidence_id':item['id'],'original':str(item['source']),'destination':str(item['target']),
        'sha256':item['sha256'],'new_coverage':item['covered'],'overlapping_ranks':item['overlap'],
        'notes':item['notes']},indent=2))
    if args.apply:
        apply(item)
        print(f'ATTACHED {item["id"]} unchanged to {args.checkpoint}')


if __name__=='__main__':main()

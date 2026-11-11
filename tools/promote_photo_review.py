#!/usr/bin/env python3
"""Promote individually image-checked OCR readings with explicit corrections.

An approved range means its rows were compared directly to the original PNG by
the agent. The script never treats OCR confidence as visual verification.
"""
import csv
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
AUDITS=ROOT/'data/photo_audits.csv'
CORRECTIONS=ROOT/'data/photo_corrections.csv'
OUTPUT=ROOT/'data/photo_verified.csv'

def read(path):
    if not path.exists():return []
    with path.open(encoding='utf-8-sig',newline='') as handle:
        return list(csv.DictReader(handle))

def ranges(expression):
    found=set()
    for part in expression.split(';'):
        part=part.strip()
        if not part:continue
        if '-' in part:
            start,end=map(int,part.split('-',1))
        else:start=end=int(part)
        if not 1<=start<=end<=50:raise ValueError(f'Invalid rank span {part}')
        found.update(range(start,end+1))
    return found

def main():
    proofs={row['evidence_id']:row for row in read(ROOT/'data/source/data/evidence_manifest.csv')}
    candidate={row['observation_id']:row for row in read(ROOT/'data/screenshot_extractions.csv')}
    manual={row['observation_id']:row for row in read(ROOT/'data/reviewed.csv')}
    corrections={}
    for row in read(CORRECTIONS):
        key=(row['observation_id'],row['evidence_id'])
        if key in corrections:raise ValueError(f'Duplicate photo correction {key}')
        corrections[key]=row
    result={}
    seen=set()
    for audit in read(AUDITS):
        evidence_id=audit['evidence_id']
        if not audit['reviewer_note'].strip():raise ValueError(f'Missing visual review note for {evidence_id}')
        if evidence_id not in proofs:raise ValueError(f'Unknown original image {evidence_id}')
        proof=proofs[evidence_id]
        sha=proof['sha256']
        original=ROOT/'site/evidence'/proof['relative_path']
        import hashlib
        if hashlib.sha256(original.read_bytes()).hexdigest()!=sha:raise ValueError(f'Original image changed: {evidence_id}')
        for rank in sorted(ranges(audit['ranks'])):
            if not int(proof['min_visible_rank'])<=rank<=int(proof['max_visible_rank']):
                raise ValueError(f'{evidence_id} does not cover #{rank}')
            observation_id=f"{proof['checkpoint_id']}_R{rank:02d}"
            key=(observation_id,evidence_id)
            if key in seen:raise ValueError(f'Duplicate image/rank visual audit: {key}')
            seen.add(key)
            if observation_id in manual:continue
            correction=corrections.get(key)
            source=candidate.get(observation_id)
            if correction:
                name=correction['username_raw'].strip().lstrip('@')
                amount=correction['balance_c'].strip()
                note=correction['note'].strip()
            elif source and evidence_id in source['evidence_ids'].split(';') and source['conflict']!='yes':
                name=source['username_raw'].strip()
                amount=source['balance_c'].strip()
                note='Photo checked against original; OCR reading matches'
            else:
                # Conflict or OCR missing: only explicit direct transcription is allowed.
                continue
            if not name or not amount.isascii() or not amount.isdecimal() or not note:
                raise ValueError(f'Incomplete photo-confirmed row: {key}')
            row={'observation_id':observation_id,'username_raw':name,'balance_c':amount,
                 'evidence_ids':evidence_id,'review_note':note}
            previous=result.get(observation_id)
            if previous and (previous['username_raw'].casefold(),previous['balance_c'])!=(name.casefold(),amount):
                raise ValueError(f'Photographs disagree on {observation_id}: {previous} / {row}')
            result.setdefault(observation_id,row)
    unused=set(corrections)-seen
    if unused:raise ValueError(f'Corrections without a photo-audited rank: {sorted(unused)}')
    with OUTPUT.open('w',encoding='utf-8',newline='') as handle:
        writer=csv.DictWriter(handle,fieldnames=['observation_id','username_raw','balance_c','evidence_ids','review_note'],lineterminator='\n')
        writer.writeheader();writer.writerows(sorted(result.values(),key=lambda row:row['observation_id']))
    print(json.dumps({'photo_audits':len(read(AUDITS)),'photo_confirmed_new_rows':len(result),'existing_manual_rows':len(manual)}))

if __name__=='__main__':main()

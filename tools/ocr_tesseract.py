#!/usr/bin/env python3
"""Independently OCR the original PNGs by leaderboard row; no workbook values."""
import argparse
import csv
import json
import re
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DEFAULT_EXE=Path('C:/Program Files/Tesseract-OCR/tesseract.exe')
ROW=re.compile(r'#\s*([1-9]|[1-4][0-9]|50)\s+@([A-Za-z0-9_]{3,23})\s+(.+)$',re.I)

def amount(text):
    text=text.replace(';',',').replace(' ', '').replace('.', ',')
    # Tesseract often renders the currency suffix as C5, ¢5, or CS.
    match=re.search(r'([0-9][0-9,]+[0-9])(?:C[$Ss5]|¢[$Ss5]|CS|C)?$',text,re.I)
    if not match:
        return ''
    number=re.sub(r'\D','',match[1])
    return number if 10<=len(number)<=14 else ''

def main(executable):
    with (ROOT/'data/source/data/evidence_manifest.csv').open(encoding='utf-8-sig',newline='') as handle:
        evidence=list(csv.DictReader(handle))
    out=ROOT/'data/tesseract_draft.json'
    results=json.loads(out.read_text(encoding='utf-8')) if out.exists() else {}
    for index,image in enumerate(evidence):
        key=image['evidence_id']
        if key in results:continue
        path=ROOT/'site/evidence'/image['relative_path']
        process=subprocess.run([str(executable),str(path),'stdout','--psm','6'],capture_output=True,text=True,errors='replace',timeout=60)
        if process.returncode:
            raise RuntimeError(f'Tesseract failed on {key}: {process.stderr[:300]}')
        rows={}
        for line in process.stdout.splitlines():
            found=ROW.search(line.strip())
            if not found:continue
            rank=int(found[1])
            if not int(image['min_visible_rank'])<=rank<=int(image['max_visible_rank']):continue
            value=amount(found[3])
            if value:rows[str(rank)]={'name':found[2], 'balance':value, 'raw':line.strip()}
        results[key]={'checkpoint':image['checkpoint_id'],'rows':rows}
        if index%20==0:
            out.write_text(json.dumps(results,indent=1),encoding='utf-8')
            print(f'Tesseract {index+1}/{len(evidence)} images',flush=True)
    out.write_text(json.dumps(results,indent=1),encoding='utf-8')
    print(f'Tesseract candidates from {len(results)} source PNGs; {sum(len(entry["rows"]) for entry in results.values())} row readings')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe',type=Path,default=DEFAULT_EXE)
    main(parser.parse_args().exe)

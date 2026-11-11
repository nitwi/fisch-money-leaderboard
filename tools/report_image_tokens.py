"""Print sorted OCR column tokens from an original image for manual audit."""
import json
import sys
from pathlib import Path
from extract_screenshots import tokens_for

root=Path(__file__).resolve().parents[1]
image=json.loads((root/'data/ocr_draft.json').read_text(encoding='utf-8'))[sys.argv[1]]
rank,names,money=tokens_for(image)
rank=sorted(rank,key=lambda p:p[1]); names.sort(); money.sort()
print(f"{sys.argv[1]} span {image['min']}-{image['max']}")
for ix in range(max(len(rank),len(names),len(money))):
    a=f'{rank[ix][0]:>2} @{rank[ix][1]:>5.1f}' if ix<len(rank) else ''
    b=f'{names[ix][1]:<23} @{names[ix][0]:>5.1f}' if ix<len(names) else ''
    c=f'{money[ix][1]:>14} @{money[ix][0]:>5.1f}' if ix<len(money) else ''
    print(f'{ix:>2} {a:<14} {b:<32} {c}')

#!/usr/bin/env python3
"""Produce UNVERIFIED OCR suggestions for manual comparison with original PNGs.

Optional dependency: pip install rapidocr-onnxruntime. Output is NOT imported by
the public site's builder. A human must check name, amount and rank in the PNG.
"""

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

from rapidocr_onnxruntime import RapidOCR

ROOT = Path(__file__).resolve().parents[1]
AMOUNT = re.compile(r"(?<!\d)(\d[\d, .]{7,}\d)\s*(?:c[$sS8]|$)", re.I)
RANK = re.compile(r"^#?([1-9]|[1-4]\d|50)$")
NAME = re.compile(r"@([A-Za-z0-9_]{3,22})")


def classify(tokens, lo, hi):
    """Associate nearest OCR username and amount with a visible rank row."""
    candidates = defaultdict(list)
    for box, text, confidence in tokens or []:
        y = sum(pt[1] for pt in box) / 4
        x = sum(pt[0] for pt in box) / 4
        candidates["items"].append({"x": x, "y": y, "text": text, "confidence": float(confidence)})
    items = candidates["items"]
    rank_items = []
    for item in items:
        rank = RANK.fullmatch(item["text"].strip())
        if rank and lo <= int(rank[1]) <= hi:
            rank_items.append((int(rank[1]), item))
    # If a duplicated rank is captured from an overlap, keep the first row.
    ranks = {rank: item for rank,item in rank_items}
    output = {}
    for rank, anchor in ranks.items():
        nearby = [part for part in items if abs(part["y"]-anchor["y"]) <= max(14, min(34, (hi-lo+1)*1.1)) and part is not anchor]
        names = [(NAME.search(part["text"]), part) for part in nearby]
        names = [(m, part) for m, part in names if m]
        amounts = [(AMOUNT.search(part["text"].replace(" ", "")), part) for part in nearby]
        amounts = [(m, part) for m, part in amounts if m]
        names.sort(key=lambda pair: (abs(pair[1]["y"]-anchor["y"]), pair[1]["x"]))
        amounts.sort(key=lambda pair: (abs(pair[1]["y"]-anchor["y"]), -pair[1]["x"]))
        name = names[0] if names else None
        amount = amounts[0] if amounts else None
        output[str(rank)] = {
            "name": name[0][1] if name else "",
            "balance": re.sub(r"\D", "", amount[0][1]) if amount else "",
            "name_confidence": round(name[1]["confidence"], 3) if name else None,
            "balance_confidence": round(amount[1]["confidence"], 3) if amount else None,
            "name_text": name[1]["text"] if name else "",
            "balance_text": amount[1]["text"] if amount else "",
        }
    return output


def main(source, limit=None, force=False):
    with (source / "data/evidence_manifest.csv").open(encoding="utf-8-sig", newline="") as file:
        evidence = list(csv.DictReader(file))
    engine = RapidOCR()
    outpath = ROOT / "data/ocr_draft.json"
    drafts = json.loads(outpath.read_text(encoding="utf-8")) if outpath.exists() else {}
    for ix, item in enumerate(evidence):
        if limit is not None and ix >= limit:
            break
        key = item["evidence_id"]
        if key in drafts and (not force or drafts[key].get("tokens")):
            continue
        path = (source / item["relative_path"]).resolve()
        if not path.exists() and source == (ROOT/"data/source").resolve():
            path=(ROOT/"site/evidence"/item["relative_path"]).resolve()
        output, _ = engine(str(path))
        drafts[key] = {"checkpoint": item["checkpoint_id"], "path": item["relative_path"],
                       "min": int(item["min_visible_rank"]), "max": int(item["max_visible_rank"]),
                       "rows": classify(output, int(item["min_visible_rank"]), int(item["max_visible_rank"])),
                       "tokens": [[round(sum(point[0] for point in box)/4,1),round(sum(point[1] for point in box)/4,1),text,round(float(confidence),3)] for box,text,confidence in output or []]}
        if ix % 8 == 0:
            outpath.write_text(json.dumps(drafts, indent=1), encoding="utf-8")
            print(f"OCR {ix+1}/{len(evidence)} images ({len(drafts)} cached)", flush=True)
    outpath.write_text(json.dumps(drafts, indent=1), encoding="utf-8")
    print(f"OCR candidates from {len(drafts)} original PNGs -> {outpath}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT/"data/source")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--force", action="store_true", help="Refresh old caches without token geometry")
    args = parser.parse_args()
    main(args.source.resolve(), args.limit, args.force)

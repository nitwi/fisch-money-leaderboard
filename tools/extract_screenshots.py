#!/usr/bin/env python3
"""Derive rank/name/balance candidates strictly from original-image OCR tokens.

This deliberately reads *no* amounts or usernames from observations.csv, the
spreadsheet, or earlier gain reports. Image rank spans are navigation hints only.
Candidates are provisional until the original PNG is checked by a reviewer.
"""
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGE_DRAFT = ROOT / "data/ocr_draft.json"
PROOFS = ROOT / "data/source/data/evidence_manifest.csv"
OUTPUT = ROOT / "data/screenshot_extractions.csv"
REPORT = ROOT / "data/extraction_diagnostics.json"
RANK = re.compile(r"^#\s*([1-9]|[1-4][0-9]|50)$")
NAME = re.compile(r"^@([a-zA-Z0-9_]{3,22})$")
MONEY = re.compile(r"^([0-9][0-9,\.\s]{8,}[0-9])\s*(?:C\$|CS|C5|C8|C)$", re.I)


def tokens_for(image):
    tokens = image.get("tokens") or []
    ranks, names, balances = [], [], []
    for x, y, raw, score in tokens:
        text = str(raw).strip()
        match = RANK.fullmatch(text)
        if match and image["min"] <= int(match[1]) <= image["max"]:
            ranks.append((int(match[1]), float(y), float(x)))
        match = NAME.fullmatch(text)
        if match:
            names.append((float(y), match[1], float(score)))
        match = MONEY.fullmatch(text.replace(" ", ""))
        if match:
            number = re.sub(r"\D", "", match[1])
            if 10 <= len(number) <= 14:
                balances.append((float(y), number, float(score), float(x)))
    return sorted(ranks), sorted(names), sorted(balances)


def parse_image(image):
    lo, hi = image["min"], image["max"]
    span = hi - lo + 1
    ranks, names, money = tokens_for(image)
    ranks = sorted(set((rank, y) for rank, y, _ in ranks), key=lambda item: item[1])
    names.sort(key=lambda item: item[0])
    money.sort(key=lambda item: item[0])
    original_counts = (len(ranks), len(names), len(money))
    if not ranks or not money or not names:
        return {}, {"rank_tokens": len(ranks), "name_tokens": len(names), "money_tokens": len(money)}
    rank_step = sorted((y2-y1)/(r2-r1) for (r1,y1),(r2,y2) in zip(ranks,ranks[1:]) if r2>r1 and y2>y1)
    rank_step = rank_step[len(rank_step)//2] if rank_step else 18
    first_y = ranks[0][1]-(ranks[0][0]-lo)*rank_step
    last_y = ranks[-1][1]+(hi-ranks[-1][0])*rank_step
    # Full-screen captures sometimes show an unrelated HUD balance hundreds of
    # pixels below the leaderboard. Keep only the photographed rank band.
    money = [m for m in money if first_y-rank_step*1.5 <= m[0] <= last_y+rank_step*1.25]
    names = [n for n in names if first_y-rank_step*1.5 <= n[0] <= last_y+rank_step*1.25]
    if len(money)>span:
        money=money[-span:]  # an overlap above this board section
    if len(names)>span:
        names=names[-span:]

    def assign(items, kind):
        """Align a monotonic text column with a pictured rank span."""
        if len(items)==span:
            return {lo+index:item for index,item in enumerate(items)}
        if not items:
            return {}
        if kind=="names" and rank_step<30 and len(ranks)>=span//2:
            anchors=dict(ranks)
            # Username and rank share nearly the same x-position, unlike the
            # right-hand balances. A nearby photographed rank is more reliable
            # than cumulative spacing after a missing username OCR token.
            for rank in range(lo,hi+1):
                if rank not in anchors:
                    lower=[r for r in anchors if r<rank]
                    upper=[r for r in anchors if r>rank]
                    if lower and upper:
                        a=max(lower);b=min(upper)
                        anchors[rank]=anchors[a]+(anchors[b]-anchors[a])*(rank-a)/(b-a)
            assigned={}
            for item in items:
                possible=sorted((abs(item[0]-y),rank) for rank,y in anchors.items() if rank not in assigned)
                if possible and possible[0][0] <= rank_step*.82:
                    assigned[possible[0][1]]=item
            if len(assigned)>=len(items)-2:
                return assigned
        adjacent = sorted((b[0]-a[0]) for a,b in zip(items,items[1:]) if b[0]>a[0] and b[0]-a[0]<rank_step*1.7)
        spacing = adjacent[len(adjacent)//2] if adjacent else rank_step
        # Perspective means the right-hand money column can begin more than one
        # row-height below the left-hand rank label. Never shift it just because
        # its first token has a different y-coordinate.
        start=0
        if (kind=="money" and rank_step<30 and len(items)<span and names
                and items[0][0]-names[0][0]>rank_step*1.1
                and items[0][0]-names[0][0]<rank_step*2.4):
            start=1
        aligned={}
        for item in items:
            index=start+round((item[0]-items[0][0])/spacing)
            rank=lo+index
            if lo<=rank<=hi and rank not in aligned:
                aligned[rank]=item
        return aligned

    named=assign(names,"names")
    valued=assign(money,"money")
    output={}
    for rank in range(lo,hi+1):
        name, amount = named.get(rank), valued.get(rank)
        if name is None or amount is None:
            continue
        output[rank]={"name":name[1],"balance":amount[1],"name_confidence":name[2],
                      "balance_confidence":amount[2],"mode":"aligned_columns"}
    # An OCR digit can drop, e.g. 101B -> 10B. Reject that reading alone,
    # not every other correctly aligned line on the original image.
    for rank, item in list(output.items()):
        prev=output.get(rank-1)
        nxt=output.get(rank+1)
        value=int(item["balance"])
        if prev and nxt and value>int(prev["balance"]) and value>int(nxt["balance"]):
            del output[rank]
        elif prev and nxt and value<int(nxt["balance"]) and int(prev["balance"])>=int(nxt["balance"]):
            del output[rank]
        elif not prev and nxt and value<int(nxt["balance"]):
            del output[rank]
    # A bad alignment should be diagnosed, never silently promoted as a rank.
    ordered=sorted(output.items())
    for (rank,a),(next_rank,b) in zip(ordered,ordered[1:]):
        if rank+1==next_rank and int(a["balance"])<int(b["balance"]):
            del output[next_rank]
    return output, {"rank_tokens":original_counts[0],"name_tokens":original_counts[1],
                    "money_tokens":original_counts[2],"mode":"aligned_columns"}


def main():
    with PROOFS.open(encoding="utf-8-sig", newline="") as handle:
        proofs = list(csv.DictReader(handle))
    drafts = json.loads(IMAGE_DRAFT.read_text(encoding="utf-8"))
    tesseract_path=ROOT/"data/tesseract_draft.json"
    tesseract=json.loads(tesseract_path.read_text(encoding="utf-8")) if tesseract_path.exists() else {}
    by_capture = defaultdict(lambda: defaultdict(list))
    diagnostics = {}
    for image in proofs:
        id = image["evidence_id"]
        if id not in drafts:
            raise ValueError(f"No original-image OCR for {id}")
        indexed_image={**drafts[id], 'min':int(image['min_visible_rank']), 'max':int(image['max_visible_rank'])}
        candidate, details = parse_image(indexed_image)
        details["accepted_rows"] = sum(bool(value["balance"]) for value in candidate.values())
        diagnostics[id] = details
        for rank, value in candidate.items():
            if not value["balance"]:
                continue
            second=tesseract.get(id,{}).get('rows',{}).get(str(rank),{})
            value['engine_money_agreement']=second.get('balance')==value['balance']
            value['engine_agreement']=value['engine_money_agreement'] and second.get('name','').casefold()==value['name'].casefold()
            by_capture[image["checkpoint_id"]][rank].append((value, id, image["sha256"]))
    rows = []
    for cp, rank_map in sorted(by_capture.items()):
        for rank, readings in sorted(rank_map.items()):
            # Duplicate copies of one PNG are one vote. Different source images
            # with mismatched text must go to visual conflict review.
            distinct = {}
            for value, id, sha in readings:
                distinct.setdefault(sha, (value,id))
            votes = Counter((value["name"].casefold(),value["balance"]) for value,id in distinct.values())
            # Matching independent OCR on an original contributes evidence to
            # resolve ties across two differently captured screenshots.
            weighted=Counter()
            for value,id in distinct.values():
                weighted[(value['name'].casefold(),value['balance'])]+=1+int(value['engine_agreement'])
            best,_=weighted.most_common(1)[0]
            supporters=votes[best]
            matching = [(value,id) for value,id in distinct.values() if (value["name"].casefold(),value["balance"]) == best]
            disagree = len(votes) > 1
            confidence = min(min(value["name_confidence"],value["balance_confidence"]) for value,id in matching)
            rows.append({"observation_id":f"{cp}_R{rank:02d}","username_raw":matching[0][0]["name"],
                         "balance_c":best[1],"evidence_ids":";".join(id for _,id in matching),
                         "source":"screenshot_ocr", "independent_images":str(supporters),
                         "confidence":str(round(confidence,3)), "conflict": "yes" if disagree else "no",
                         "two_engine_agreement":"yes" if any(value['engine_agreement'] for value,id in matching) else 'no',
                         "money_engine_agreement":"yes" if any(value['engine_money_agreement'] for value,id in matching) else 'no'})
    with OUTPUT.open("w",encoding="utf-8",newline="") as handle:
        writer=csv.DictWriter(handle,fieldnames=["observation_id","username_raw","balance_c","evidence_ids","source","independent_images","confidence","conflict","two_engine_agreement","money_engine_agreement"],lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    REPORT.write_text(json.dumps({"images":diagnostics,"totals":{"images":len(proofs),"rows_with_screenshot_only_ocr":len(rows),
                                         "different_image_agreements":sum(int(r["independent_images"])>1 for r in rows),
                                         "conflicts":sum(r["conflict"]=="yes" for r in rows),
                                         "two_engine_agreements":sum(r["two_engine_agreement"]=="yes" for r in rows),
                                         "fully_read_images":sum(d["accepted_rows"] >= 16 for d in diagnostics.values())}},indent=2),encoding="utf-8")
    print(json.dumps(json.loads(REPORT.read_text(encoding="utf-8"))["totals"],indent=2))


if __name__ == "__main__":
    main()

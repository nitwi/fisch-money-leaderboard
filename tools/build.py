#!/usr/bin/env python3
"""Publish ONLY personally photo-checked screenshot observations.

OCR caches are internal reading aids and can never enter site/data.json without
first being checked against the original PNG and promoted in a photo audit.
No Excel-derived names or balances are read. Source images are never modified.
"""

import argparse
import csv
import hashlib
import json
import shutil
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from sessions import group_sessions

ROOT = Path(__file__).resolve().parents[1]


def rows(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def safe_path(root, relative):
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError(f"Path escapes evidence root: {relative}")
    return target


def checked_amount(value):
    if not value or not value.isascii() or not value.isdecimal():
        raise ValueError(f"Invalid exact C$ amount: {value!r}")
    number = int(value)
    if number < 0 or number > 9_223_372_036_854_775_807:
        raise ValueError("Balance is outside supported integer range")
    return str(number)


def build(source, copy_images=True):
    site = ROOT / "site"
    cp_rows = rows(source / "data/checkpoints.csv")
    ev_rows = rows(source / "data/evidence_manifest.csv")
    reviewed_path = ROOT / "data/reviewed.csv"
    reviewed_rows = rows(reviewed_path) if reviewed_path.exists() else []
    photo_verified_path=ROOT/'data/photo_verified.csv'
    if photo_verified_path.exists():
        reviewed_rows.extend(rows(photo_verified_path))
    reviewed = {row["observation_id"]: row for row in reviewed_rows}
    if len(reviewed) != len(reviewed_rows):
        raise ValueError("Duplicate reviewed observation ID")
    identity_path = ROOT / "data/roblox.json"
    identities = json.loads(identity_path.read_text(encoding="utf-8")) if identity_path.exists() else {}

    checkpoints = {}
    for row in cp_rows:
        key = row["checkpoint_id"]
        if key in checkpoints:
            raise ValueError(f"Duplicate checkpoint {key}")
        captured = datetime.fromisoformat(row["captured_at_utc"])
        if captured.utcoffset().total_seconds() != 0:
            raise ValueError(f"Not UTC: {key}")
        checkpoints[key] = {
            "id": key, "at": captured.isoformat().replace("+00:00", "Z"),
            "local": row["captured_at_local"], "precision": row["time_precision"],
            "coverage": int(row["covered_rank_count"]),
            "contact_sheet": row["contact_sheet"], "evidence": row["evidence_ids"].split(";"),
        }

    evidence = {}
    for row in ev_rows:
        key = row["evidence_id"]
        if key in evidence or row["checkpoint_id"] not in checkpoints:
            raise ValueError(f"Duplicate/orphan evidence {key}")
        path = safe_path(source, row["relative_path"])
        if not path.exists() and source == (ROOT / "data/source").resolve():
            path = safe_path(site, "evidence/" + row["relative_path"])
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != row["sha256"]:
            raise ValueError(f"Evidence SHA-256 mismatch: {key}")
        if copy_images:
            dest = safe_path(site, "evidence/" + row["relative_path"])
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists() or hashlib.sha256(dest.read_bytes()).hexdigest() != digest:
                shutil.copyfile(path, dest)
        evidence[key] = {
            "id": key, "checkpoint": row["checkpoint_id"],
            "captured_at": checkpoints[row["checkpoint_id"]]["at"],
            "url": "evidence/" + row["relative_path"].replace("\\", "/"),
            "sha256": digest, "min": int(row["min_visible_rank"]),
            "max": int(row["max_visible_rank"]),
        }

    # Build rank slots from the checkpoint/evidence index and photographed rank
    # spans. Never read the Excel-derived observations.csv for names or money.
    obs_rows=[]
    for cp in checkpoints.values():
        for rank in range(1,51):
            proof_ids=[key for key in cp['evidence'] if key in evidence and evidence[key]['min']<=rank<=evidence[key]['max']]
            obs_rows.append({'observation_id':f"{cp['id']}_R{rank:02d}", 'checkpoint_id':cp['id'],
                             'rank':str(rank), 'evidence_ids':';'.join(proof_ids),
                             'capture_status':'captured_pending_transcription' if proof_ids else 'not_captured'})

    observations = []
    slots = defaultdict(set)
    names = defaultdict(set)
    statuses = Counter()
    for row in obs_rows:
        key = row["observation_id"]
        cp = row["checkpoint_id"]
        rank = int(row["rank"])
        if cp not in checkpoints or rank not in range(1, 51) or rank in slots[cp]:
            raise ValueError(f"Duplicate/invalid rank slot {key}")
        slots[cp].add(rank)
        original_proofs = [part for part in row["evidence_ids"].split(";") if part]
        for proof in original_proofs:
            if proof not in evidence or evidence[proof]["checkpoint"] != cp:
                raise ValueError(f"Missing/mismatched source evidence {key}: {proof}")
        override = reviewed.get(key)
        if override:
            if row["capture_status"] == "not_captured":
                raise ValueError(f"Cannot confirm a rank with no screenshot: {key}")
            username = override["username_raw"].strip().lstrip("@")
            balance = checked_amount(override["balance_c"].strip())
            proof_ids = [part.strip() for part in override["evidence_ids"].split(";") if part.strip()]
            if not username or not proof_ids:
                raise ValueError(f"Incomplete manual review: {key}")
            if not all(proof in original_proofs and evidence[proof]["min"] <= rank <= evidence[proof]["max"] for proof in proof_ids):
                raise ValueError(f"Review proof is not linked to rank {key}")
            resolved = identities.get(username.casefold(), {})
            user_id = resolved.get("id")
            identity = f"id:{user_id}" if user_id and str(user_id).isdigit() else f"name:{username.casefold()}"
            if identity in names[cp]:
                raise ValueError(f"Duplicate username at {cp}: {username}")
            names[cp].add(identity)
            status = "verified"
        else:
            # A photographed but illegible/cropped slot is unknown, never zero.
            username = ""
            balance = ""
            proof_ids = original_proofs
            status = 'not_captured' if row['capture_status']=='not_captured' else 'captured_pending_transcription'
            identity = ""
        statuses[status] += 1
        observations.append({
            "id": key, "checkpoint": cp, "rank": rank, "username": username,
            "key": identity, "balance": balance, "status": status,
            "at": checkpoints[cp]["at"],
            "evidence": proof_ids,
        })

    if set(reviewed) - {row["observation_id"] for row in obs_rows}:
        raise ValueError("Reviewed CSV contains unknown observation IDs")
    if len(slots) != len(checkpoints) or any(len(ranks) != 50 for ranks in slots.values()):
        raise ValueError("Every checkpoint must contain exactly ranks 1 through 50")
    by_cp = defaultdict(dict)
    for row in observations:
        if row["status"] == "verified":
            by_cp[row["checkpoint"]][row["rank"]] = row
    for cp, ranked in by_cp.items():
        ordered=sorted(ranked.items())
        for (rank,a),(next_rank,b) in zip(ordered,ordered[1:]):
            if int(a['balance'])<int(b['balance']):
                raise ValueError(f"Verified balances out of leaderboard order at {cp}, ranks {rank}/{next_rank}")
    for key, cp in checkpoints.items():
        cp["verified"] = len(by_cp[key])
        cp['extracted']=0
        cp['visible']=len(by_cp[key])
        cp["complete"] = cp["coverage"] == 50 and cp["verified"] == 50
        if not set(cp["evidence"]).issubset(evidence):
            raise ValueError(f"Missing checkpoint proof at {key}")
    sorted_cps = sorted(checkpoints.values(), key=lambda item: item["at"])
    if len({cp["at"] for cp in sorted_cps}) != len(sorted_cps):
        raise ValueError("Capture timestamps must be unique")
    sessions, session_observations, session_stats = group_sessions(sorted_cps, observations)

    people = {}
    people_ident = {}
    for row in observations:
        if row["status"] == "verified":
            people[row["key"]] = row["username"]
            people_ident[row["key"]] = identities.get(row["username"].casefold(), {})
    players = []
    for key, display in sorted(people.items()):
        identity = people_ident[key]
        user_id = identity.get("id")
        if user_id is not None:
            if not str(user_id).isdigit():
                raise ValueError(f"Ambiguous Roblox ID for {key}")
        players.append({"key": key, "name": display, "roblox_id": str(user_id) if user_id else None,
                        "roblox_name": identity.get("name") if user_id else None,
                        "headshot": identity.get("headshot") if user_id else None})

    payload = {"version": 2, "timezone": "America/Chicago", "threshold": "8000000000",
               "checkpoints": sessions, "captures": sorted_cps, "evidence": list(evidence.values()),
               "observations": session_observations, "capture_observations": observations,
               "players": players, "status_counts": session_stats, "capture_status_counts": dict(statuses)}
    site.mkdir(exist_ok=True)
    (site / "data.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if copy_images and source != (ROOT / "data/source").resolve():
        baseline = ROOT / "data/source/data"
        baseline.mkdir(parents=True, exist_ok=True)
        for name in ("checkpoints.csv", "evidence_manifest.csv"):
            shutil.copyfile(source / "data" / name, baseline / name)
    print(json.dumps({"captures": len(sorted_cps), "sessions": len(sessions), "images": len(evidence),
                      "capture_rank_slots": len(observations), "session_rank_slots": len(session_observations),
                      "capture_verified": statuses["verified"], "session_verified": session_stats.get('verified',0),
                      "session_pending": session_stats.get('captured_pending_transcription',0),
                      "fully_verified_captures": sum(cp["complete"] for cp in sorted_cps),
                      "complete_sessions": sum(cp["complete"] for cp in sessions),
                      "evidence_mb": round(sum(safe_path(site, 'evidence/' + row['relative_path']).stat().st_size for row in ev_rows) / 1_000_000, 1) if copy_images else None}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "data/source", help="Evidence package root; defaults to bundled original CSVs and site/evidence/ PNGs")
    parser.add_argument("--no-copy", action="store_true", help="Do not copy original screenshots")
    args = parser.parse_args()
    build(args.source.resolve(), not args.no_copy)

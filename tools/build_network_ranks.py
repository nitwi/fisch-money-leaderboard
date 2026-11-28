#!/usr/bin/env python3
"""Publish a tiny, photo-verified leaderboard-rank overlay for Networker.

The Networker friendship snapshot is independent from the screenshot ledger and
must not freeze ranks. This script reads the already-verified site/data.json and
writes ONLY the current snapshot's rank/identity metadata. It never modifies
network-data.json, observations, screenshots or friendship evidence.

No Roblox API calls, OCR, scraping or guesses are made.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "site/data.json"
OUTPUT = ROOT / "site/network-ranks.json"
ID = re.compile(r"[1-9]\d{0,19}\Z")
USER = re.compile(r"[A-Za-z0-9_]{1,20}\Z")


def stable_id(value):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        return None
    value = str(value)
    return value if ID.fullmatch(value) else None


def at_time(value):
    if not isinstance(value, str):
        return None
    try:
        time = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return time if time.utcoffset() == dt.timedelta() else None


def current_rank_overlay(ledger):
    """Select the latest COMPLETE, photo-verified 50-rank leaderboard capture."""
    if not isinstance(ledger, dict):
        raise ValueError("Ledger payload must be an object")
    players = {}
    for item in ledger.get("players", []):
        if not isinstance(item, dict):
            continue
        user_id = stable_id(item.get("roblox_id"))
        if user_id and user_id not in players:
            players[user_id] = item
    ordered = sorted(
        (item for item in ledger.get("checkpoints", [])
         if isinstance(item, dict) and item.get("complete") is True and at_time(item.get("at"))),
        key=lambda item: (at_time(item["at"]), str(item.get("id", ""))), reverse=True,
    )
    if not ordered:
        raise ValueError("No complete photo-verified daily checkpoint available")
    observations = ledger.get("observations", [])
    for checkpoint in ordered:
        rows = [row for row in observations if isinstance(row, dict) and row.get("checkpoint") == checkpoint.get("id")]
        if len(rows) != 50 or any(row.get("status") != "verified" for row in rows):
            continue
        ranks = [row.get("rank") for row in rows]
        if set(ranks) != set(range(1, 51)) or any(type(rank) is not int for rank in ranks):
            continue
        entries, used_ids = [], set()
        for row in rows:
            key = row.get("key")
            user_id = stable_id(key[3:]) if isinstance(key, str) and key.startswith("id:") else None
            if not user_id or user_id not in players:
                continue  # Unresolved identities stay unknown, never guessed.
            if user_id in used_ids:
                raise ValueError("Same exact Roblox ID appears in multiple ranks")
            used_ids.add(user_id)
            person = players[user_id]
            username = person.get("roblox_name") or person.get("name") or ""
            if not isinstance(username, str) or not USER.fullmatch(username):
                username = ""
            headshot = person.get("headshot")
            if not isinstance(headshot, str) or not headshot.startswith("https://"):
                headshot = None
            entries.append({"id": user_id, "rank": row["rank"],
                            "username": username, "headshot": headshot})
        entries.sort(key=lambda item: item["rank"])
        return {
            "schema_version": 1,
            "source": "photo_verified_ledger",
            "checkpoint": {
                "id": str(checkpoint["id"]), "at": checkpoint["at"],
                "day_key": checkpoint.get("day_key"), "complete": True,
            },
            "verified_rank_slots": 50,
            "resolved_ranked_accounts": len(entries),
            "entries": entries,
        }
    raise ValueError("No complete, fully verified 50-rank checkpoint could be reconciled")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger", type=Path, default=LEDGER)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    result = current_rank_overlay(json.loads(args.ledger.read_text(encoding="utf-8")))
    args.output.write_text(json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Networker ranks: {result['checkpoint']['day_key']} / {result['checkpoint']['at']}; "
          f"{result['resolved_ranked_accounts']}/50 exact Roblox IDs, generated {args.output.name}")


if __name__ == "__main__":
    main()

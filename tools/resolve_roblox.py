#!/usr/bin/env python3
"""Resolve exact, reviewed leaderboard usernames to stable Roblox IDs and headshots.

Unmatched names remain unlinked; never guess identities by similarity. Re-run when
new screenshots arrive to refresh current display names and thumbnail CDN URLs.
"""

import csv
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEWED = ROOT / "data/reviewed.csv"
OUTPUT = ROOT / "data/roblox.json"


def request(url, body=None):
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json", "User-Agent": "FischMoneyLedger/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def chunks(items, size):
    for at in range(0, len(items), size):
        yield items[at:at + size]


def main():
    with REVIEWED.open(encoding="utf-8-sig", newline="") as file:
        names = sorted({row["username_raw"].strip().lstrip("@") for row in csv.DictReader(file) if row["username_raw"].strip()})
    known = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {}
    unresolved = [name for name in names if name.casefold() not in known]
    for batch in chunks(unresolved, 50):
        result = request("https://users.roblox.com/v1/usernames/users", {"usernames": batch, "excludeBannedUsers": False})
        for player in result.get("data", []):
            requested = player.get("requestedUsername", "")
            if requested.casefold() not in {name.casefold() for name in batch} or not str(player.get("id", "")).isdigit():
                continue
            # Roblox exact username resolution, never a fuzzy or display-name search.
            known[requested.casefold()] = {"id": player["id"], "name": player.get("name", requested), "headshot": None}
        time.sleep(.25)
    ids = sorted({entry["id"] for entry in known.values() if entry.get("id")})
    thumbs = {}
    for batch in chunks(ids, 50):
        params = urllib.parse.urlencode({"userIds": ",".join(map(str, batch)), "size": "150x150", "format": "Png", "isCircular": "false"})
        result = request("https://thumbnails.roblox.com/v1/users/avatar-headshot?" + params)
        for image in result.get("data", []):
            if image.get("state") == "Completed" and image.get("imageUrl", "").startswith("https://"):
                thumbs[image["targetId"]] = image["imageUrl"]
        time.sleep(.25)
    for entry in known.values():
        entry["headshot"] = thumbs.get(entry["id"])
    OUTPUT.write_text(json.dumps(known, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Resolved {len(known)} exact username(s); {len(unresolved)} new lookups; {len(thumbs)} headshots; {len(names)-len(known)} unresolved")


if __name__ == "__main__":
    main()

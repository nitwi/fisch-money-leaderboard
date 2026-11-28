#!/usr/bin/env python3
"""Build a public, optional username overlay for ID-only Networker nodes.

This enriches only presentation metadata. It never edits the historical
network snapshot or creates relationships, and never guesses a username
from similarity or display names. GitHub Pages browsers do not reliably
have CORS access to the Roblox Users API, so run during Pages publication.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "site/network-data.json"
OUTPUT = ROOT / "site/network-usernames.json"
SOURCE = "https://users.roblox.com/v1/users"
USERNAME = re.compile(r"[A-Za-z0-9_]{1,20}\Z")
ID = re.compile(r"[1-9][0-9]*\Z")


def exact_id(value):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        return None
    text = str(value)
    if not ID.fullmatch(text) or len(text) > 18:
        return None
    return text


def missing_ids(snapshot):
    """Only query exact IDs of nodes without a known saved username."""
    result = set()
    for node in [*snapshot.get("accounts", []), *snapshot.get("network_nodes", [])]:
        if not isinstance(node, dict):
            continue
        user_id = exact_id(node.get("id"))
        if not user_id:
            continue
        if not isinstance(node.get("username"), str) or not node["username"].strip():
            result.add(user_id)
    return sorted(result, key=int)


def verified_response(payload, requested, observed_at):
    """Reject mismatched IDs, malformed usernames and unexpected API shapes."""
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        return {}
    verified = {}
    for item in payload["data"]:
        if not isinstance(item, dict):
            continue
        user_id = exact_id(item.get("id"))
        username = item.get("name")
        if user_id not in requested or not isinstance(username, str) or not USERNAME.fullmatch(username):
            continue
        display = item.get("displayName")
        verified[user_id] = {
            "id": user_id,
            "username": username,
            "display_name": display if isinstance(display, str) and len(display) <= 80 else "",
            "observed_at": observed_at,
            "source_url": SOURCE,
        }
    return verified


def batches(items, size=50):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def fetch_ids(batch):
    # Roblox's documented public batch user-ID endpoint; no credentials,
    # proxy, cookie, or authenticated session is used.
    body = json.dumps({"userIds": [int(value) for value in batch], "excludeBannedUsers": False}).encode()
    request = urllib.request.Request(
        SOURCE, data=body, headers={"Content-Type": "application/json", "User-Agent": "FischMoneyLedger/Networker-Usernames"},
        method="POST")
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def build(snapshot, request_fn=fetch_ids, pause_fn=time.sleep, now=None):
    if now is None:
        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    targets = missing_ids(snapshot)
    names = {}
    failed = False
    for index, group in enumerate(batches(targets)):
        if index:
            pause_fn(0.4)
        try:
            payload = request_fn(group)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            # Respect explicit access restrictions and rate limits. Do not
            # retry with different endpoints or alternate routes.
            print(f"Roblox public username lookup unavailable: {error}; preserving known names and IDs.", file=sys.stderr)
            failed = True
            break
        names.update(verified_response(payload, set(group), now))
    return {
        "schema_version": 1,
        "source_url": SOURCE,
        "generated_at": now,
        "requested_count": len(targets),
        "resolved_count": len(names),
        "lookup_incomplete": failed or len(names) < len(targets),
        "users": names,
    }


def main():
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    result = build(snapshot)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Networker usernames: {result['resolved_count']}/{result['requested_count']} ID-only accounts resolved; "
          f"lookup_incomplete={result['lookup_incomplete']}; wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

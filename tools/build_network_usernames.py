#!/usr/bin/env python3
"""Build a public, optional username overlay for ID-only Networker nodes.

This enriches only presentation metadata. It never edits the historical
network snapshot or creates relationships, and never guesses a username
from similarity or display names. GitHub Pages browsers do not reliably
have CORS access to the Roblox Users API, so run during Pages publication.
"""
from __future__ import annotations

import argparse
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
MERGED_SOURCE = "roblox_verified_profile_and_prior_api"
PUBLISHED = "https://nitwi.github.io/fisch-money-leaderboard/network-usernames.json"
QUEUE = ROOT / "site/network-profile-queue.json"
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



def record_valid(user_id, record):
    """Only accept an exact matching numeric ID and a source we recognize."""
    if not isinstance(record, dict) or record.get("id") != user_id:
        return False
    name = record.get("username")
    if not isinstance(name, str) or not USERNAME.fullmatch(name):
        return False
    observed = record.get("observed_at")
    try:
        if not isinstance(observed, str) or not observed.endswith("Z"):
            return False
        dt.datetime.fromisoformat(observed.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return False
    source = record.get("source_url")
    return source == SOURCE or source == f"https://www.roblox.com/users/{user_id}/profile"


def inherit_previous(fetch_fn=None):
    """Read our own previously PUBLISHED static overlay; never call Roblox here."""
    if fetch_fn is None:
        def fetch_fn(url):
            request = urllib.request.Request(url, headers={"User-Agent": "FischMoneyLedger/ProfileEvidence"})
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.load(response)
    try:
        payload = fetch_fn(PUBLISHED)
    except (urllib.error.HTTPError, urllib.error.URLError, OSError, TimeoutError, ValueError) as error:
        print(f"Previous public username overlay unavailable: {error}", file=sys.stderr)
        return {}
    if not isinstance(payload, dict) or payload.get("schema_version") != 1:
        return {}
    users = payload.get("users")
    return users if isinstance(users, dict) else {}


def load_profile_names():
    # Import after the repository root is available on sys.path, whether the
    # script is invoked as python tools/... or imported by unittest.
    sys.path.insert(0, str(ROOT))
    from tools.import_network_profile_names import load_journal, verified_latest
    result = {}
    for user_id, entry in verified_latest(load_journal()).items():
        result[user_id] = {
            "id": user_id, "username": entry["username"],
            "display_name": entry["display_name"],
            "observed_at": entry["observed_at"],
            "source_url": entry["source_url"],
        }
    return result


def choose_latest(old, new):
    if old is None:
        return new
    a = dt.datetime.fromisoformat(old["observed_at"].replace("Z", "+00:00"))
    b = dt.datetime.fromisoformat(new["observed_at"].replace("Z", "+00:00"))
    return new if b >= a else old


def profile_queue(snapshot, resolved):
    """IDs needing an actual normal-profile-page inspection, ranked by saved relationships."""
    nodes = {str(item["id"]): item for item in [*snapshot.get("network_nodes", []), *snapshot.get("accounts", [])]
             if isinstance(item, dict) and "id" in item}
    degrees, leaderboard_links = {}, {}
    for edge in snapshot.get("historical_friend_edges", []):
        if not isinstance(edge, dict) or edge.get("kind") not in ("friend", "follow") or not edge.get("evidence"):
            continue
        a, b = exact_id(edge.get("from")), exact_id(edge.get("to"))
        if not a or not b or a == b:
            continue
        degrees.setdefault(a, set()).add(b)
        degrees.setdefault(b, set()).add(a)
        if nodes.get(a, {}).get("ledger"):
            leaderboard_links.setdefault(b, set()).add(a)
        if nodes.get(b, {}).get("ledger"):
            leaderboard_links.setdefault(a, set()).add(b)
    targets = [user_id for user_id in missing_ids(snapshot) if user_id not in resolved]
    result = []
    for user_id in targets:
        node = nodes.get(user_id, {})
        result.append({
            "id": user_id, "profile_url": f"https://www.roblox.com/users/{user_id}/profile",
            "saved_display_name": node.get("display_name", ""),
            "saved_aliases": [s for s in node.get("aliases", []) if isinstance(s, str)][:4],
            "observed_connections": len(degrees.get(user_id, ())),
            "distinct_ledger_connections": len(leaderboard_links.get(user_id, ())),
        })
    result.sort(key=lambda x: (-x["distinct_ledger_connections"], -x["observed_connections"], int(x["id"])))
    return {"schema_version": 1, "method": "roblox_website_profile",
            "remaining_ids": len(result), "priority": result,
            "note": "A queue for permitted manual/browser observation only; usernames are not inferred. Stop at website restrictions."}


def build(snapshot, request_fn=fetch_ids, pause_fn=time.sleep, now=None,
          *, profiles_only=False, prior_users=None, profile_users=None):
    """Merge exact known user IDs; profiles_only NEVER calls Roblox's Users API."""
    if now is None:
        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    targets = missing_ids(snapshot)
    target_set = set(targets)
    names = {}
    for source in (prior_users or {}, profile_users or {}):
        if not isinstance(source, dict):
            continue
        for user_id, value in source.items():
            if user_id in target_set and record_valid(user_id, value):
                names[user_id] = choose_latest(names.get(user_id), value)
    failed = False
    if not profiles_only:
        pending = [user_id for user_id in targets if user_id not in names]
        for index, group in enumerate(batches(pending)):
            if index:
                pause_fn(0.4)
            try:
                payload = request_fn(group)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
                # Respect explicit access restrictions. No alternative endpoints.
                print(f"Roblox public username lookup unavailable: {error}; preserving known names.", file=sys.stderr)
                failed = True
                break
            for user_id, value in verified_response(payload, set(group), now).items():
                names[user_id] = choose_latest(names.get(user_id), value)
    return {
        "schema_version": 1,
        "source_url": MERGED_SOURCE if profiles_only else SOURCE,
        "generated_at": now,
        "requested_count": len(targets),
        "resolved_count": len(names),
        "lookup_incomplete": failed or len(names) < len(targets),
        "users": names,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profiles-only", action="store_true",
                        help="Use saved website profile observations and previous published results; no Roblox API calls")
    parser.add_argument("--inherit-published", action="store_true",
                        help="Carry forward ID-matched username results from our previous GitHub Pages file")
    args = parser.parse_args()
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    records = load_profile_names()
    inherited = inherit_previous() if args.inherit_published else {}
    result = build(snapshot, profiles_only=args.profiles_only, profile_users=records, prior_users=inherited)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    queue = profile_queue(snapshot, result["users"])
    QUEUE.write_text(json.dumps(queue, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Networker usernames: {result['resolved_count']}/{result['requested_count']} names available; "
          f"{len(records)} from observed profiles; {len(inherited)} prior static candidates; "
          f"{queue['remaining_ids']} queued for profile inspection. "
          f"Roblox API calls {'DISABLED' if args.profiles_only else 'enabled'}.")



if __name__ == "__main__":
    main()

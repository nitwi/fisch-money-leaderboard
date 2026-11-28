#!/usr/bin/env python3
"""Import exact Roblox usernames observed on normal public profile pages.

This is deliberately an OFFLINE importer, not a scraper or API client.
Each entry is an actual, time-stamped human/browser observation; nothing
is reconstructed from a display name, search-result snippet, or guessed ID.
The canonical journal is append-only and independent of friend evidence.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
JOURNAL = ROOT / "data/network/profile-name-observations.jsonl"
SNAPSHOT = ROOT / "site/network-data.json"
USERNAME = re.compile(r"[A-Za-z0-9_]{1,20}\Z")
ID = re.compile(r"[1-9][0-9]*\Z")
TIME = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z\Z")
METHOD = "roblox_website_profile"


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def exact_id(value):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError("Roblox ID must be a positive decimal string or integer")
    value = str(value)
    if not ID.fullmatch(value) or len(value) > 18:
        raise ValueError("Roblox ID must be exact and positive; never guess IDs")
    return value


def utc_timestamp(value):
    if not isinstance(value, str) or not TIME.fullmatch(value):
        raise ValueError("Observed time must be an actual UTC ISO-8601 timestamp ending Z")
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.utcoffset() != dt.timedelta():
        raise ValueError("Observation timestamp must be UTC")
    return value


def profile_url(value, user_id):
    if not isinstance(value, str):
        raise ValueError("Source must be the exact Roblox profile page visited")
    parts = urlsplit(value)
    if (parts.scheme != "https" or parts.netloc not in ("www.roblox.com", "roblox.com")
            or parts.path != f"/users/{user_id}/profile" or parts.query or parts.fragment):
        raise ValueError("Source profile URL and recorded Roblox ID must exactly match")
    return f"https://www.roblox.com/users/{user_id}/profile"


def normalize(record):
    if not isinstance(record, dict):
        raise ValueError("Profile observation must be an object")
    allowed = {"schema_version", "method", "user_id", "username", "display_name",
               "observed_at", "source_url", "status", "observation_id"}
    if set(record) - allowed:
        raise ValueError("Unknown profile observation field")
    if record.get("schema_version") != 1 or record.get("method") != METHOD:
        raise ValueError("Unsupported schema or observation method")
    user_id = exact_id(record.get("user_id"))
    status = record.get("status", "verified")
    if status not in ("verified", "unavailable"):
        raise ValueError("Profile observation status must be verified or unavailable")
    username = record.get("username")
    if status == "verified":
        if not isinstance(username, str) or not USERNAME.fullmatch(username):
            raise ValueError("Verified observation needs the exact visible @username")
    elif username not in ("", None):
        raise ValueError("An unavailable profile cannot contain a guessed username")
    display = record.get("display_name", "")
    if not isinstance(display, str) or len(display) > 80 or any(ord(c) < 32 for c in display):
        raise ValueError("Invalid optional display name")
    normalized = {
        "schema_version": 1, "method": METHOD, "user_id": user_id,
        "username": username if status == "verified" else "",
        "display_name": display, "status": status,
        "observed_at": utc_timestamp(record.get("observed_at")),
        "source_url": profile_url(record.get("source_url"), user_id),
    }
    observation_id = "profile_" + hashlib.sha256(canonical(normalized).encode("utf-8")).hexdigest()[:32]
    if record.get("observation_id") not in (None, observation_id):
        raise ValueError("Observation ID does not match canonical content")
    normalized["observation_id"] = observation_id
    return normalized


def load_journal(path=JOURNAL):
    if not Path(path).exists():
        return []
    entries = []
    seen = set()
    for index, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        try:
            value = normalize(json.loads(raw))
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            raise ValueError(f"Invalid profile journal line {index}: {error}") from error
        if value["observation_id"] in seen:
            raise ValueError(f"Duplicate immutable profile observation at line {index}")
        seen.add(value["observation_id"])
        entries.append(value)
    return entries


def verified_latest(records):
    """Latest positive observation per EXACT ID; unavailable does not erase prior verified name."""
    latest = {}
    for index, record in enumerate(records):
        if record["status"] != "verified":
            continue
        user_id = record["user_id"]
        previous = latest.get(user_id)
        when = dt.datetime.fromisoformat(record["observed_at"].replace("Z", "+00:00"))
        if not previous or (when, index) >= (dt.datetime.fromisoformat(previous[0]["observed_at"].replace("Z", "+00:00")), previous[1]):
            latest[user_id] = (record, index)
    return {user_id: pair[0] for user_id, pair in latest.items()}


def append(records, journal=JOURNAL, snapshot=SNAPSHOT):
    if not isinstance(records, list):
        raise ValueError("Input must be an array of actual profile observations")
    normalized = [normalize(entry) for entry in records]  # Validate whole batch first
    data = json.loads(Path(snapshot).read_text(encoding="utf-8"))
    known = {str(item["id"]) for item in [*data.get("accounts", []), *data.get("network_nodes", [])]
             if isinstance(item, dict) and "id" in item}
    missing = {item["user_id"] for item in normalized} - known
    if missing:
        raise ValueError(f"Profile observations refer to {len(missing)} IDs absent from saved Networker data")
    Path(journal).parent.mkdir(parents=True, exist_ok=True)
    with Path(journal).open("a+", encoding="utf-8") as file:
        fcntl.flock(file.fileno(), fcntl.LOCK_EX)
        file.seek(0)
        existing = []
        for line in file:
            if line.strip():
                existing.append(normalize(json.loads(line)))
        seen = {item["observation_id"] for item in existing}
        added = []
        for item in normalized:
            if item["observation_id"] not in seen:
                added.append(item)
                seen.add(item["observation_id"])
        file.seek(0, 2)
        for item in added:
            file.write(canonical(item) + "\n")
        file.flush()
        fcntl.flock(file.fileno(), fcntl.LOCK_UN)
    return {"added": len(added), "duplicates": len(normalized)-len(added),
            "total": len(existing)+len(added)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["import", "stats"])
    parser.add_argument("--input", type=Path)
    args = parser.parse_args(argv)
    if args.command == "stats":
        records = load_journal()
        print(canonical({"observations": len(records), "named_ids": len(verified_latest(records))}))
        return
    if not args.input:
        parser.error("import requires --input /path/to/actual-browser-observations.json")
    batch = json.loads(args.input.read_text(encoding="utf-8"))
    print(canonical(append(batch)))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Profile import rejected: {exc}", file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Offline importer for directly observed Roblox website friend lists.

The JSONL journal is canonical and append-only. JSON projections and SQLite are
rebuildable. This module has no network, browser, authentication, or crawl code.
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import tempfile
from urllib.parse import parse_qsl, urlsplit


ROOT = Path(__file__).resolve().parents[1]
JOURNAL = ROOT / "data/network/website-observations.jsonl"
WEBSITE = "roblox_website"
LABELS = {WEBSITE: "Roblox website", "roblox_api": "Roblox public API"}
TERMINATIONS = {"more_available", "end_of_list", "not_scrolled", "access_unavailable", "unknown"}
EXTERNAL_VISUAL_FIELDS = ("avatar", "avatar_thumbnail", "headshot", "thumbnail")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def exact_id(value):
    if isinstance(value, bool) or not isinstance(value, (int, str)) or not re.fullmatch(r"[0-9]+", str(value)):
        raise ValueError("IDs must be exact positive integer Roblox IDs")
    number = int(value)
    if not 0 < number < 2**63:
        raise ValueError("ID is outside the positive int64 range")
    return str(number)


def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z", value):
        raise ValueError("Observation times must be actual UTC ISO timestamps ending in Z, with seconds and optional milliseconds")
    try:
        date = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Invalid UTC calendar timestamp") from exc
    return date.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def safe_text(value, *, username=False):
    if value is None:
        return None
    if not isinstance(value, str) or not value or len(value) > 100:
        raise ValueError("Invalid visible username/display-name field")
    # Roblox also displays generated replacement names such as
    # roblox_user_5080826450, which exceed the ordinary 20-character limit.
    if username and not (re.fullmatch(r"[A-Za-z0-9_]{1,20}", value) or re.fullmatch(r"roblox_user_[0-9]{1,20}", value)):
        raise ValueError("Use the exact visible Roblox username without @")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("Visible names must not contain control characters")
    return value


def allowed_keys(value, allowed, label):
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    unknown = set(value) - set(allowed)
    if unknown:
        raise ValueError(f"Unexpected {label} fields: {', '.join(sorted(unknown))}; credentials, session context, bios, and arbitrary page text are not accepted")


def profile_url(user_id):
    return f"https://www.roblox.com/users/{exact_id(user_id)}/profile"


def website_url(value, user_id, *, profile=False):
    if not isinstance(value, str) or len(value) > 1000:
        raise ValueError("A normal Roblox profile/friends page URL is required")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or parsed.hostname not in ("www.roblox.com", "roblox.com") or parsed.username or parsed.password or parsed.port:
        raise ValueError("Only normal HTTPS Roblox website URLs without credentials or ports are accepted")
    match = re.fullmatch(r"/users/([0-9]+)/(profile|friends|connections)/?", parsed.path)
    if not match or exact_id(match[1]) != exact_id(user_id) or (profile and match[2] != "profile"):
        raise ValueError("Page/profile URL must contain its exact corresponding Roblox user ID")
    if profile and (parsed.query or parsed.fragment):
        raise ValueError("Friend profile URLs must be plain profile links")
    if parsed.fragment not in ("", "!/friends", "/friends", "friends", "!/connections", "/connections", "connections"):
        raise ValueError("Unexpected website fragment; do not include session or tracking context")
    for key, val in parse_qsl(parsed.query, keep_blank_values=True):
        if key not in ("page", "pageNumber") or not re.fullmatch(r"[1-9][0-9]*", val):
            raise ValueError("Only numeric website pagination query parameters are accepted; no session values")
    return value


def normalize_observation(record):
    allowed_keys(record, {
        "schema_version", "method", "relation", "source_id", "source_username", "source_profile_url",
        "observed_at", "page_url", "source_url", "displayed_total_count", "coverage", "friends", "observation_id",
    }, "observation")
    if record.get("schema_version", 1) != 1 or record.get("method", WEBSITE) != WEBSITE or record.get("relation", "friends") != "friends":
        raise ValueError("Only schema_version 1, method roblox_website, direct friends observations are accepted")
    source_id = exact_id(record.get("source_id"))
    observed_at = timestamp(record.get("observed_at"))
    page = record.get("page_url", record.get("source_url"))
    if "page_url" in record and "source_url" in record and record["page_url"] != record["source_url"]:
        raise ValueError("page_url and source_url disagree")
    page = website_url(page, source_id)
    source_profile = website_url(record.get("source_profile_url"), source_id, profile=True)
    total = record.get("displayed_total_count")
    if total is not None and (isinstance(total, bool) or not isinstance(total, int) or not 0 <= total <= 10_000_000):
        raise ValueError("Displayed total must be a nonnegative integer or null, never an inferred count")
    coverage = record.get("coverage")
    allowed_keys(coverage, {"status", "full_list_verified", "pages_observed", "termination"}, "coverage")
    status = coverage.get("status", "partial")
    if status not in ("partial", "complete", "unavailable"):
        raise ValueError("Coverage must be partial, complete, or unavailable")
    verified = coverage.get("full_list_verified", False)
    if not isinstance(verified, bool):
        raise ValueError("full_list_verified must be an explicit boolean")
    ending = coverage.get("termination", "unknown")
    if ending not in TERMINATIONS:
        raise ValueError("Unknown pagination termination value")
    pages = coverage.get("pages_observed", [1])
    if not isinstance(pages, list) or not pages or len(pages) > 1000 or any(isinstance(p, bool) or not isinstance(p, int) or p < 1 for p in pages) or len(set(pages)) != len(pages):
        raise ValueError("pages_observed must contain unique positive view/page numbers")
    friends = record.get("friends")
    if not isinstance(friends, list) or len(friends) > 10_000:
        raise ValueError("friends must be a bounded list of actually visible profile links")
    normalized = []
    seen_evidence = set()
    for friend in friends:
        allowed_keys(friend, {"id", "username", "display_name", "profile_url", "observed_at", "source_url"}, "friend")
        target_id = exact_id(friend.get("id"))
        if target_id == source_id:
            raise ValueError("A source account cannot be its own observed friend")
        item_time = timestamp(friend.get("observed_at", observed_at))
        if item_time > observed_at:
            raise ValueError("An item's observation time cannot follow the containing observation's completion time")
        item = {
            "id": target_id, "username": safe_text(friend.get("username"), username=True),
            "display_name": safe_text(friend.get("display_name")),
            "profile_url": website_url(friend.get("profile_url"), target_id, profile=True),
            "observed_at": item_time, "source_url": website_url(friend.get("source_url", page), source_id),
        }
        signature = canonical(item)
        if signature not in seen_evidence:
            normalized.append(item)
            seen_evidence.add(signature)
    unique_ids = {item["id"] for item in normalized}
    if total is not None and len(unique_ids) > total:
        raise ValueError("Observed unique friends exceed the displayed total; keep separate observations if the page changed")
    if status == "complete":
        if not verified or ending != "end_of_list" or total is None or len(unique_ids) != total:
            raise ValueError("Complete requires full_list_verified:true, end_of_list, and an explicitly displayed total matching all unique observed IDs")
    elif verified:
        raise ValueError("full_list_verified:true requires complete coverage with a matching displayed total")
    if status == "unavailable" and normalized:
        raise ValueError("An observation containing visible friends must be partial or complete, not unavailable")
    result = {
        "schema_version": 1, "method": WEBSITE, "relation": "friends", "source_id": source_id,
        "source_username": safe_text(record.get("source_username"), username=True),
        "source_profile_url": source_profile, "observed_at": observed_at, "page_url": page,
        "displayed_total_count": total,
        "coverage": {"status": status, "full_list_verified": verified, "pages_observed": sorted(pages), "termination": ending},
        "friends": sorted(normalized, key=lambda item: (int(item["id"]), item["observed_at"], item["source_url"], item["username"] or "")),
    }
    result["observation_id"] = "web_" + digest(result)[:32]
    if record.get("observation_id") not in (None, result["observation_id"]):
        raise ValueError("Observation ID does not match its immutable canonical content")
    return result


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"Duplicate JSON object key: {key}")
        value[key] = item
    return value


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=unique_object)


def read_journal(path=JOURNAL):
    path = Path(path)
    if not path.exists():
        return []
    records, seen = [], set()
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            record = normalize_observation(json.loads(line, object_pairs_hook=unique_object))
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Journal line {line_number} is invalid; journal left unchanged: {exc}") from exc
        if record["observation_id"] in seen:
            raise ValueError(f"Journal contains duplicate observation ID at line {line_number}")
        seen.add(record["observation_id"])
        records.append(record)
    return records


def append_journal(records, path=JOURNAL, *, allowed_sources=None):
    if not isinstance(records, list):
        raise ValueError("Input must be a JSON array of website observations")
    normalized = [normalize_observation(record) for record in records]
    if allowed_sources is not None:
        unknown = {record["source_id"] for record in normalized} - set(allowed_sources)
        if unknown:
            raise ValueError("Source IDs are outside the approved census plan: " + ", ".join(sorted(unknown)))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ValueError("Another importer holds the journal; retry after it completes") from exc
        existing = read_journal(path)
        seen = {record["observation_id"] for record in existing}
        added = []
        for record in normalized:
            if record["observation_id"] not in seen:
                added.append(record)
                seen.add(record["observation_id"])
        if added:
            separator = "\n" if path.stat().st_size and not path.read_bytes().endswith(b"\n") else ""
            handle.write(separator + "".join(canonical(record) + "\n" for record in added))
            handle.flush()
            os.fsync(handle.fileno())
        return {"added": len(added), "duplicates": len(normalized) - len(added), "total": len(existing) + len(added), "observation_ids": [record["observation_id"] for record in normalized]}


def api_event(account):
    original = copy.deepcopy(account.get("friend_evidence", {}).get("api", account.get("friends", {})))
    event_id = "api_" + digest({"source_id": account["id"], "record": original})[:32]
    when = original.get("fetched_at") or original.get("checked_at")
    when = timestamp(when) if when else "0001-01-01T00:00:00.000Z"
    checked = timestamp(original["checked_at"]) if original.get("checked_at") else when
    items = []
    if original.get("status") in ("complete", "partial"):
        for item in original.get("items", []):
            target = exact_id(item["id"])
            if target == account["id"]:
                continue
            items.append({
                "id": target, "username": item.get("username"), "display_name": item.get("display_name"),
                "profile_url": profile_url(target), "observed_at": timestamp(item.get("observed_at") or original.get("fetched_at")),
                "source_url": item.get("source_url") or original.get("source_url"),
            })
    return {"id": event_id, "source_id": account["id"], "method": "roblox_api", "at": when, "checked_at": checked,
            "status": original.get("status", "unavailable"), "source_url": original.get("source_url"),
            "items": items, "raw": original, "index": -1}


def website_event(record, index):
    return {"id": record["observation_id"], "source_id": record["source_id"], "method": WEBSITE,
            "at": record["observed_at"], "checked_at": record["observed_at"], "status": record["coverage"]["status"], "source_url": record["page_url"],
            "items": record["friends"], "raw": record, "index": index}


def project_friends(events):
    ordered = sorted(events, key=lambda event: (event["at"], event["index"]))
    complete_indexes = [i for i, event in enumerate(ordered) if event["status"] == "complete"]
    start = complete_indexes[-1] if complete_indexes else 0
    boundary = ordered[start] if complete_indexes else None
    active = ordered[start:]
    readable = [event for event in active if event["status"] in ("partial", "complete")]
    newest = max(ordered, key=lambda event: (event["checked_at"], event["index"]))
    latest_readable = readable[-1] if readable else None
    status = "complete" if newest["status"] == "complete" and newest["checked_at"] == newest["at"] else "partial" if readable else "unavailable"
    evidence = {}
    for event in readable:
        for item in event["items"]:
            if boundary is not None and event is not boundary and item["observed_at"] < boundary["at"]:
                continue
            link = {"observation_id": event["id"], "source_id": event["source_id"], "target_id": item["id"],
                    "method": event["method"], "source_label": LABELS[event["method"]],
                    "observed_at": item["observed_at"], "source_url": item["source_url"], "profile_url": item["profile_url"]}
            evidence.setdefault(item["id"], []).append((item, link))
    items = []
    for user_id, entries in evidence.items():
        entries.sort(key=lambda pair: pair[1]["observed_at"])
        item, latest_link = entries[-1]
        links = list({canonical(link): link for _, link in entries}.values())
        methods = {link["method"] for link in links}
        items.append({"id": user_id, "username": item.get("username") or "", "display_name": item.get("display_name") or item.get("username") or "",
                      "profile_url": item["profile_url"], "observed_at": latest_link["observed_at"], "source_url": latest_link["source_url"],
                      "method": next(iter(methods)) if len(methods) == 1 else "mixed",
                      "source_label": " + ".join(LABELS[method] for method in sorted(methods)), "evidence": links})
    methods = {event["method"] for event in readable} or {newest["method"]}
    result = {"status": status, "items": sorted(items, key=lambda item: int(item["id"])),
              "fetched_at": latest_readable["at"] if latest_readable else None, "checked_at": newest["checked_at"],
              "source_url": latest_readable["source_url"] if latest_readable else newest["source_url"], "attempted": True,
              "method": next(iter(methods)) if len(methods) == 1 else "mixed",
              "source_label": " + ".join(LABELS[method] for method in sorted(methods)),
              "observation_ids": [event["id"] for event in ordered],
              "coverage_policy": "Latest complete observation replaces older positives; later partial positives are added. Later partial/unavailable checks make absence unknown.",
              "latest_complete_at": ordered[start]["at"] if complete_indexes else None}
    if status == "complete":
        result["total_count"] = len(items)
    if newest["status"] == "unavailable" or (newest["method"] == "roblox_api" and newest["checked_at"] > newest["at"]):
        result["failed_at"] = newest["checked_at"]
    return result


def merge_snapshot(snapshot, records):
    merged = copy.deepcopy(snapshot)
    accounts = {exact_id(account["id"]): account for account in merged.get("accounts", [])}
    if len(accounts) != len(merged.get("accounts", [])):
        raise ValueError("Snapshot contains duplicate account IDs")
    prior_nodes = {}
    for node in merged.get("network_nodes", []):
        if not isinstance(node, dict):
            raise ValueError("Snapshot network nodes must be objects with exact IDs")
        node_id = exact_id(node.get("id"))
        if node_id in prior_nodes:
            raise ValueError("Snapshot contains duplicate network node IDs")
        prior_nodes[node_id] = node
    supplied_ids = {record["observation_id"] for record in records}
    required_ids = {observation_id for account in accounts.values()
                    for observation_id in account.get("friend_evidence", {}).get("website_observation_ids", [])}
    missing_ids = required_ids - supplied_ids
    if missing_ids:
        raise ValueError(f"Cannot rebuild the merged snapshot: {len(missing_ids)} previously retained website observations are missing from the supplied journal; restore the complete journal")
    by_source = {}
    for index, record in enumerate(records):
        if record["source_id"] not in accounts:
            raise ValueError("Website source is not a resolved account in the snapshot: " + record["source_id"])
        by_source.setdefault(record["source_id"], []).append(website_event(record, index))
    all_events = []
    nodes = {}
    for account in accounts.values():
        account["id"] = exact_id(account["id"])
        nodes[account["id"]] = {"id": account["id"], "username": account.get("username", ""), "display_name": account.get("display_name", ""),
                                "profile_url": profile_url(account["id"]), "ledger": bool(account.get("ledger")), "target": bool(account.get("target")),
                                "external": False, "aliases": sorted(set(account.get("aliases", [])))}
        base = api_event(account)
        events = [base] + by_source.get(account["id"], [])
        all_events.extend(events)
        if account["id"] in by_source:
            latest_website = max(by_source[account["id"]], key=lambda event: (event["at"], event["index"]))
            account["friend_evidence"] = {"api": base["raw"], "website_observation_ids": [event["id"] for event in events if event["method"] == WEBSITE],
                                          "latest_website": {"observation_id": latest_website["id"], "observed_at": latest_website["at"],
                                                             "source_url": latest_website["source_url"],
                                                             "displayed_total_count": latest_website["raw"]["displayed_total_count"],
                                                             "observed_id_count": len({item["id"] for item in latest_website["items"]}),
                                                             "coverage": copy.deepcopy(latest_website["raw"]["coverage"])},
                                          "projection_policy": "latest_complete_then_later_positive"}
            account["friends"] = project_friends(events)
    # External neighbors live here and in SQLite, never in avatar candidates.
    for event in sorted(all_events, key=lambda e: (e["at"], e["index"])):
        if event["method"] == WEBSITE:
            source_name = event["raw"].get("source_username")
            if source_name and source_name not in nodes[event["source_id"]]["aliases"]:
                nodes[event["source_id"]]["aliases"].append(source_name)
        for item in event["items"]:
            node = nodes.setdefault(item["id"], {"id": item["id"], "username": "", "display_name": "", "profile_url": item["profile_url"], "ledger": False, "target": False, "external": True, "aliases": []})
            if item.get("username"):
                if item["username"] not in node["aliases"]:
                    node["aliases"].append(item["username"])
                if node["external"]:
                    node["username"] = item["username"]
            if node["external"] and item.get("display_name"):
                node["display_name"] = item["display_name"]
    # Rebuilding social observations must not discard separately collected avatar
    # evidence or refresh its source time. Match only exact IDs, retain only the
    # existing visual record fields, and derive identities/edges from sources above.
    for node_id, node in nodes.items():
        if node["external"]:
            prior = prior_nodes.get(node_id, {})
            node.update({key: copy.deepcopy(prior[key]) for key in EXTERNAL_VISUAL_FIELDS if key in prior})
    merged["network_nodes"] = sorted(nodes.values(), key=lambda node: int(node["id"]))
    merged.setdefault("api_generated_at", snapshot.get("api_generated_at", snapshot.get("generated_at")))
    merged["generated_at"] = utc_now()
    merged["website_observations"] = {
        "method": WEBSITE, "source_label": LABELS[WEBSITE],
        "journal_sha256": hashlib.sha256("".join(canonical(record) + "\n" for record in records).encode()).hexdigest(),
        "journal_hash_format": "canonical_jsonl_v1",
        "observation_count": len(records), "source_account_count": len(by_source),
        "latest_observed_at": max((r["observed_at"] for r in records), default=None),
        "ledger_source_count": sum(bool(accounts[user_id].get("ledger")) for user_id in by_source),
        **{f"{status}_source_count": sum(accounts[user_id]["friend_evidence"]["latest_website"]["coverage"]["status"] == status for user_id in by_source)
           for status in ("complete", "partial", "unavailable")},
        "external_node_count": sum(node["external"] for node in nodes.values()),
        "scope": "Directly visible friends only; no recursive collection. API capabilities remain unchanged and separately attributable.",
    }
    return merged, all_events


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(dir=path.parent, prefix=".network-", suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def build_database(path, merged, events):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(dir=path.parent, prefix=".network-db-", suffix=".sqlite")
    os.close(descriptor)
    compressed_name = None
    try:
        with sqlite3.connect(name) as connection:
            connection.executescript("""
                PRAGMA foreign_keys=ON;
                CREATE TABLE metadata(key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
                CREATE TABLE nodes(id TEXT PRIMARY KEY,username TEXT,display_name TEXT,profile_url TEXT NOT NULL,ledger INTEGER NOT NULL,target INTEGER NOT NULL,external INTEGER NOT NULL,aliases_json TEXT NOT NULL);
                CREATE TABLE checkpoints(id TEXT PRIMARY KEY,at TEXT,day_key TEXT);
                CREATE TABLE account_coverage(account_id TEXT PRIMARY KEY REFERENCES nodes(id),checkpoint_id TEXT REFERENCES checkpoints(id),latest_rank INTEGER,last_seen_day TEXT,website_observations INTEGER NOT NULL,friend_status TEXT NOT NULL,last_checked_at TEXT,last_complete_at TEXT);
                CREATE TABLE observations(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES nodes(id),method TEXT NOT NULL,relation TEXT NOT NULL,observed_at TEXT,checked_at TEXT,source_url TEXT,coverage_status TEXT NOT NULL,displayed_total_count INTEGER,raw_json TEXT NOT NULL);
                CREATE TABLE friendship_evidence(observation_id TEXT NOT NULL REFERENCES observations(id),source_id TEXT NOT NULL REFERENCES nodes(id),target_id TEXT NOT NULL REFERENCES nodes(id),observed_at TEXT NOT NULL,source_url TEXT,target_profile_url TEXT NOT NULL,target_username TEXT,method TEXT NOT NULL,PRIMARY KEY(observation_id,source_id,target_id,observed_at,source_url));
                CREATE TABLE friendship_current(source_id TEXT NOT NULL REFERENCES nodes(id),target_id TEXT NOT NULL REFERENCES nodes(id),observed_at TEXT,source_url TEXT,source_label TEXT,coverage_status TEXT NOT NULL,evidence_json TEXT NOT NULL,PRIMARY KEY(source_id,target_id));
                CREATE INDEX observations_source_time ON observations(source_id,observed_at);
                CREATE INDEX evidence_source_target_time ON friendship_evidence(source_id,target_id,observed_at);
                CREATE INDEX evidence_target_source ON friendship_evidence(target_id,source_id);
                CREATE INDEX current_target_source ON friendship_current(target_id,source_id);
            """)
            connection.execute("INSERT INTO metadata VALUES(?,?)", ("website_observations", canonical(merged["website_observations"])))
            connection.execute("INSERT INTO metadata VALUES(?,?)", ("api_capabilities", canonical(merged.get("capabilities", {}))))
            connection.execute("INSERT INTO metadata VALUES(?,?)", ("generated_at", canonical(merged["generated_at"])))
            for node in merged["network_nodes"]:
                connection.execute("INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?)", (node["id"], node["username"], node["display_name"], node["profile_url"], int(node["ledger"]), int(node["target"]), int(node["external"]), canonical(node["aliases"])))
            cp = merged.get("ledger_latest_checkpoint") or {}
            if cp.get("id"):
                connection.execute("INSERT INTO checkpoints VALUES(?,?,?)", (cp["id"], cp.get("at"), cp.get("day_key")))
            for event in events:
                raw = event["raw"]
                when = None if event["at"].startswith("0001-") else event["at"]
                checked = None if event["checked_at"].startswith("0001-") else event["checked_at"]
                count = raw.get("displayed_total_count") if event["method"] == WEBSITE else raw.get("total_count")
                connection.execute("INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?)", (event["id"], event["source_id"], event["method"], "friends", when, checked, event["source_url"], event["status"], count, canonical(raw)))
                for item in event["items"]:
                    connection.execute("INSERT OR IGNORE INTO friendship_evidence VALUES(?,?,?,?,?,?,?,?)", (event["id"], event["source_id"], item["id"], item["observed_at"], item["source_url"], item["profile_url"], item.get("username"), event["method"]))
            for account in merged["accounts"]:
                friend = account.get("friends", {})
                ids = account.get("friend_evidence", {}).get("website_observation_ids", [])
                connection.execute("INSERT INTO account_coverage VALUES(?,?,?,?,?,?,?,?)", (account["id"], cp.get("id"), account.get("latest_rank"), account.get("last_seen_day"), len(ids), friend.get("status", "unavailable"), friend.get("checked_at") or friend.get("fetched_at"), friend.get("latest_complete_at") or (friend.get("fetched_at") if friend.get("status") == "complete" else None)))
                if friend.get("status") in ("partial", "complete"):
                    for item in friend.get("items", []):
                        connection.execute("INSERT OR IGNORE INTO friendship_current VALUES(?,?,?,?,?,?,?)", (account["id"], item["id"], item.get("observed_at") or friend.get("fetched_at"), item.get("source_url") or friend.get("source_url"), item.get("source_label") or LABELS["roblox_api"], friend["status"], canonical(item.get("evidence", []))))
        if path.suffix == ".gz":
            descriptor, compressed_name = tempfile.mkstemp(dir=path.parent, prefix=".network-db-", suffix=".gz")
            with os.fdopen(descriptor, "wb") as output, open(name, "rb") as source:
                with gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0) as compressed:
                    shutil.copyfileobj(source, compressed)
            os.replace(compressed_name, path)
        else:
            os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)
        if compressed_name:
            Path(compressed_name).unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    importer = commands.add_parser("import", help="Validate a JSON array and append new immutable observations")
    importer.add_argument("--input", required=True, type=Path)
    importer.add_argument("--journal", type=Path, default=JOURNAL)
    importer.add_argument("--plan", type=Path, default=ROOT / "data/network/census-plan.json")
    builder = commands.add_parser("build", help="Build reviewable merged JSON and/or a derived SQLite database")
    builder.add_argument("--journal", type=Path, default=JOURNAL)
    builder.add_argument("--snapshot", type=Path, default=ROOT / "site/network-data.json")
    builder.add_argument("--output", type=Path)
    builder.add_argument("--sqlite", type=Path, help="SQLite output; a .gz suffix writes a compressed SQLite download")
    args = parser.parse_args(argv)
    try:
        if args.command == "import":
            plan = load_json(args.plan)
            allowed = {exact_id(item["id"]) for item in plan["targets"]}
            result = append_journal(load_json(args.input), args.journal, allowed_sources=allowed)
            print(canonical({"journal": str(args.journal), **result}))
        else:
            if not args.output and not args.sqlite:
                parser.error("build requires --output and/or --sqlite; the source snapshot is not changed implicitly")
            protected = {args.journal.resolve(), (ROOT / "data/network/census-plan.json").resolve()}
            if any(path is not None and path.resolve() in protected for path in (args.output, args.sqlite)):
                raise ValueError("Derived output must not replace the canonical journal or census plan")
            if args.sqlite and (args.sqlite.resolve() == args.snapshot.resolve() or (args.output and args.sqlite.resolve() == args.output.resolve())):
                raise ValueError("SQLite output must be separate from input/output JSON files")
            records = read_journal(args.journal)
            merged, events = merge_snapshot(load_json(args.snapshot), records)
            if args.sqlite:
                build_database(args.sqlite, merged, events)
            if args.output:
                atomic_json(args.output, merged)
            print(canonical({"website_observations": len(records), "source_accounts": merged["website_observations"]["source_account_count"], "external_nodes": merged["website_observations"]["external_node_count"], "output": str(args.output) if args.output else None, "sqlite": str(args.sqlite) if args.sqlite else None}))
        return 0
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as exc:
        parser.exit(1, f"Offline import/build failed: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Build a bounded, unauthenticated snapshot from official Roblox public APIs.

Run: python tools/scan_networker.py --target Lunary810
No credentials, cookies, proxy service, browser session, or private-data fallback
are accepted. The standard runtime's network configuration is left unchanged.
Unavailable responses are recorded as unavailable, never as empty social lists.

References:
https://create.roblox.com/docs/cloud/reference/domains/friends
https://create.roblox.com/docs/cloud/reference/domains/avatar
https://create.roblox.com/docs/cloud/reference/domains/thumbnails
"""

from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import json
import math
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOCIAL_PATHS = {"friends": "friends/find", "followers": "followers", "following": "followings"}
ALLOWED_HOSTS = {"users.roblox.com", "friends.roblox.com", "avatar.roblox.com", "thumbnails.roblox.com"}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def stable_id(value: Any) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError("Expected a positive integer Roblox ID")
    text = str(value)
    if not re.fullmatch(r"[0-9]+", text) or not 0 < int(text) < 2**63:
        raise ValueError("Expected a positive integer Roblox ID")
    return str(int(text))


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def header_delay(headers: dict[str, str], wall_time: float) -> float | None:
    """Honor either Retry-After or a rate reset; never retry earlier than either."""
    delays: list[float] = []
    for key in ("retry-after", "x-ratelimit-reset", "ratelimit-reset"):
        value = headers.get(key)
        if not value:
            continue
        try:
            number = float(value)
            if math.isfinite(number):
                if key != "retry-after" and number > 1_000_000_000:
                    number -= wall_time
                delays.append(max(0.0, number))
                continue
        except (ValueError, TypeError):
            pass
        if key == "retry-after":
            try:
                date = email.utils.parsedate_to_datetime(value)
                if date.tzinfo is None:
                    date = date.replace(tzinfo=dt.timezone.utc)
                delays.append(max(0.0, date.timestamp() - wall_time))
            except (TypeError, ValueError, OverflowError):
                pass
    return max(delays) if delays else None


def error_message(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict) and isinstance(payload.get("errors"), list):
        messages = [str(item.get("message", "")) for item in payload["errors"] if isinstance(item, dict)]
        if any(messages):
            return "; ".join(filter(None, messages))[:500]
    return fallback[:500]


@dataclass
class ApiResult:
    url: str
    fetched_at: str | None
    status: int | None
    payload: Any = None
    error: str | None = None
    headers: dict[str, str] | None = None
    attempted: bool = True

    @property
    def ok(self) -> bool:
        return self.status == 200 and self.error is None


class OfficialRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlparse(newurl)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            raise urllib.error.HTTPError(req.full_url, code, "Unexpected API redirect refused", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class ApiClient:
    def __init__(self, *, timeout=15.0, attempts=3, max_retry_wait=90.0,
                 avatar_per_minute=30.0, opener=None, sleep=time.sleep,
                 monotonic=time.monotonic, wall_time=time.time, now=utc_now):
        if not 0 < avatar_per_minute <= 30:
            raise ValueError("Avatar request rate must be greater than 0 and at most 30/minute")
        self.timeout = timeout
        self.attempts = attempts
        self.max_retry_wait = max_retry_wait
        self.avatar_interval = 60.0 / avatar_per_minute
        self.opener = opener or urllib.request.build_opener(OfficialRedirects())
        self.sleep, self.monotonic, self.wall_time, self.now = sleep, monotonic, wall_time, now
        self.next_allowed: dict[str, float] = {}

    def wait(self, seconds: float) -> None:
        """Use short waits so progress remains interruptible."""
        remaining = max(0.0, seconds)
        while remaining > 0:
            chunk = min(30.0, remaining)
            self.sleep(chunk)
            remaining -= chunk

    def request(self, url: str, *, body=None, group="default") -> ApiResult:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            raise ValueError("Only the fixed official Roblox API hosts may be requested")
        retry_wait = 0.0
        last_result = None
        for attempt in range(self.attempts):
            gate = max(0.0, self.next_allowed.get(group, 0.0) - self.monotonic())
            if gate > self.max_retry_wait - retry_wait:
                if last_result is not None:
                    last_result.error = f"{last_result.error or 'Request failed'}; next-attempt cooldown exceeds the remaining wait budget"
                    return last_result
                return ApiResult(url, None, None, error="Rate-limit cooldown exceeds the request wait budget; no request made", attempted=False)
            self.wait(gate)
            retry_wait += gate
            if group == "avatar":
                self.next_allowed[group] = self.monotonic() + self.avatar_interval
            headers = {"User-Agent": "FischMoneyLedger/1.0", "Accept": "application/json"}
            payload = None
            if body is not None:
                headers["Content-Type"] = "application/json"
                payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
            request = urllib.request.Request(url, data=payload, headers=headers)
            response_headers: dict[str, str] = {}
            try:
                with self.opener.open(request, timeout=self.timeout) as response:
                    status = response.status
                    response_headers = {key.lower(): value for key, value in response.headers.items()}
                    raw = response.read(8_000_001)
                if len(raw) > 8_000_000:
                    return ApiResult(url, self.now(), status, error="API response exceeded the bounded size limit")
                try:
                    data = json.loads(raw)
                except (ValueError, UnicodeError):
                    return ApiResult(url, self.now(), status, error="API returned malformed JSON")
                result = ApiResult(url, self.now(), status, data, headers=response_headers)
                if status != 200:
                    result.error = error_message(data, f"HTTP {status}")
            except urllib.error.HTTPError as exc:
                status = exc.code
                response_headers = {key.lower(): value for key, value in exc.headers.items()} if exc.headers else {}
                try:
                    data = json.loads(exc.read(16_000))
                except (ValueError, UnicodeError):
                    data = None
                result = ApiResult(url, self.now(), status, data, error_message(data, f"HTTP {status}"), response_headers)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                result = ApiResult(url, self.now(), None, error=f"Network request failed: {type(exc).__name__}")

            last_result = result
            delay = header_delay(response_headers, self.wall_time())
            remaining = response_headers.get("x-ratelimit-remaining", response_headers.get("ratelimit-remaining"))
            try:
                exhausted = remaining is not None and float(remaining) <= 0
            except ValueError:
                exhausted = False
            if (exhausted or result.status == 429) and delay is not None:
                self.next_allowed[group] = max(self.next_allowed.get(group, 0.0), self.monotonic() + delay + 0.25)
            if result.ok or result.status not in (None, 429, 500, 502, 503, 504):
                return result
            if attempt + 1 == self.attempts:
                result.error = f"{result.error or 'Request failed'}; retry limit reached"
                return result
            pause = max(2.0 ** attempt, delay + 0.25 if delay is not None else 0.0)
            if pause > self.max_retry_wait - retry_wait:
                result.error = f"{result.error or 'Request failed'}; required retry wait exceeds the bounded wait budget"
                return result
            log(f"  HTTP {result.status or 'network error'}: waiting {pause:.1f}s before bounded retry")
            self.wait(pause)
            retry_wait += pause
        raise AssertionError("Request attempts must be positive")


def ledger_accounts(ledger: dict) -> tuple[list[dict], dict | None, list[str]]:
    checkpoints = ledger.get("checkpoints", [])
    latest = max(checkpoints, key=lambda item: (item.get("at", ""), item.get("id", "")), default=None)
    latest_id = latest.get("id") if latest else None
    checkpoint_days = {cp["id"]: cp.get("day_key") for cp in checkpoints}
    by_id: dict[str, dict] = {}
    notes = []
    for player in ledger.get("players", []):
        try:
            user_id = stable_id(player.get("roblox_id"))
        except ValueError:
            notes.append(f"Skipped unresolved leaderboard identity: {player.get('name', 'unknown')}")
            continue
        username = str(player.get("roblox_name") or player.get("name") or user_id)
        account = by_id.setdefault(user_id, {
            "id": user_id, "username": username, "display_name": username,
            "aliases": [], "ledger": True, "latest_rank": None, "last_seen_day": None,
            "headshot": player.get("headshot") or None, "avatar_thumbnail": None,
        })
        for name in (player.get("name"), player.get("roblox_name")):
            if name and name not in account["aliases"]:
                account["aliases"].append(name)
    last_seen: dict[str, str] = {}
    for row in ledger.get("observations", []):
        key = str(row.get("key", ""))
        if not key.startswith("id:"):
            continue
        try:
            user_id = stable_id(key[3:])
        except ValueError:
            continue
        if user_id not in by_id:
            continue
        account = by_id[user_id]
        alias = row.get("username")
        if alias and alias not in account["aliases"]:
            account["aliases"].append(alias)
        at = row.get("at", "")
        if at >= last_seen.get(user_id, ""):
            last_seen[user_id] = at
            account["last_seen_day"] = row.get("day_key") or checkpoint_days.get(row.get("checkpoint"))
        if row.get("checkpoint") == latest_id:
            rank = row.get("rank")
            if isinstance(rank, int) and not isinstance(rank, bool):
                account["latest_rank"] = rank
    accounts = sorted(by_id.values(), key=lambda a: (a["latest_rank"] is None, a["latest_rank"] or 0, a["username"].casefold(), a["id"]))
    for account in accounts:
        account["aliases"].sort(key=str.casefold)
    checkpoint = {key: latest.get(key) for key in ("id", "at", "day_key")} if latest else None
    return accounts, checkpoint, notes


def resolve_targets(client, accounts: list[dict], names: list[str]) -> tuple[list[str], list[str]]:
    wanted = list(dict.fromkeys(name.strip().lstrip("@") for name in names if name.strip()))
    if not wanted:
        return [], []
    if len(wanted) > 20 or any(not re.fullmatch(r"[A-Za-z0-9_]{3,20}", name) for name in wanted):
        raise ValueError("Targets must be exact Roblox usernames (at most 20 targets)")
    result = client.request("https://users.roblox.com/v1/usernames/users", body={"usernames": wanted, "excludeBannedUsers": False}, group="users")
    notes: list[str] = []
    resolved: list[str] = []
    matched: set[str] = set()
    by_id = {account["id"]: account for account in accounts}
    wanted_folded = {name.casefold() for name in wanted}
    if not result.ok or not isinstance(result.payload, dict) or not isinstance(result.payload.get("data"), list):
        return [], [f"Exact target lookup unavailable: {result.error or 'unexpected response schema'}"]
    for player in result.payload["data"]:
        if not isinstance(player, dict):
            continue
        requested = str(player.get("requestedUsername", ""))
        if requested.casefold() not in wanted_folded:
            continue
        try:
            user_id = stable_id(player.get("id"))
        except ValueError:
            continue
        username = player.get("name")
        if not isinstance(username, str) or not username:
            continue
        matched.add(requested.casefold())
        if user_id not in resolved:
            resolved.append(user_id)
        if user_id in by_id:
            account = by_id[user_id]
            for alias in (account["username"], requested, username):
                if alias not in account["aliases"]:
                    account["aliases"].append(alias)
            account["aliases"].sort(key=str.casefold)
            account["username"] = username
            account["display_name"] = player.get("displayName") or username
        else:
            account = {
                "id": user_id, "username": username,
                "display_name": player.get("displayName") or username,
                "aliases": sorted(set([requested, username]), key=str.casefold),
                "ledger": False, "latest_rank": None, "last_seen_day": None,
                "headshot": None, "avatar_thumbnail": None,
            }
            accounts.append(account)
            by_id[user_id] = account
        account["target"] = True
        account["identity_fetched_at"] = result.fetched_at
        account["identity_source_url"] = result.url
    for name in wanted:
        if name.casefold() not in matched:
            notes.append(f"Exact target username not resolved: {name}; no fuzzy match substituted")
    return resolved, notes


def social_url(user_id: str, relation: str, cursor: str | None = None) -> str:
    params: dict[str, Any] = {"limit": 50}
    if relation == "friends":
        params.update(userSort=2, findFriendsType=0)
    else:
        params["sortOrder"] = "Asc"
    if cursor:
        params["cursor"] = cursor
    return f"https://friends.roblox.com/v1/users/{stable_id(user_id)}/{SOCIAL_PATHS[relation]}?" + urllib.parse.urlencode(params)


def social_page(payload: Any, relation: str) -> tuple[list[dict], str | None, bool]:
    if not isinstance(payload, dict):
        raise ValueError("Social response is not an object")
    if relation == "friends":
        if "PageItems" in payload:
            item_key, cursor_key, more_key = "PageItems", "NextCursor", "HasMore"
        else:
            item_key, cursor_key, more_key = "pageItems", "nextCursor", "hasMore"
        if item_key not in payload or cursor_key not in payload or not isinstance(payload.get(more_key), bool):
            raise ValueError("Friends response lacks required paging fields")
        items, cursor, more = payload[item_key], payload[cursor_key], payload[more_key]
    else:
        if "data" not in payload or "nextPageCursor" not in payload:
            raise ValueError("Social response lacks required paging fields")
        items, cursor = payload["data"], payload["nextPageCursor"]
        more = bool(cursor)
    if not isinstance(items, list) or (cursor is not None and not isinstance(cursor, str)):
        raise ValueError("Invalid social list or cursor type")
    if bool(cursor) != more:
        raise ValueError("Inconsistent social pagination metadata")
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Invalid social list item")
        stable_id(item.get("id"))
    return items, cursor or None, more


def collect_social(client, user_id: str, relation: str, known: dict[str, dict], max_pages: int) -> dict:
    source = social_url(user_id, relation)
    result: dict[str, Any] = {"status": "unavailable", "items": [], "fetched_at": None, "checked_at": None, "source_url": source, "attempted": False, "pages_fetched": 0}
    items: dict[str, dict] = {}
    cursors: set[str] = set()
    cursor = None
    for page in range(max_pages):
        response = client.request(social_url(user_id, relation, cursor), group=relation)
        result["attempted"] = result["attempted"] or response.attempted
        if response.attempted:
            result.update(checked_at=response.fetched_at, http_status=response.status)
        if not response.ok:
            result["error"] = response.error or f"HTTP {response.status}"
            if response.attempted:
                result["failed_at"] = response.fetched_at
            result["status"] = "partial" if result["pages_fetched"] else "unavailable"
            break
        try:
            page_items, next_cursor, more = social_page(response.payload, relation)
        except ValueError as exc:
            result["error"] = f"Response schema unavailable: {exc}"
            result["failed_at"] = response.fetched_at
            result["status"] = "partial" if result["pages_fetched"] else "unavailable"
            break
        result["pages_fetched"] += 1
        result["fetched_at"] = response.fetched_at
        for item in page_items:
            item_id = stable_id(item["id"])
            account = known.get(item_id, {})
            username = item.get("name") or account.get("username") or ""
            items[item_id] = {"id": item_id, "username": username, "display_name": item.get("displayName") or account.get("display_name") or username,
                              "observed_at": response.fetched_at, "source_url": response.url}
        if not more:
            result.update(status="complete", total_count=len(items))
            break
        result["status"] = "partial"
        if next_cursor in cursors:
            result["error"] = "Repeated pagination cursor; remaining connections were not scanned"
            break
        cursors.add(next_cursor)
        cursor = next_cursor
        if page + 1 == max_pages:
            result["error"] = f"Page cap reached ({max_pages}); remaining connections were not scanned"
    result["items"] = sorted(items.values(), key=lambda item: int(item["id"]))
    return result


def collect_social_capabilities(client, accounts: list[dict], probes: list[str], max_pages: int) -> dict:
    known = {account["id"]: account for account in accounts}
    capabilities = {}
    for relation in SOCIAL_PATHS:
        checked = []
        for user_id in probes:
            record = collect_social(client, user_id, relation, known, max_pages)
            known[user_id][relation] = record
            checked.append(record)
            log(f"Social probe {relation}: {known[user_id]['username']} → {record['status']} (HTTP {record.get('http_status')})")
        denied = bool(checked) and all(item["status"] == "unavailable" and item.get("http_status") in (401, 403) for item in checked)
        available = any(item["status"] in ("complete", "partial") for item in checked)
        reason = (
            f"All {len(checked)} unauthenticated sample requests were denied (HTTP "
            + "/".join(map(str, sorted({item['http_status'] for item in checked})))
            + "); remaining accounts were not requested. This does not establish their individual privacy settings."
            if denied else "At least one public list was readable; individual coverage and page caps apply." if available
            else "Availability was not established by the initial sample; individual results follow."
        )
        capabilities[relation] = {
            "status": "unavailable" if denied else "available" if available else "unknown",
            "reason": reason, "checked_at": max((item["checked_at"] for item in checked if item["checked_at"]), default=None),
            "source_url": social_url(probes[0], relation) if probes else None, "checked_ids": probes[:],
        }
        for account in accounts:
            if relation in account:
                continue
            if denied:
                account[relation] = {
                    "status": "unavailable", "items": [], "fetched_at": None, "checked_at": None,
                    "source_url": social_url(account["id"], relation), "attempted": False,
                    "error": "Not requested after capability probes: " + reason,
                }
            else:
                account[relation] = collect_social(client, account["id"], relation, known, max_pages)
    return capabilities


def normalize_avatar(payload: Any) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("assets"), list):
        raise ValueError("Avatar response lacks an asset list")
    if not isinstance(payload.get("bodyColors"), dict) or not isinstance(payload.get("scales"), dict):
        raise ValueError("Avatar response lacks colors or scales")
    rig = payload.get("playerAvatarType")
    if rig not in ("R6", "R15"):
        raise ValueError("Avatar response has an unknown rig type")
    assets = {}
    for asset in payload["assets"]:
        if not isinstance(asset, dict) or not isinstance(asset.get("assetType"), dict):
            raise ValueError("Avatar contains a malformed equipped asset")
        asset_id = stable_id(asset.get("id"))
        type_id = int(stable_id(asset["assetType"].get("id")))
        item = {"id": asset_id, "name": str(asset.get("name") or ""), "type_id": type_id, "type_name": str(asset["assetType"].get("name") or "")}
        if asset.get("currentVersionId") is not None:
            item["current_version_id"] = stable_id(asset["currentVersionId"])
        if isinstance(asset.get("meta"), dict):
            item["meta"] = asset["meta"]
        assets[asset_id] = item
    return {
        "assets": sorted(assets.values(), key=lambda item: int(item["id"])),
        "body_colors": payload["bodyColors"], "scales": payload["scales"], "rig_type": rig,
    }


def collect_avatars(client, accounts: list[dict]) -> None:
    successful = 0
    for index, account in enumerate(accounts, 1):
        source = f"https://avatar.roblox.com/v1/users/{account['id']}/avatar"
        response = client.request(source, group="avatar")
        avatar = {
            "status": "unavailable", "assets": [], "body_colors": {}, "scales": {}, "rig_type": "",
            "fetched_at": response.fetched_at, "source_url": source, "http_status": response.status, "attempted": response.attempted,
        }
        if response.ok:
            try:
                avatar.update(normalize_avatar(response.payload), status="ok")
                successful += 1
            except ValueError as exc:
                avatar["error"] = f"Response schema unavailable: {exc}"
        else:
            avatar["error"] = response.error or f"HTTP {response.status}"
        account["avatar"] = avatar
        if index == 1 or index % 5 == 0 or index == len(accounts):
            log(f"Avatars {index}/{len(accounts)} checked; {successful} readable")


def collect_thumbnails(client, accounts: list[dict]) -> None:
    by_id = {account["id"]: account for account in accounts}
    for start in range(0, len(accounts), 50):
        batch = accounts[start:start + 50]
        source = "https://thumbnails.roblox.com/v1/users/avatar?" + urllib.parse.urlencode({
            "userIds": ",".join(account["id"] for account in batch),
            "size": "420x420", "format": "Png", "isCircular": "false",
        })
        response = client.request(source, group="thumbnails")
        for account in batch:
            account["thumbnail"] = {"status": "unavailable", "fetched_at": response.fetched_at, "source_url": source, "http_status": response.status}
            if not response.ok:
                account["thumbnail"]["error"] = response.error or "Thumbnail request failed"
        if not response.ok or not isinstance(response.payload, dict) or not isinstance(response.payload.get("data"), list):
            continue
        batch_ids = {account["id"] for account in batch}
        for item in response.payload["data"]:
            if not isinstance(item, dict):
                continue
            try:
                user_id = stable_id(item.get("targetId"))
            except ValueError:
                continue
            if user_id not in batch_ids:
                continue
            account = by_id[user_id]
            image_url = item.get("imageUrl")
            host = urllib.parse.urlparse(image_url).hostname if isinstance(image_url, str) else None
            permitted = bool(host and (host == "rbxcdn.com" or host.endswith(".rbxcdn.com")))
            if item.get("state") == "Completed" and isinstance(image_url, str) and image_url.startswith("https://") and permitted:
                account["avatar_thumbnail"] = image_url
                account["thumbnail"]["status"] = "ok"
            else:
                account["thumbnail"]["error"] = f"Thumbnail state: {item.get('state', 'unknown')}"
        log(f"Full-avatar thumbnail batch {start // 50 + 1} checked")


def write_snapshot(path: Path, snapshot: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, prefix=".network-data-", suffix=".tmp", delete=False) as handle:
        temporary = Path(handle.name)
        try:
            json.dump(snapshot, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger", type=Path, default=ROOT / "site/data.json")
    parser.add_argument("--output", type=Path, default=ROOT / "site/network-data.json")
    parser.add_argument("--target", action="append", default=[], metavar="USERNAME", help="Additional exact Roblox username; repeat for multiple targets")
    parser.add_argument("--social-probe", action="append", default=[], metavar="ID", help="Known account ID for initial availability probes; at most four")
    parser.add_argument("--max-social-pages", type=int, default=2, help="Per-account, per-relation page cap; capped lists remain partial")
    parser.add_argument("--avatar-per-minute", type=float, default=30.0)
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--request-attempts", type=int, default=3)
    parser.add_argument("--max-retry-wait", type=float, default=90.0)
    args = parser.parse_args(argv)
    if not 1 <= args.max_social_pages <= 10 or not 1 <= args.request_attempts <= 5:
        parser.error("Use 1–10 social pages and 1–5 request attempts")
    if not 0 < args.avatar_per_minute <= 30 or not 0 < args.timeout <= 30 or not 0 <= args.max_retry_wait <= 300:
        parser.error("Use an avatar rate ≤30/min, timeout ≤30s, and retry wait budget ≤300s")
    if len(args.social_probe) > 4:
        parser.error("At most four initial social probe IDs are allowed")
    try:
        ledger = json.loads(args.ledger.read_text(encoding="utf-8"))
        accounts, checkpoint, notes = ledger_accounts(ledger)
        if not accounts:
            parser.error("No exact leaderboard Roblox IDs were found")
        client = ApiClient(timeout=args.timeout, attempts=args.request_attempts,
                           max_retry_wait=args.max_retry_wait, avatar_per_minute=args.avatar_per_minute)
        target_ids, target_notes = resolve_targets(client, accounts, args.target)
        if target_notes:
            raise ValueError("; ".join(target_notes))
        notes.extend(target_notes)
        known_ids = {account["id"] for account in accounts}
        if args.social_probe:
            probes = list(dict.fromkeys(stable_id(value) for value in args.social_probe))
            if any(user_id not in known_ids for user_id in probes):
                parser.error("Social probes must refer to resolved accounts in this snapshot")
        else:
            probes = [account["id"] for account in accounts[:3]]
            extra = next((user_id for user_id in target_ids if user_id not in probes), None)
            if not extra:
                extra = next((account["id"] for account in accounts if account["id"] not in probes), None)
            if extra:
                probes.append(extra)
        started_at = utc_now()
        log(f"Scanning {len(accounts)} exact accounts ({sum(a['ledger'] for a in accounts)} leaderboard); avatar pace ≤{args.avatar_per_minute:g}/minute")
        capabilities = collect_social_capabilities(client, accounts, probes, args.max_social_pages)
        collect_avatars(client, accounts)
        collect_thumbnails(client, accounts)
        notes.extend([
            "Only unauthenticated official Roblox API responses are included; no cookies or private-data fallback were used.",
            "Social list failures and unattempted accounts remain unavailable, not zero connections. Check per-account coverage before interpreting absence.",
            "Avatars describe current equipped items at each fetched_at time, not historical leaderboard capture times.",
            "Shared avatar items, public social links, and profile links do not establish common account ownership or misconduct.",
            "Avatar v1 is an official legacy endpoint; schema and access may change. Refreshes keep failures explicit.",
        ])
        snapshot = {
            "schema_version": 1, "generated_at": utc_now(), "scan_started_at": started_at,
            "ledger_latest_checkpoint": checkpoint, "accounts": accounts,
            "capabilities": capabilities, "notes": notes,
        }
        write_snapshot(args.output, snapshot)
        log(f"Saved {args.output}: {len(accounts)} accounts, {sum(a['avatar']['status'] == 'ok' for a in accounts)} readable avatars")
        return 0
    except (ValueError, OSError) as exc:
        parser.exit(1, f"Scan failed without replacing the snapshot: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())

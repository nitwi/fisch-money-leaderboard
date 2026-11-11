"""Reconcile photos from one screenshot session into a single timeline point.

All original captures and per-rank observation IDs remain in the archive.
Overlapping, changed leaderboard values prohibit a merge, even within 12 hours.
"""

from collections import Counter, defaultdict
from datetime import datetime


def instant(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def can_join(group, next_capture, by_capture, max_hours=12):
    first = group[0]
    elapsed = (instant(next_capture["at"]) - instant(first["at"])).total_seconds() / 3600
    if elapsed < 0 or elapsed > max_hours:
        return False
    sources = [row for cp in group for row in by_capture[cp["id"]] if row["status"] == "verified"]
    incoming = [row for row in by_capture[next_capture["id"]] if row["status"] == "verified"]
    ranked = {row["rank"]: row for row in sources}
    keyed = {row["key"]: row["rank"] for row in sources}
    shared = 0
    for row in incoming:
        old = ranked.get(row["rank"])
        if old:
            shared += 1
            if old["key"] != row["key"] or old["balance"] != row["balance"]:
                return False
        if row["key"] in keyed and keyed[row["key"]] != row["rank"]:
            return False
    # Two complete boards are separate timeline captures unless they are the
    # exact same board rephotographed within 30 minutes. Disjoint partial bands
    # have no consistency evidence and must also be close in time.
    if all(cp["complete"] for cp in group + [next_capture]):
        return shared > 0 and elapsed <= .5
    if shared == 0:
        return elapsed <= .5
    return True


def group_sessions(raw_captures, raw_observations, max_hours=12):
    by_capture = defaultdict(list)
    for row in raw_observations:
        by_capture[row["checkpoint"]].append(row)
    captures = sorted(raw_captures, key=lambda cp: cp["at"])
    groups = []
    for cp in captures:
        if groups and can_join(groups[-1], cp, by_capture, max_hours):
            groups[-1].append(cp)
        else:
            groups.append([cp])

    sessions = []
    observations = []
    for group in groups:
        primary = next((cp for cp in group if cp["complete"]), group[0])
        all_rows = defaultdict(list)
        for cp in group:
            for row in by_capture[cp["id"]]:
                all_rows[row["rank"]].append(row)
        sources = [cp["id"] for cp in group]
        session_evidence = list(dict.fromkeys(eid for cp in group for eid in cp["evidence"]))
        coverage = 0
        verified = 0
        for rank in range(1, 51):
            available = all_rows[rank]
            confirmed = [row for row in available if row["status"] == "verified"]
            photographed = [row for row in available if row["status"] != "not_captured"]
            if photographed:
                coverage += 1
            if confirmed:
                verified += 1
            choices = confirmed or photographed or available
            selected = next((row for row in choices if row["checkpoint"] == primary["id"]), choices[0])
            same = [row for row in confirmed if row["key"] == selected["key"] and row["balance"] == selected["balance"]]
            provenance = [row["checkpoint"] for row in same] if confirmed else [selected["checkpoint"]]
            proof_ids = list(dict.fromkeys(eid for row in same for eid in row["evidence"])) if confirmed else list(dict.fromkeys(eid for row in photographed for eid in row["evidence"]))
            grouped_row = {**selected, "checkpoint": primary["id"], "source_checkpoint": selected["checkpoint"],
                           "source_checkpoints": provenance, "at": next(cp["at"] for cp in group if cp["id"] == selected["checkpoint"]),
                           "evidence": proof_ids}
            observations.append(grouped_row)
        if verified > coverage:
            raise ValueError("A session cannot have more readings than photographed ranks")
        sessions.append({**primary, "source_checkpoints": sources, "captured_from": group[0]["at"],
                         "captured_to": group[-1]["at"], "evidence": session_evidence,
                         "coverage": coverage, "verified": verified, "visible": verified,
                         "extracted": 0, "complete": coverage == 50 and verified == 50})
    if len(observations) != len(sessions) * 50:
        raise ValueError("Each session must retain exactly 50 rank slots")
    stats = Counter(row["status"] for row in observations)
    return sessions, observations, dict(stats)

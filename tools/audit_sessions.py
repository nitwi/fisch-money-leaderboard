"""Inspect screenshot sessions close in time without merging changed observations."""
import csv
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    with (ROOT / path).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


captures = sorted(load("data/source/data/checkpoints.csv"), key=lambda row: row["captured_at_utc"])
observations = load("data/reviewed.csv") + load("data/photo_verified.csv")
by_capture = {}
for row in observations:
    checkpoint, rank = row["observation_id"].rsplit("_R", 1)
    by_capture.setdefault(checkpoint, {})[int(rank)] = (row["username_raw"].casefold(), row["balance_c"])

for first, second in zip(captures, captures[1:]):
    elapsed = (datetime.fromisoformat(second["captured_at_utc"]) - datetime.fromisoformat(first["captured_at_utc"])).total_seconds() / 3600
    if elapsed > 12:
        continue
    left, right = by_capture.get(first["checkpoint_id"], {}), by_capture.get(second["checkpoint_id"], {})
    shared = sorted(set(left) & set(right))
    differences = [(rank, left[rank], right[rank]) for rank in shared if left[rank] != right[rank]]
    right_new = sorted(set(right) - set(left))
    print(first["checkpoint_id"], second["checkpoint_id"], f"{elapsed:.2f}h", f"overlap={len(shared)}", f"differing={len(differences)}", f"new_ranks={right_new}")
    for rank, before, after in differences:
        print(" ", rank, before, "->", after)

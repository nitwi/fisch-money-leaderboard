"""Show daily tick choices, early-AM rollovers, and retained earlier images."""
import json
from pathlib import Path

data = json.loads((Path(__file__).resolve().parents[1] / "site/data.json").read_text(encoding="utf-8"))
for cp in data["checkpoints"]:
    print(cp["day_key"], "<-", cp["id"], "at", cp["at"],
          "earlier", cp["earlier_session_ids"],
          "rolled", cp["early_am_rollover"],
          "coverage", cp["verified"], "/", cp["coverage"],
          "images", len(cp["evidence"]))

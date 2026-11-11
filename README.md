# Fisch Money Leaderboard

Independent, public, screenshot-backed history of the Fisch Top C$ board. The charts show *observed net held-balance changes*, not verified sales, earnings, or misconduct.

Source window: October 10–November 10, 2026 (America/Chicago); later captures may be appended. Each original screenshot remains linked to its captured rank slots.

**Initial preview:** 35 captures and 160 original PNGs, with 320 rank readings independently compared to the originals (three fully reviewed Top-50 captures). The remaining pictured rows are queued for review. Every snapshot displays its own reviewed/covered count; analytics exclude unknown and provisional rows. The baseline spreadsheet's `manually_verified` label alone is not treated as a completed independent review. Future reviews append only to `data/reviewed.csv` and regenerate `site/data.json`.

## Refresh the data

The import source is the supplied evidence package's `data/checkpoints.csv`, `data/evidence_manifest.csv`, `data/observations.csv`, and original `screenshots/` directory. Preserve image bytes and stable IDs. The initial package marks most pictured rows pending; review original PNGs before changing their status to `verified` in `data/reviewed.csv`. Unresolved rows remain unknown. Never infer an absent player from an incomplete or partly reviewed board.

For the first import, run `python tools/build.py --source <package-folder>` to hash-check originals and bundle the source CSVs and PNGs into this independent repository. Thereafter `python tools/build.py` validates the bundled originals and regenerates `site/data.json`. The script refuses invalid ranks, missing proof, duplicate names or mismatched hashes. Run `python -m unittest discover -s tests` for calculations and data rules.

The site is deployed to GitHub Pages from `site/` via `.github/workflows/pages.yml`. No ShockieWockie dashboard or Worker resources are used. The public URL is `https://nitwi.github.io/fisch-money-leaderboard/`.

`python tools/resolve_roblox.py` uses Roblox's exact username resolution and thumbnail API for reviewed names. It keeps stable numeric IDs when a player renames; a name that cannot be matched gets no Roblox profile link. The separate site's data and images are version-controlled; no browser-side uploads or ShockieWockie credentials are needed. Run `python tools/smoke_site.py` locally for a real desktop/mobile browser check (optional Playwright and local Chrome).

## Data interpretation

- All C$ amounts are exact decimal integers. A blank is unknown, never zero.
- Rate = observed balance difference / elapsed UTC hours. Approximate timestamps and skipped checkpoints are labeled.
- Neighbor gaps refer to the actual ranked player ahead/behind at each checkpoint. A gap change compares the two *rank-relative* gaps; changed neighbors are called out.
- A departure can only be asserted across adjacent fully verified Top-50 captures. Otherwise the player is merely not observed.
- The default 8B C$ highlight is a net balance threshold, not an allegation.

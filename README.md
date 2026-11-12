# Fisch Money Leaderboard

Independent, public, screenshot-backed history of the Fisch Top C$ board. The charts show *observed net held-balance changes*, not verified sales, earnings, or misconduct.

Source window: October 10–November 12, 2026 (America/Chicago); later captures may be appended. Each original screenshot remains linked to its captured rank slots.

**Current coverage:** 37 original captures and 168 PNGs form 35 reconciled screenshot sessions and **33 displayed daily points**. I read and checked **1,668 of 1,671 pictured rank slots** directly from the originals, including all **30 complete Top-50 captures**. Three partly pictured historical rows have unreadable/cropped numbers; 179 raw rank slots were not photographed. Matching near-time photos are deduplicated, then the most recent session for each leaderboard day supplies its chart and rank values. Every public measurement is photo-checked; no OCR-only suggestions are published.

## Refresh the data

Source observations are **only original screenshots**. The bundled `data/source/data/checkpoints.csv` and `data/source/data/evidence_manifest.csv` supply capture timing and original PNG indexes, not names or balances. The previous Excel-derived `observations.csv` is intentionally not an input and is not stored here. Preserve screenshot bytes and stable IDs. `data/screenshot_extractions.csv` is only an internal reading aid, never a public chart-data input; `data/reviewed.csv` and `data/photo_verified.csv` contain readings checked directly against the original images. The `data/photo_audits.csv` and `data/photo_corrections.csv` ledgers record exactly which original image/rank ranges were inspected and how OCR ambiguities were resolved.

For future captures, use `python tools/import_capture.py --date YYYY-MM-DD --time HH:MM --image '1-16=/path/top.png' ...` to preview the original PNG hashes, rank spans and Chicago/UTC capture time; repeat with `--apply` only after verifying those details. It copies the unmodified images under `site/evidence/screenshots/<checkpoint_id>/` and appends the two source indexes. `python tools/ocr_draft.py` (RapidOCR), `python tools/ocr_tesseract.py`, and `python tools/extract_screenshots.py` may help organize candidates, **but they never publish numbers**. Read each original screenshot, record the image/rank spans personally checked in `data/photo_audits.csv` and direct transcriptions/corrections in `data/photo_corrections.csv`, then run `python tools/promote_photo_review.py`. Resolve exact Roblox identities with `python tools/resolve_roblox.py`; `python tools/build.py` validates image hashes and emits only photo-confirmed observations to `site/data.json`. Run `python -m unittest discover -s tests` and `python tools/smoke_site.py` before publication.

The site is deployed to GitHub Pages from `site/` via `.github/workflows/pages.yml`. No ShockieWockie dashboard or Worker resources are used. The public URL is `https://nitwi.github.io/fisch-money-leaderboard/`.

## Capture sessions

- Original captures are immutable. `site/data.json` retains all 37 raw `captures`/`capture_observations`, 35 reconciled `sessions`/`session_observations`, and the daily `checkpoints`/`observations` used for the 33 displayed points. Per-rank source capture IDs, exact timestamps, original PNG IDs and SHA-256 hashes remain available.
- Within **12 hours**, a partial and a full capture may form one snapshot only when *every overlapping photo-checked rank has the same player and exact balance*, and no player appears at two ranks. Disjoint partial bands or two complete rephotos must be within **30 minutes**. A session uses the full capture's timestamp as its chart anchor; row deltas/hourly rates use the actual source photo times.
- Nov 4 at **1:42–1:52 AM** and **9:00–9:01 PM** each combine into one point, retaining all six original images for each session. Oct 17 at 10:14 AM and 10:14 PM stays as two points: 12 hours elapsed and two overlapping amounts differ. Oct 14 and Nov 9's distant intraday captures also remain distinct.
- This reconciliation is automatic for future uploads under the same rules, without editing or moving original image files. No combined snapshot can mix contradictory photo-checked values.

## Leaderboard days

- Chart ticks represent **calendar days in America/Chicago** (including missing days without an invented reading); arrows and scrubber step through days that actually have a selected photo. For each leaderboard day, the **latest** screenshot session is the daily balance/rank source. Earlier distinct captures from that day remain accessible in its proof gallery with an explicit “earlier context, not used for daily balance” label.
- A photo taken from **12:00 AM up to but not including 2:00 AM** is attributed to the previous day if that previous day had **no afternoon/evening capture (12 PM or later)**. If the previous day has an afternoon capture, the early photo belongs to its actual date. The Nov 4 1:42 AM session therefore represents Nov 3; Nov 8 1:16 AM represents Nov 7 (superseding Nov 7's 10:46 AM image); Nov 9 12:52 AM represents Nov 8, and Nov 9 9:22 PM represents Nov 9. The original photo times are never rewritten.
- The Nov 11 10:33 PM owner-timed screenshot and the Nov 12 12:36 AM filename-timed update are **distinct days**: Nov 11 already had an evening capture and multiple money values changed between the two. The exact-photo Roblox ID for `ewoofs` matches the former `kawaiicatsophi67`; their history remains one player line. Both four-image original sets are retained with separate rank and proof records.
- Currency deltas and hourly rates use each selected player's actual photo instants, not the day label or a synthetic 24-hour interval. Empty days remain gaps rather than carried-forward values.

`python tools/resolve_roblox.py` uses Roblox's exact username resolution and thumbnail API for reviewed names. It keeps stable numeric IDs when a player renames; a name that cannot be matched gets no Roblox profile link. The separate site's data and images are version-controlled; no browser-side uploads or ShockieWockie credentials are needed. Run `python tools/smoke_site.py` locally for a real desktop/mobile browser check (optional Playwright and local Chrome).

## Data interpretation

- All C$ amounts are exact decimal integers. A blank is unknown, never zero.
- No-multiplier net rate = observed balance difference / elapsed UTC hours. Approximate timestamps and skipped checkpoints are labeled.
- Rainbow 1.5× base-equivalent = a positive observed net delta ÷ 1.5. Its per-hour rate is shown in static rainbow colors with the unadjusted no-multiplier rate in parentheses. This is a *counterfactual*, not proof of sales or gross earnings; declines and spending are not divided by 1.5.
- Neighbor gaps refer to the actual ranked player ahead/behind at each checkpoint. A gap change compares the two *rank-relative* gaps; changed neighbors are called out.
- A departure can only be asserted across adjacent fully pictured and photo-checked Top-50 captures. Otherwise the player is merely not observed. If an image crops the amount, that rank stays unknown rather than borrowing a value from another day.
- The default 8B C$ highlight is a net balance threshold, not an allegation.

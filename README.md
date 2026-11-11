# Fisch Money Leaderboard

Independent, public, screenshot-backed history of the Fisch Top C$ board. The charts show *observed net held-balance changes*, not verified sales, earnings, or misconduct.

Source window: October 10–November 10, 2026 (America/Chicago); later captures may be appended. Each original screenshot remains linked to its captured rank slots.

**Current coverage:** 35 captures and 160 original PNGs. I read and checked **1,568 of 1,571 pictured rank slots** directly from the original screenshots, including all **28 complete Top-50 captures**. Three partially pictured rows have unreadable/cropped numbers and remain unknown; 179 ranks were not photographed. Every public chart point and numerical interval comes only from a photo-checked row; no OCR-only suggestions are published.

## Refresh the data

Source observations are **only original screenshots**. The bundled `data/source/data/checkpoints.csv` and `data/source/data/evidence_manifest.csv` supply capture timing and original PNG indexes, not names or balances. The previous Excel-derived `observations.csv` is intentionally not an input and is not stored here. Preserve screenshot bytes and stable IDs. `data/screenshot_extractions.csv` is only an internal reading aid, never a public chart-data input; `data/reviewed.csv` and `data/photo_verified.csv` contain readings checked directly against the original images. The `data/photo_audits.csv` and `data/photo_corrections.csv` ledgers record exactly which original image/rank ranges were inspected and how OCR ambiguities were resolved.

For future captures, append the capture timestamp and original PNG hash/rank spans to the two source indexes and place the unchanged images in `site/evidence/screenshots/<checkpoint_id>/`. `python tools/ocr_draft.py` (RapidOCR), `python tools/ocr_tesseract.py`, and `python tools/extract_screenshots.py` may help organize candidate readings, **but they never publish numbers**. Read each original screenshot, record precisely the image/rank spans personally checked in `data/photo_audits.csv` and misreads/missing rows in `data/photo_corrections.csv`, then run `python tools/promote_photo_review.py`. Resolve exact Roblox identities with `python tools/resolve_roblox.py`; `python tools/build.py` validates image hashes and emits only photo-confirmed observations to `site/data.json`. Run `python -m unittest discover -s tests` and `python tools/smoke_site.py` before publication.

The site is deployed to GitHub Pages from `site/` via `.github/workflows/pages.yml`. No ShockieWockie dashboard or Worker resources are used. The public URL is `https://nitwi.github.io/fisch-money-leaderboard/`.

`python tools/resolve_roblox.py` uses Roblox's exact username resolution and thumbnail API for reviewed names. It keeps stable numeric IDs when a player renames; a name that cannot be matched gets no Roblox profile link. The separate site's data and images are version-controlled; no browser-side uploads or ShockieWockie credentials are needed. Run `python tools/smoke_site.py` locally for a real desktop/mobile browser check (optional Playwright and local Chrome).

## Data interpretation

- All C$ amounts are exact decimal integers. A blank is unknown, never zero.
- No-multiplier net rate = observed balance difference / elapsed UTC hours. Approximate timestamps and skipped checkpoints are labeled.
- Rainbow 1.5× base-equivalent = a positive observed net delta ÷ 1.5. Its per-hour rate is shown in static rainbow colors with the unadjusted no-multiplier rate in parentheses. This is a *counterfactual*, not proof of sales or gross earnings; declines and spending are not divided by 1.5.
- Neighbor gaps refer to the actual ranked player ahead/behind at each checkpoint. A gap change compares the two *rank-relative* gaps; changed neighbors are called out.
- A departure can only be asserted across adjacent fully pictured and photo-checked Top-50 captures. Otherwise the player is merely not observed. If an image crops the amount, that rank stays unknown rather than borrowing a value from another day.
- The default 8B C$ highlight is a net balance threshold, not an allegation.

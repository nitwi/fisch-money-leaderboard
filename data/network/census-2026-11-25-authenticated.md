# Roblox Networker checkpoint: authenticated continuation

On 25 November 2026, the Cloud Browser confirmed `countycheck` was signed in and showed usable lists. The canonical journal was appended, not rewritten.

- **Friend-list census:** 12 of 70 planned sources now have saved friend IDs (4 complete, 8 partial). The two new partial lists yielded 126 source-to-friend rows, representing 124 newly recorded undirected friendships. The saved total is 1,074 rows and 1,070 distinct friendships.
- **Leaderboard:** One newly recorded friendship connects [untoldmemoria](https://www.roblox.com/users/128840304/profile) and [Erutobi](https://www.roblox.com/users/2464539843/profile), bringing the website-evidence total to 13 distinct leaderboard-to-leaderboard friendships. This records a link, not when it first formed.
- **Follows:** Nine lists from five source accounts were saved (seven complete, two partial), yielding 45 distinct directed follow links. There were no new leaderboard-to-leaderboard follow links in this batch.
- **Coverage:** 15 of 70 sources have any saved website relationship evidence; 58 still lack saved friend-list evidence. The 1,050 external nodes have no fresh exact-ID avatar review in this census workflow. Earlier public avatar scans and the original ten relationship records are retained.

## Saved batch coverage

| Source | Friends | Followers | Following |
|---|---|---|---|
| [ody_odinho](https://www.roblox.com/users/5118740924/profile) | 39/40, partial | 13/13, complete | 5/7, partial |
| [xNnoel](https://www.roblox.com/users/2586153890/profile) | Not saved | Not saved | 0/0, complete |
| [Ceruleanflare2](https://www.roblox.com/users/4785293082/profile) | Not saved | 0/0, complete | 1/1, complete |
| [untoldmemoria](https://www.roblox.com/users/128840304/profile) | 87/134, partial | 18/52, partial | 2/2, complete |
| [shatter_yourselfgrgr](https://www.roblox.com/users/8794906806/profile) | Not saved | 0/0, complete | 6/6, complete |
| [Force_oNature](https://www.roblox.com/users/1295019815/profile) | Navigation blocked | Not inspected | Not inspected |

The table gives **readable unique IDs / displayed count** where supported. A nonzero profile count with a zero/loading list shell was not accepted as an empty list. An unavailable identity card was not counted. The observer stopped at a Cloud Browser URL-policy denial while opening the `Force_oNature` list; no account ban, bot denial, or Roblox rate limit was confirmed. Resume the remaining friend lists from `xNnoel`, `Ceruleanflare2`, `shatter_yourselfgrgr`, and `Force_oNature`, and continue from the [census plan](census-plan.json) if normal access is restored.

## Screenshot-assisted continuation

The browser later allowed screenshots and direct reading of the existing xNnoel Friends tab. Screenshots confirmed the rendered cards; the exact IDs came from the corresponding public profile links, not from text guesses. xNnoel: 375/392 unique IDs after visiting all 21 exposed pages (partial). Ceruleanflare2: 15/15 (complete). Together they added 390 previously unrecorded friendships, including xNnoel ↔ Nnoelq, and no follow rows. Friend-list coverage is now **14 of 70** (5 complete, 9 partial). The older shatter_yourselfgrgr Friends URL again rendered an empty shell despite a nonzero profile count and was not recorded as empty. Continue there and at Force_oNature when normal list access allows.

## Roblox People search continuation

Using Roblox's own search bar, selecting People, and clicking the exact account result reached the canonical HTTPS Friends pages for both previously stalled profiles. Verify the target's exact ID and visible username before opening Friends, then wait for the expected list count and cards rather than accepting the initial zero. Use verified leaderboard profile links only as a fallback.

- shatter_yourselfgrgr: 51/53 exact IDs across three exposed pages (partial).
- Force_oNature: 25/26 exact IDs across two exposed pages (partial).

The batch added 76 previously unrecorded friendships, including leaderboard connections shatter_yourselfgrgr ↔ 0egoistic and shatter_yourselfgrgr ↔ Canizan. Friend-list coverage is now **16 of 70** (5 complete, 11 partial), with no new follow or avatar rows.

## Ranked continuation

The same People search and HTTPS verification reached three additional ranked profiles: sebax4514 (69/69, complete), TheDanishPlays (89/381, partial; first five pages), and Sylilia (53/55, partial across all exposed pages). This batch added 211 distinct friendships, including sebax4514 ↔ Renvuz and sebax4514 ↔ LasTnIghT2011. Friend-list coverage is now **19 of 70** (6 complete, 13 partial). No new follow or avatar rows were recorded. The next uninspected ranked source is metbepol.

## Friends-first census continuation

People search did not return an exact metbepol result. The saved numeric Roblox profile link redirected to a Roblox 404 page. This is an attempted but unavailable source, not a verified empty list or proof the account was terminated.

Three Friends lists advanced: YptSehjZiEs (71/103, partial, first four pages), Myvexxx (21/22, partial at the end of the list), and Erutobi (62/168, partial, first four pages). They added 151 previously unrecorded friendships. Coverage is now **22 of 70 lists with saved evidence** (6 complete, 16 partial), plus the one unavailable attempt. The next uninspected ranked source is Luwuma. Review partials and unavailable cards after the first pass. Treat an ID-less or unavailable card as unknown unless Roblox explicitly identifies the account status.

The next batch reached Aumjung8267 (108/468 IDs, first six pages) and SelenaTatsukii (70/134 IDs, first four pages). It added 178 newly recorded friendships, including Aumjung8267 ↔ LasTnIghT2011. Luwuma's exact account did not appear in People search and the verified profile link returned a Roblox 404. Do not infer termination or save an empty list. Coverage is **24 of 70 with saved Friends lists** (6 complete, 18 partial) and two more with an unavailable first-pass attempt. Next uninspected ranked source: emitnick. Both exports contain the canonical website journal SHA-256, and SQLite passed integrity and foreign-key checks.

### Next scheduled Friends batch

emitnick (45/55, all four exposed pages) and Canizan (88/140, first five pages) remain partial; 0egoistic (10/10) is complete. This batch added 139 distinct friendships, including four new leaderboard links through Canizan. Coverage is **27 of 70 with saved Friends lists** (7 complete, 20 partial), with two additional unavailable attempts. Next uninspected ranked source: LasTnIghT2011. Both exports match the journal digest and SQLite passed its integrity and foreign-key checks.

### Friends batch: LasTnIghT2011 and johncenagaming347v2

LasTnIghT2011: 65/471 across the first four pages. johncenagaming347v2: 18 exact IDs on page one. People search returned no result, but the verified profile showed the correct handle and 135 Friends; the linked Friends page showed a conflicting 0 and real cards. Saved those exact IDs with the total unknown. This batch adds 80 distinct friendships, including LasTnIghT2011 ↔ Renvuz and LasTnIghT2011 ↔ zerealali. Coverage: **29 of 70 with saved Friends lists** (7 complete, 22 partial) plus two documented 404 attempts flagged for possible termination review, not confirmed. Next uninspected ranked source: injurylowk.

### Friends batch: injurylowk, Renvuz and anyokc

- injurylowk: 16/22 exact IDs on page one; no later page verified.
- Renvuz: 35/317 exact IDs across the first two pages; further pages remain.
- anyokc: 23/24 exact IDs across both exposed pages; the final missing ID stays unknown.

Roblox briefly rendered zero-count shells; a normal reload recovered readable data. The batch added 71 distinct friendships, including Renvuz ↔ zerealali. First-pass progress: **34 of 70 attempted** (7 complete, 25 partial, 2 unavailable Roblox 404s flagged for possible termination review). No new follow or avatar rows. Next ranked source: sabbath553. The 49 focused Python and 92 Node tests passed.

### Scheduled Friends batch: sabbath553

sabbath553: 18/46 exact IDs on page one (partial); later pages were not verified. This adds 18 distinct friendships and no leaderboard, follow, or avatar rows. First pass: **35 of 70 attempted** (7 complete, 26 partial, two documented profile 404s). The Cloud Browser returned an internal Chrome error during navigation for the next source, heanmichrkke_3; it was not counted as a Roblox profile 404 or a completed attempt. Resume from heanmichrkke_3 through normal HTTPS People search when the browser is available. Both exports match the journal SHA-256; SQLite integrity/foreign key checks, 49 Python tests, and 92 Node tests passed.

### Manual retry: heanmichrkke_3

Normal HTTPS People search and an exact result click opened the expected profile. The linked list initially showed zero; a normal reload restored the displayed count of 76 and 33 exact IDs across pages one and two. The next-page control remained enabled but did not advance again, so the list is partial. Added 33 distinct friendships, no new leaderboard cross-links. First pass: **36 of 70 attempted** (7 complete, 27 partial, two documented profile 404s). Next source: hc2khunowpng43ntk1. The journal prefix and both export digests were verified; SQLite integrity and foreign-key checks, 49 Python tests, and 92 Node tests passed.

### Friends continuation: hc2khunowpng43ntk1

Verified 35 distinct IDs across all three exposed pages against the displayed count of 40, so the list remains partial. All 35 friendships are new; no new leaderboard cross-links. First pass: **37 of 70 attempted** (7 complete, 28 partial, 2 documented profile 404s). The exact Zipidy24 profile displayed 268 Friends, but the linked Friends page showed an empty zero-count shell even after a normal reload. It was not counted as a reliable first pass or as zero Friends; retry Zipidy24 next. Both export digests and SQLite integrity and foreign-key checks passed, along with 50 Python and 92 Node tests.

### Scheduled retry: Zipidy24

People search hit a Chrome internal navigation error, but the saved HTTPS profile URL loaded and its linked Friends page displayed 268. Verified 18 exact IDs on the first page; the enabled next-page control did not advance, so the list is partial. First pass: **38 of 70 attempted** (7 complete, 29 partial, two documented profile 404s). The next source, minmin8280, was not counted because the Cloud Browser failed before People search. Both exports match the journal digest. SQLite integrity and foreign-key checks, 50 Python tests, and 92 Node tests passed.

### Friends continuation: minmin8280 and jonnhy1835

minmin8280 (15/15) is complete. jonnhy1835 (21/22 across both exposed pages) remains partial. First pass: **40 of 70 attempted** (8 complete, 30 partial, two documented profile 404s). Next source: Nnoelq. The exports match the journal digest, and SQLite integrity and foreign-key checks, 50 Python tests, and 92 Node tests passed.

### Friends continuation: Nnoelq

Nnoelq (69/69 across all four exposed pages) is complete. 10ne17's exact profile showed 178 Friends, but the linked Friends list rendered an empty zero-count shell after one normal reload; it is not counted as empty or as a verified first pass. First pass: **41 of 70 attempted** (9 complete, 30 partial, two documented profile 404s). Leave 10ne17 pending for a later normal-browser retry if needed and continue through the rest of the queue. The two exports match the website journal digest, and SQLite integrity and foreign-key checks, 50 Python tests, and 92 Node tests passed.

### Friends continuation: Hxtaroo and ewoofs

Hxtaroo: 16/16 (complete). ewoofs: 16/19 exact IDs (partial); the pagination ended at page two but no exact linked IDs were readable on that page. First pass: **43 of 70 attempted** (10 complete, 31 partial, two documented profile 404s). Keep 10ne17 pending for a retry; continue from Tbpoqqq. Journal hashes, SQLite checks, 50 Python and 92 Node tests passed.

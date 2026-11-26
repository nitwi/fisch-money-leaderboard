# November 26 roster refresh, checkpoint 1

Review only. Production remains at the completed previous census (PR #5).
The source is the 50 photographed ranks in
`data/intake/2026-11-26_0010_top50.csv` at 06:10 UTC. No leaderboard
balances, ranks in the ledger, or photos are edited by this change.

48 names matched exact IDs in the retained 70-ID plan. Rank 50 Yippz_gg
was resolved by Roblox People search and a click into
[the exact profile](https://www.roblox.com/users/1115956720/profile).
Rank 3 Holladayyyyyyy is identity-pending and lower priority; the source
row is retained. The plan now carries 71 verified IDs and one pending
roster row. Past ranks and observations remain in ledger history.

## New evidence

| List | Exact readable IDs | Status |
| --- | ---: | --- |
| Friends | 18 of 123 | Partial; first page verified, next click did not advance |
| Followers | 18 | Partial; first page verified, site showed abbreviated total |
| Following | 36 of 76 | Partial; first rows checked on both pages |

Three UTC-stamped journal rows add 16 distinct friendships and 53 distinct
directed follows relative to the prior journal. Leaderboard connections
include friendships with Renvuz and LasTnIghT2011 and following Renvuz.
No avatar observation was added. Yippz_gg's avatar status is unknown; the
4,179 external graph nodes are not an avatar scan count.

## Coverage on the 49 resolved current ranks

| List | Journal evidence at or after capture | Older evidence | No journal row |
| --- | ---: | ---: | ---: |
| Friends | 2 | 43 | 4 |
| Followers | 22 | 22 | 5 |
| Following | 22 | 22 | 5 |

These columns date source-list journal evidence, not coverage completeness.
No journal row can include a documented unavailable or deferred outcome;
it is not an empty list. Prior complete observations are kept without
unnecessary repetition. Next, prioritize reachable stale partials and
new gaps, retain 0egoistic's existing deferral, and use only normal HTTPS
Roblox search, clicked results, and list controls. Record partial or
unavailable outcomes where list pagination or access does not permit more.

## Validation

All 202 historical rows are unchanged; 205 total. JSON and SQLite record
the same journal SHA-256:
`de8a3f2ce9f6b6cc6aebb0792b3347f84d4f4152e926e1c7d13e804a199302fc`.
SQLite integrity and foreign-key checks passed; 50 Python and 78 Node
tests passed. The avatar regression fixture distinguishes roster changes
from scan changes. No new live viewport or deployment verification applies
to this draft.

## Checkpoint 2: n6sy (137607436), 13:31–13:32 UTC

Verified the exact People search result, opened native lists, and verified
each page from scroll position zero before collecting IDs. Friends: 73/84
exact IDs across all five pages. Following: 24/39 exact IDs across all
three pages. Both remain partial despite reaching the last page; some
cards did not expose an exact profile link. Followers: 54 exact IDs on
the first three pages, partial; the profile showed 699 and the list
header showed 500+. The current sample does not replace older evidence.

Appended three rows: 28 new directed follows, no new unique friendships
or leaderboard links. Cumulative refresh: 16 new friendships and
81 new follows. No new avatars; 4,204 external graph nodes. Current
roster source-list journal counts at or after capture: Friends 3,
Followers 23, Following 23. Next: reachable stale partials including
ismyaimbotworking and ody_odinho; continue bounded checks.

All 205 previously staged journal rows are unchanged, 208 total, with
SHA-256 `37d42171fb477e2061ecb93d4898351a7cee973808f90467a842d45f613bfed6`
verified in both exports. SQLite integrity and foreign-key checks and all
128 regression tests passed. No production changes.

## Checkpoint 3: Apathy / ismyaimbotworking (1316700350), 13:49–13:51 UTC

Exact People result verified before opening native lists. All accepted
pages were checked from scroll position zero. Friends: 31/336 exact IDs
across two pages (pagination stayed on page two after clicking Next).
Roblox's page returned HTTP 200 with no observed failed request; the
stall is not evidence of rate limiting or denial. Followers: 36/314 exact
IDs from two pages, partial. Following: 1/1, complete (leviathan2709).
Earlier relationship evidence is unchanged. Next: ody_odinho and other
reachable stale partials.

Three new observation rows, 18 distinct directed follows, and no new
unique friendships. Cumulative refresh: 16 new friendships and 99 new
directed follows. No new avatar observations; 4,219 external graph nodes.
The 211-row journal preserves the prior 208 rows byte-for-byte. JSON and
SQLite journal SHA-256:
`65e1055fa206f9715785c5251a0f70c04ce2d93040436c02cb84b509affb0df7`.
SQLite integrity and foreign-key checks and all 128 tests passed.
Production remains unchanged.

## Checkpoint 4: ody_odinho (5118740924), 14:03–14:06 UTC

Verified the exact People result and the first row of each list from
scroll position zero. Friends: 17/40 exact IDs on page one (Next did not
advance; HTTP 200 and no failed request were observed). Followers: 13/13,
complete. Following: 5/7, partial, despite reaching the end. All exact
IDs were already in the journal; newer observations did not replace
older coverage. The roster now has dated journal evidence at or after
capture for 5 Friends, 25 Followers, and 25 Following lists. Next
priority: xNnoel, then untoldmemoria and other reachable stale partials.

The 214-row journal is append-only; the two exports match its SHA-256
`117d66b118f00db866671745c77af22000572d67ad19dc0383f676cb9fc3c19f`.
SQLite integrity and foreign-key checks and all 128 tests passed.
Cumulative unique additions remain 16 friendships and 99 follows.
No new avatar records or production changes.

## Checkpoint 5: xNnoel (2586153890), 14:20–14:23 UTC

Confirmed the exact People result and read each first page from its top.
Friends: 18/393 exact profile links, partial. Followers: 18 exact links,
partial; profile showed 1.9K and the list header showed 500+. Both
Next controls stayed on page one; diagnostics reported HTTP 200 with no
observed failed requests, not a confirmed block. Following: explicitly
0 with “No results found” and a matching profile count, complete.

Three append-only observations, one new distinct friendship, no new
follows or avatar observations. Cumulative refresh: 17 new friendships
and 99 new directed follows; 4,220 external graph nodes. Post-capture
journal coverage for 6 Friends, 26 Followers, and 26 Following lists.
Next: untoldmemoria and other reachable stale partials.

Both exports match the 217-row journal SHA-256
`795107174d2e7fc942b80196f5ef04bc0c44d8a53e62e7bc8f731fdab83343f4`.
SQLite integrity, foreign-key checks, and all 128 tests passed.
No production changes.

## Checkpoint 6: untoldmemoria (128840304), 14:34–14:37 UTC

Confirmed the exact People result and all first rows at scroll position
zero. Friends: 18/134, partial. Followers: 18/51, partial. Next stayed
on page one for both lists; HTTP 200 diagnostics showed no failed
request. Following: 2/2, complete. No newly distinct links or avatar
observations; older deeper coverage remains intact. The 49 resolved
current ranks now have journal evidence dated at or after capture for
7 Friends, 27 Followers, and 27 Following lists. Next reachable stale
partials include shatter_yourselfgrgr and TheDanishPlays.

The 220-row append-only journal and both exports match SHA-256
`59870f7256625b0f694d2e93b0f2973d0261d2294b7f80a54f3cc8eea4fa3a39`.
SQLite integrity and foreign-key checks and all 128 tests passed.
Cumulative additions remain 17 friendships and 99 directed follows.
No production changes.

## Checkpoint 7: shatter_yourselfgrgr (8794906806), 14:49–14:51 UTC

Confirmed the exact People result; checked each list at scroll position
zero. Friends: 18/53, partial; Next did not advance (HTTP 200, no failed
request observed). Followers: explicitly 0/0 with “No results found”
and a matching profile count, complete. Following: 6/6, complete. All
readable relationships already existed in the journal. Post-capture
journal coverage: 8 Friends, 28 Followers, and 28 Following lists in the
resolved current roster. Next: TheDanishPlays, then reachable stale
partials and newly identified roster gaps.

No new avatars or production changes. Cumulative additions remain
17 friendships and 99 directed follows. Both exports match the 223-row
append-only journal SHA-256
`0ccf440f5feec54ddac6dfa601fb122b69dab6d9ef5eb197b97086bf5e933187`.
SQLite integrity and foreign-key checks and all 128 tests passed.

## Checkpoint 8: TheDanishPlays (1579077690), 15:05–15:08 UTC

Verified the exact People result and each list from scroll position zero.
Friends: 17/381 exact links. Followers: 18/19. Next stayed on the first
page for both; diagnostics returned HTTP 200, with no failed request
observed. Following: 4/6 exact links after reaching the end. All three
remain partial; no newly distinct links or avatar observations. Post-capture
journal coverage: 9 Friends, 29 Followers, 29 Following lists. Next:
reachable stale sources such as Sylilia and Canizan, and remaining roster gaps.

Cumulative additions remain 17 friendships and 99 directed follows.
Both exports match the 226-row append-only journal SHA-256
`ad13f4d552cd860fde361bc4bef872ae2d7aba3de4cf8bb21adffb6c2709e503`.
SQLite integrity and foreign-key checks and all 128 tests passed.
No production changes.

## Checkpoint 9: Sylilia and Canizan, 15:20–15:25 UTC

Verified both exact People results and each list from scroll position
zero. Sylilia: Friends 17/55 and Followers 18/31, both partial; the
next page did not advance. Following was explicitly empty (0/0,
complete). Canizan: Friends 17/140, partial because Next did not
advance; Followers 18 exact links (3K on profile, 500+ on the list,
exact total unknown); Following 18/49. Both Canizan directional
samples are partial. Stalled pages reported HTTP 200 with no failed
request observed, not a verified rate limit or denial.

Six append-only rows added one distinct follow and no new friendships
or avatar observations. Cumulative additions: 17 friendships and 100
directed follows; 4,221 external graph nodes. Post-capture journal
coverage: 11 Friends, 31 Followers, and 31 Following lists. Next:
SelenaTatsukii and remaining reachable gaps.

Both exports match the 232-row journal SHA-256
`7c681e9a6608a41070c87d59933062bc00ca9638d038de9db8f27df3890e9f01`.
SQLite integrity and foreign-key checks and all 128 tests passed.
Production is unchanged.

## Checkpoint 10: SelenaTatsukii (362858829), 15:34–15:36 UTC

Verified the exact People result and the first row from scroll position
zero on every inspected page. Friends: 17/134. Followers: 18/134.
Following: 34/145 across the first two pages, with a verified page
and first-row change. All three are partial. This batch adds 16 new
directed follows, zero new friendships, and no avatar observations.

The refresh now adds 17 friendships and 116 directed follows. There
are 4,237 external graph nodes. Post-capture journal coverage:
12 Friends, 32 Followers, and 32 Following lists. Next: continue with
reachable profile gaps; retain earlier evidence and the 0egoistic deferral.

The 235-row journal is append-only. Both exports match SHA-256
`e0841619cab713ba877358e6a6910764620e662cf6e83c90526944ee2e9c5bf2`.
SQLite integrity, foreign-key checks, and all 128 tests passed.
Production is unchanged.

## Checkpoint 11: Myvexxx (8805316504), 15:51–15:53 UTC

Clicked the exact People result and checked each first row at scroll
position zero. Friends: 17/21, partial; Next stayed on page one
(HTTP 200, no observed failed request). Followers: 16/16, complete.
Following: 9/9, complete. These three rows refresh existing edges
without adding new ones. Post-capture journal coverage: 13 Friends,
33 Followers, and 33 Following lists. Next: YptSehjZiEs and the other
reachable stale Friends lists.

Cumulative additions remain 17 friendships and 116 directed follows.
The prior 235 rows are unchanged. Both exports match the 238-row
journal SHA-256
`ea1e1213db9bdecd368a49e3599ad26efe3f2141694a1f2575dc2de8d9acb096`.
SQLite integrity, foreign-key checks, and all 128 tests passed.
No production or avatar changes.

## Checkpoint 12: YptSehjZiEs (7259361593), 16:13–16:15 UTC

Exact People result and first rows verified at scroll position zero.
Friends: 18/104, partial; Next stayed on page one (HTTP 200 and no
observed failed request). Followers 6/6 and Following 7/7, both
complete. One new friendship; cumulative 18 friendships and 116
directed follows. Post-capture journal coverage: 14 Friends,
34 Followers, and 34 Following lists. No avatar or production changes.

Graph regression check: Yippz_gg is a single selectable root; the
sebax4514 friendship remains visible with its original source and
November 25 04:51:23.219 UTC evidence despite the later partial sample.

Both exports match the 241-row append-only journal SHA-256
`58de514bc0dd08a37d2e11cdc6acbc24520d4815cb5a22454c8f8bfe7cffb1ea`.
SQLite integrity and foreign-key checks and all 128 tests passed.

## Checkpoint 13: Erutobi (2464539843), 16:21 UTC

Verified the exact People result and each first row at scroll position
zero. Friends: 16/168 exact links from the first page, partial.
Followers: 4/4; Following: 2/2, both complete. No new unique edges.
Cumulative additions remain 18 friendships and 116 directed follows.
Next: Aumjung8267 and remaining reachable stale lists.

Both exports match the 244-row append-only journal SHA-256
`120b8dd7532e460bd161a559a5826432b73eee62cc354f244e157f91c52184a1`.
SQLite integrity and foreign-key checks and all 128 tests passed.
Production unchanged.

## Checkpoint 14: Aumjung8267 (3942775137), 16:36–16:38 UTC

Exact People result and first rows verified at scroll position zero.
Friends: 18/468, partial; Next stayed at page one (HTTP 200, no observed
failed request). Followers: 3/3, complete. Following: profile count 0,
list count 0 and “No results found,” complete. No new unique edges.
Cumulative additions: 18 friendships and 116 directed follows.
Next: remaining reachable gaps, including LasTnIghT2011 Following.

Both exports match the 247-row append-only journal SHA-256
`bc963c6a91b1aa47b4beabd478a0b661c29f08f251d8135de24a56f2ce575b40`.
SQLite integrity and foreign-key checks and all 128 tests passed.
No production or avatar changes.

## Checkpoint 15: LasTnIghT2011 (1844128408), 16:50–16:52 UTC

Exact profile clicked from People results and all accepted pages
verified from scroll position zero. Friends: 17/470, partial.
Followers: 6/6, complete. Following: 36/459 across verified pages
one and two, partial. Next stayed on page two; diagnostics showed
HTTP 200 with no failed request observed.

Three new rows add 18 directed follows. Cumulative additions:
18 friendships and 134 directed follows. External graph nodes:
4,252, not an avatar scan count. No production or avatar changes.
Both exports match the 250-row append-only journal SHA-256
`87033fbed760f966465128f23bb1764a232e3913d20c2f51c462998f09f9da71`.
SQLite integrity and foreign-key checks and all 128 tests passed.

## Checkpoint 16: 10ne17 and LowTierNova, 17:12–17:15 UTC

Verified both profiles through exact People results. 10ne17
(3382416559) shows 177 Friends on the profile, but its list shows
“Friends (0)” and “No results found.” Recorded unavailable with the
profile count of 177, not an empty list. LowTierNova (2769135100):
18/60 exact Followers from page one; the next page did not advance.
Both observations were checked at scroll position zero. Diagnostics
showed HTTP 200 with no failed request observed. Other lists have
retained evidence and were not rescanned in this batch.

No new unique edges or avatars. Cumulative additions remain 18
friendships and 134 directed follows. Both exports match the 252-row
append-only journal SHA-256
`e4edda3da9511d0aa37f16c3b6d3a9d62d84b86b457a654994e5c95ed39865e4`.
Verified 10ne17’s export status is unavailable; SQLite integrity
and foreign-key checks and all 128 tests passed. No production changes.
Next: Force_oNature Friends and other reachable stale Friends lists;
known unavailable or user-deferred accounts should not be looped.

## Checkpoint 17: Force_oNature and emitnick Friends, 17:39–17:43 UTC

Verified both exact People results and checked each list from its first
row at scroll position zero. Force_oNature (1295019815): 18/26.
emitnick (1785472665): 14/55. Both partial: Next stayed on page one
with HTTP 200 and no failed request observed. Retained earlier, deeper
coverage. Directional lists were not rescanned this batch.

No new unique links; cumulative additions remain 18 friendships and
134 directed follows. Both exports match the 254-row append-only
journal SHA-256
`936ca872605a7bfa7677bb2b4f800ea6fedd05b64778ec5f9cc9c4daa46e21ad`.
SQLite integrity and foreign-key checks and all 128 tests passed.
No production or avatar changes. Next: zerealali, JPaltaa, and other
reachable stale Friends lists.

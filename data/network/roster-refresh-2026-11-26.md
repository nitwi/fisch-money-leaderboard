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

## Checkpoint 18: zerealali and JPaltaa Friends, 18:28–18:34 UTC

Verified each exact People result and first row at scroll position
zero. zerealali (3510772801): 18/108; JPaltaa (209160228): 18/225.
Both partial; Next stayed on page one, with HTTP 200 and no failed
request observed. Earlier deeper observations remain available.

Five new unique friendships, no new follows. Cumulative additions:
23 friendships and 134 directed follows. Both exports match the 256-row
append-only journal SHA-256
`4253b55bb811d72a09e481dcd5a720ae15ca228baab48a21b2058b2c69ffc941`.
SQLite integrity and foreign-key checks and all 128 tests passed.
No avatar or production changes. Next: AliceSekai and johncenagaming347v2;
15 reachable stale Friends source lists remain.

## Checkpoint 19: AliceSekai and Sune’s Friends, 19:15–19:20 UTC

Matched exact People results for AliceSekai (3747162372) and
johncenagaming347v2 (2246025273, display name Sune). First rows
were verified at scroll position zero with settled counts; no initial
zero shell was recorded. AliceSekai: 18/91; Sune: 18/135. Both partial,
with Next failing to advance (HTTP 200, no failed request observed).
Prior deeper observations remain available.

No new unique links. Cumulative additions remain 23 friendships and
134 directed follows. Both exports match the 258-row append-only
journal SHA-256
`b825c1c1a3e680266da4addf5fc6e00275888c482b986fee1b246fe535efff0b`.
SQLite integrity and foreign-key checks and all 128 tests passed.
No production or avatar changes. Next: injurylowk and Renvuz;
13 reachable stale Friends sources remain.

## Checkpoint 20: injurylowk Friends, 19:42 UTC

Matched the exact People result (10092025879) and read the first row
at scroll position zero. 16/22 exact IDs, partial; Next did not
advance (HTTP 200, no failed requests observed). No new unique links.
Both exports match the 259-row journal, SHA-256
`5818b02c1f33ea6b4b5c9818cda9520968f19f89b94f50aeb2a19667c875e94d`.
SQLite checks and all 128 tests passed. Cumulative totals remain
23 new friendships and 134 directed follows. Next: Renvuz and anyokc;
12 reachable stale Friends sources remain. Production unchanged.

## Checkpoint 21: Renvuz and anyokc Friends, 20:16–20:21 UTC

Matched exact People results and verified the first row at scroll
position zero. Renvuz (1529100107): 18/317, including Yippz_gg;
anyokc (7897184784): 17/24. Both partial: Next did not advance
(HTTP 200, no failed request observed). No newly distinct edges.
Both exports match the 261-row append-only journal SHA-256
`c53e733a71dde0f2684a0717d2f6dfe7bc7798fb5198d85e3a817fbd26fa399b`.
SQLite checks and all 128 tests passed. Cumulative 23 friendships
and 134 directed follows; no production change. Next: sabbath553 and
heanmichrkke_3. Ten reachable stale Friends samples remain.

## Checkpoint 22: sabbath553 and heanmichrkke_3 Friends, 20:59–21:05 UTC

Matched each exact People result and verified its first row at
scroll position zero. sabbath553 (3611741224): 18/46; heanmichrkke_3
(9543810680): 16/76. Both are partial: Next did not advance
(HTTP 200, no failed request observed). No newly distinct links.

Both exports match the 263-row append-only journal SHA-256
`0d43adb88d8c2d39023efb4682857d8336d37350334a7234a7727cd110fc28da`.
SQLite integrity and foreign-key checks and all 128 tests passed.
Cumulative 23 friendships and 134 directed follows. No production
or avatar changes. Next: hc2khunowpng43ntk1 and Zipidy24.
Eight reachable stale Friends source lists remain.

## Checkpoint 23: hc2khunowpng43ntk1 and Zipidy24 Friends, 21:30 UTC

Matched both exact People results and verified the first rows at
scroll position zero. hc2khunowpng43ntk1 (11482999303): 16/40;
Zipidy24 (1696267689): 18/268. Both are partial: Next stayed on page
one (HTTP 200, no observed failed requests). Prior evidence retained.

No newly distinct edges. Cumulative 23 friendships and 134 follows;
no avatar or production changes. Both exports match the 265-row
append-only journal SHA-256
`d11ca370dc4b705a996939284655c94860a589bcb5b5109ea615065df29c4c1d`.
SQLite integrity, foreign-key checks, and all 128 tests passed.
Six reachable stale Friends lists remain, starting with jonnhy1835
and ewoofs.

## Checkpoint 24: ewoofs and Tbpoqqq Friends, 22:49 UTC

Friends browsing resumed after the 21:47 UTC HTTP 429. Both accounts were
opened from exact People results and the first rows checked at scroll
position zero. ewoofs (200918130): 15/19 readable IDs across two pages.
Page 2 showed an Account Deleted card with no readable ID. The list
remains partial, and no deletion was attributed to a specific ID.
Tbpoqqq (1481603669): 9/55 readable IDs on page 1; the right button
left the paginator on page 1 (HTTP 200 with no observed failed requests).

jonnhy1835 stays pending: one cloud-browser navigation error was followed
by a fresh-tab People search that showed no matches (HTTP 200);
the earlier exact ID and prior relationship evidence remain intact.
The other pending reachable lists are zNaN_Rot, pflugerson, and Minkib7661.

No newly distinct edges. Cumulative 23 friendships and 134 follows;
no avatar or production changes. Both exports match the 267-row
append-only journal SHA-256
`7c927bdbe165da02d72c5a3be642c18e03443cff2710f7339534a136fb540679`.
SQLite integrity, foreign-key checks, and all 128 tests passed.

## Checkpoint 25: zNaN_Rot and Minkib7661 Friends, 23:03 UTC

Matched exact People results and checked the top of each scanned page.
zNaN_Rot (3228802017): 17/90, page 1; pagination did not advance
(HTTP 200, no observed failed requests). Minkib7661 (1528395974):
51/160 across pages 1–3. The initial zero-card shell contradicted the
profile; on a normal reload, the list rendered and settled at 160.
Both remain partial; existing evidence was preserved.

pflugerson (987922899) matched an exact People result before a cloud
browser navigation error. The fresh-tab search returned no matches
(HTTP 200), not a confirmed deletion or empty Friends list.
jonnhy1835 and pflugerson are the only outstanding bounded rechecks.

No newly distinct edges. Cumulative 23 friendships and 134 follows;
no avatar or production changes. Both exports match the 269-row
append-only journal SHA-256
`c3ae585fc84e1d0445c2a9d167bfe714655bc2f459351e5d29f344f4e73a21ad`.
SQLite integrity, foreign-key checks, and all 128 tests passed.

## Checkpoint 26: final bounded roster rechecks, 23:17 UTC

Exact People-result links resolved jonnhy1835 (67343676) and pflugerson
(987922899). The first rows were read at scroll position zero. The
lists are partial: jonnhy1835 17/22 and pflugerson 17/39. A normal reload
cleared pflugerson's initial zero-card shell. Both paginators stayed on
page 1 (HTTP 200, no observed failed requests). No fresh cases remain
in the bounded recheck queue. Older and deeper evidence is preserved.

Coverage of the 49 exact-ID accounts in the photographed Top 50, by
latest journal outcome plus documented unavailable and deferred cases:

| Relation | Fresh complete | Fresh partial | Retained complete | Unavailable | Deferred |
| --- | ---: | ---: | ---: | ---: | ---: |
| Friends | 0 | 36 | 9 | 4 | 0 |
| Followers | 20 | 18 | 6 | 4 | 1 |
| Following | 24 | 13 | 7 | 4 | 1 |

Fresh means on or after the November 26 06:10 UTC roster handoff.
Friends unavailable: 10ne17 (fresh zero-card shell inconsistent with
the profile), metbepol, Luwuma, and m1_zm (retained documented
exceptions). Directional unavailable: Nexvolt00, metbepol, Luwuma,
and m1_zm. Both 0egoistic directions are deferred by request.
Holladayyyyyyy remains identity-pending and outside the 49 resolved
denominator. Unavailable, deferred, and identity-pending are not empty
lists; no new termination was confirmed.

Relative to the 202-row published journal, this refresh adds 69
dated observations, 23 distinct friendships and 134 directed follows.
No previously unrecorded edge has both endpoints in the historical
leaderboard roster; adding Yippz_gg to the roster makes existing edges
eligible without counting them as new observations. No new avatar
observations or preset matches were added; the six historical avatar
observations are preserved. The exports contain 4,252 external
nodes, not an avatar-scan count.

Both exports match the append-only 271-row journal SHA-256
`564324c41533d5cb5bf4e4d1917c6dcfd34abf5d6b62a2f278bdcec0ac3bb90d`.
SQLite integrity, foreign-key checks, 50 Python tests and 78 Node tests
passed. Review only; no production merge or deployment.

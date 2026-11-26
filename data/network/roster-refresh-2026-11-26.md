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

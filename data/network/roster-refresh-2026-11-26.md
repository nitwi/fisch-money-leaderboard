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

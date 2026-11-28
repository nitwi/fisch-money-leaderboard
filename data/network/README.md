# Website observation journal

This is an offline, reviewable record of direct friend lists actually visible on normal Roblox website pages. It contains no cookies, authentication values, signed-in account identity, profile biographies, or private account/session data. It does not fetch pages or APIs and does not recursively inspect friends of friends.

`census-plan.json` lists approved source accounts. Its existing contents are not rewritten by this importer. Friends found on those accounts' pages become stable external nodes; they do not automatically become additional census targets or avatar-comparison candidates.

## Record a visible list

Create a JSON **array** of observations. Use the actual UTC time and actual visible page URL. The following time and names are an illustrative format example, not evidence to import:

```json
[
  {
    "schema_version": 1,
    "method": "roblox_website",
    "relation": "friends",
    "source_id": "12013950464",
    "source_username": "Lunary810",
    "source_profile_url": "https://www.roblox.com/users/12013950464/profile",
    "observed_at": "2026-11-24T09:00:00Z",
    "page_url": "https://www.roblox.com/users/12013950464/friends#!/friends",
    "displayed_total_count": 1,
    "coverage": {
      "status": "partial",
      "full_list_verified": false,
      "pages_observed": [1],
      "termination": "not_scrolled"
    },
    "friends": [
      {
        "id": "12019306184",
        "username": "Bergkap_99",
        "profile_url": "https://www.roblox.com/users/12019306184/profile"
      }
    ]
  }
]
```

Source IDs and every friend's ID must match their actual profile hrefs. A visible display name is not an exact username: omit `username` if it is not visible. An optional `display_name` may retain the visible display name. Never infer an ID from a similar name.

`pages_observed` contains positive page/view numbers within that inspection. `termination` is `more_available`, `end_of_list`, `not_scrolled`, `access_unavailable`, or `unknown`. Normal profile and friends/connections page URLs are accepted. Only numeric `page`/`pageNumber` query parameters are accepted; session and tracking values are rejected.

An individual friend may specify `observed_at` and `source_url` when it was observed on an earlier page/view. Otherwise both inherit the containing observation's time/page. For a list assembled from several views, retain those actual per-item times and URLs and set the containing `observed_at` to the inspection's actual completion time.

### Complete and unavailable observations

Use `status: "complete"`, `full_list_verified: true`, and `termination: "end_of_list"` **only after actually verifying the entire accessible list**. The number of unique observed IDs must equal an explicitly displayed `displayed_total_count`. For the one-friend example, those three coverage changes are sufficient only after the real UI confirms that the displayed one-friend list is complete.

A verified empty list requires explicit displayed total `0`, no friends, and the same full-list/end-of-list verification. An empty partial list or failed page does not establish zero friends.

If the list cannot be inspected, use `status: "unavailable"`, `full_list_verified: false`, `termination: "access_unavailable"`, and `friends: []`. A separately visible count may be retained, but it is not a readable list. If some friends were visible before access or pagination stopped, retain them as `partial`.

## Import without changing the website snapshot

```bash
python tools/import_network_observations.py import --input /path/to/batch.json
```

This validates the full input batch and census scope, then appends new canonical records to `data/network/website-observations.jsonl`. Content hashes create deterministic observation IDs; importing the same observation again does not append it twice. Existing journal lines are not rewritten. Unknown fields, mismatched href IDs, malformed times, inconsistent coverage, and tampered journal content fail visibly. Keep the journal and census plan in the repository for durable review.

## Build reviewable outputs

```bash
python tools/import_network_observations.py build \
  --snapshot site/network-data.json \
  --output /path/to/review-network-data.json \
  --sqlite /path/to/network.sqlite
```

Both outputs are derived and can be rebuilt from the original API snapshot plus journal. Rebuilding an already merged snapshot requires every previously retained website observation to be present; a missing or truncated journal fails instead of silently losing history or external nodes. There is no implicit modification of `site/network-data.json`; provide that path as `--output` only when publication is authorized. Never use a journal path as an output path.

The API friend record is preserved verbatim in `account.friend_evidence.api`; original API capabilities remain unchanged. Website observation IDs are retained next to it. The current `account.friends` projection supports the existing graph and shared-neighbor functions. Items carry `method`, `source_label`, `observed_at`, `source_url`, and individual `evidence[]` records. The UI must distinguish website observations from API capabilities and display per-item provenance.

For the published download, use `--sqlite site/network-database.sqlite.gz`. The `.gz` suffix compresses a real SQLite database; decompress it before opening it with SQLite or a database viewer. The Networker links this export and the network JSON, and its inspection coverage table shows each source account's readable ID count, separately displayed total, list views, and actual observation time.

### History and absence semantics

The latest complete observation replaces older positive lists for the active projection. All earlier evidence remains in the journal and SQLite. Positive items from later partial observations are added only when their individual observation time is at or after that complete observation; repackaging an older item into a later batch cannot resurrect an excluded edge. Any later partial or unavailable check makes the projection partial, so absence remains unknown. Successful observation time and latest attempted/check time remain separate, including failed API pagination after an earlier successful page. With no complete observation, the projection contains observed positive links from partial observations and makes no completeness claim.

This is an observation history, not a guarantee of a current friendship. Each edge retains when it was actually seen. A later complete list excluding an earlier friend removes that older edge from the active projection without deleting its history. Ties in observation time use journal order; record sufficiently precise real times when separate views differ.

External neighbor nodes are stored in the JSON `network_nodes` array and the SQLite `nodes` table, not in `accounts`. They therefore do not silently become avatar candidates. If a separate equipped-asset scan is later attached to an external node, rebuilding preserves only its `avatar`, `avatar_thumbnail`, `headshot`, and `thumbnail` metadata by exact numeric ID, with the original source and scan time. Website friend-card observations never establish a preset match. The branching viewer can qualify an external node from its full verified asset preset (or partial match when explicitly enabled); missing asset records stay unchecked. These external visual records are retained in network JSON; the SQLite export currently contains identity and social evidence, not external avatar metadata. `website_observations` summarizes collection coverage and hashes the canonical JSONL journal bytes, including each terminating newline; no automatic claim about ownership or misconduct is generated.

The latest website observation is summarized in `account.friend_evidence.latest_website`. Its displayed total is not promoted to a complete identity list: a source can display 336 friends while fewer exact profile IDs are readable. Cards labeled “Unavailable” with `/users/-1/profile` cannot be valid nodes and must be omitted. The actual inspected pages and partial status preserve the limit of that evidence. Generated replacement usernames such as `roblox_user_5080826450` are retained exactly as displayed, even when they exceed the usual username length.

## SQLite schema and useful queries

Tables: `nodes`, `checkpoints`, `account_coverage`, `observations`, `friendship_evidence`, `friendship_current`, and `metadata`. Exact IDs are TEXT primary/foreign keys. Source/target/time indexes support direct links and shared neighbors. `observations.raw_json` preserves every underlying website observation and the original API record; the journal remains canonical.

```sql
-- All recorded direct evidence involving an exact account ID.
SELECT * FROM friendship_evidence
WHERE source_id = ? OR target_id = ?
ORDER BY observed_at DESC;

-- Known shared neighbors in two source accounts' active projections.
-- These are a lower bound whenever either source's coverage is partial.
SELECT a.target_id, n.username
FROM friendship_current AS a
JOIN friendship_current AS b ON b.target_id = a.target_id
JOIN nodes AS n ON n.id = a.target_id
WHERE a.source_id = ? AND b.source_id = ?;

-- Ledger accounts not yet inspected through the website.
SELECT n.id, n.username, c.latest_rank
FROM account_coverage AS c JOIN nodes AS n ON n.id = c.account_id
WHERE n.ledger = 1 AND c.website_observations = 0
ORDER BY c.latest_rank IS NULL, c.latest_rank;
```

Tests run entirely offline:

```bash
python -m unittest discover -s tests -p test_network_observations.py -v
```

## Import observed directional follows

The same append-only website journal accepts `relation: "followers"` and `relation: "following"`. Use a list field with the same name as the relation and retain the exact observed Roblox list URL ending `#!/followers` or `#!/following`, including on per-item evidence. The observed account is the destination for `followers` and the origin for `following`. The SQLite `follow_evidence` table stores that direction explicitly, apart from friendships. The top-level friend coverage totals still count only sources whose friend lists have been recorded. Both follow types use the same conservative complete/partial/unavailable coverage rules as friends.

## Import observed equipped avatar assets

The optional `avatar-observations.jsonl` journal preserves equipped-asset observations independently of website relationship observations. Record only exact equipped asset IDs actually visible in a permitted interface; never infer an asset from a picture, name, similarity score, friend relationship, or inaccessible page.

Pass `import-avatars --input scans.json` a JSON array of objects with `user_id`, `observed_at` (actual UTC time ending in Z), `source_url` (that exact user's public Roblox profile or public equipped-avatar endpoint), `status`, and `asset_ids` (positive decimal IDs as strings). For example, the following is a **fictional** format example, not a verified observation:

```json
[{"user_id":"12345","observed_at":"2026-11-24T05:10:00Z","source_url":"https://www.roblox.com/users/12345/profile","status":"partial","asset_ids":["617605556"]}]
```

```sh
python tools/import_network_observations.py import-avatars --input scans.json
python tools/import_network_observations.py build --output /tmp/network-review.json --sqlite /tmp/network-review.sqlite
```

Use `complete` only when the interface confirms the entire equipped list. Use `partial` for an incomplete view: visible IDs can prove an exact full preset match, but unobserved items remain unverified rather than absent. Use `unavailable` and an empty ID array when the interface exposes no usable equipped data. Only a complete scan can establish a nonmatch. This importer will not create new social links or add avatar-only identities to the network, and it never initiates a browser visit or an API request.

`rbi-presets.json` pins all 22 presets from RBI v0.18.1.1-beta, including the corrected single-asset GreenBean rule. SQLite `avatar_observations` retains every observation and its required, matched, missing or unverified IDs for each preset. The site's node projection uses the latest observed avatar, independently of the relationship observation time; prior scans stay in the journal and database. A positive preset match describes equipped assets only and is not evidence of automation, shared ownership, or misconduct.

### Relationship breakdown

The relationship breakdown keeps direct leaderboard friends, direct friends whose outfits have known preset matches, incoming followers, and outgoing follows in four separate groups. A person can appear in more than one group, but only once in the direct-friend denominator. It uses observed positive links, not account names or outfits, to identify friends. Near means at least 80% of the exact required item IDs for a preset with at least three required IDs, on a complete avatar scan. A partial scan can establish a full match if every required item was observed; otherwise it remains unknown. The rate uses only fully scanned observed friends and reports that denominator and unknowns separately. Exact matches confirmed on partial scans remain visible but are excluded from both sides of the rate. No avatar query or inference about botting is made by this view.

Workflow: finish the ranked Friends pass before starting a separate directional Followers and Following pass. A transient or incomplete Friends list remains a partial record with the next checkpoint; it does not establish an empty list. Save and push each verified batch without replacing the earlier journal.


## Recover ID-only usernames from normal Roblox profiles (no API needed)

The Networker cannot infer a real username from a Roblox ID, a display name,
similar outfits, or similar-looking usernames. The public profile for an exact
saved user ID may visibly show the account's username. Use a permitted
interactive browser such as dot/ChatGPT Work, not bulk API requests.

1. Open the prioritised ID-only list at
   `https://nitwi.github.io/fisch-money-leaderboard/network-profile-queue.json`.
   It lists exact account IDs, normal profile URLs, and already-observed ledger
   relationship counts. Prioritize high-connection accounts rather than all
   thousands of unknown accounts.
2. Visit the supplied `https://www.roblox.com/users/ID/profile` using normal
   browser navigation. Confirm that the visited profile is **the same numeric
   user ID**, then read the exact Roblox **username** (not the display name).
   Do not infer or create a username when it is not visible.
3. Capture the actual UTC observation time and exact profile URL. Create an
   input JSON array such as the following **illustration**, not real evidence:

```json
[
  {
    "schema_version": 1,
    "method": "roblox_website_profile",
    "user_id": "12345",
    "username": "ExactVisibleUsername",
    "display_name": "Display Name",
    "status": "verified",
    "observed_at": "2026-11-27T23:05:00Z",
    "source_url": "https://www.roblox.com/users/12345/profile"
  }
]
```

4. Import via `python tools/import_network_profile_names.py import --input profiles.json`.
   This verifies that each ID exists in the saved Networker, checks profile
   URL/ID equality, validates usernames and UTC timestamps, and appends only
   new immutable records to `data/network/profile-name-observations.jsonl`.
   Commit that journal as a reviewable GitHub change.
5. Deployment runs `python tools/build_network_usernames.py --profiles-only
   --inherit-published`. This **does not call Roblox's Users API**. It joins
   saved website-profile observations with prior verified names from the
   already-published static Networker overlay, if that overlay is readable,
   and publishes `site/network-usernames.json` plus an updated
   `site/network-profile-queue.json`. The graph displays the username by
   exact ID with observation provenance.

If a profile is inaccessible, deleted, does not display the username, or has
an access restriction, record `status: "unavailable"`, `username: ""` only
when there was an actual attempted inspection, or skip it. Never claim an
uninspected account is unavailable. Stop collection at restrictions: do not
use proxies, alternate endpoints, scraping tricks, or aggressive retries to
evade a denial. Any missing name retains the ID or a clearly marked saved
display name/previously observed handle. Website friendships, account
relationships, and ledger rankings are not modified by this process.

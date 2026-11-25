import copy
import gzip
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import import_network_observations as obs


def record(source="1", targets=("2",), at="2026-11-24T09:00:00Z", status="partial", total=None):
    return {
        "method": "roblox_website", "source_id": source, "source_username": "VisibleUser",
        "source_profile_url": obs.profile_url(source), "observed_at": at,
        "page_url": f"https://www.roblox.com/users/{source}/friends#!/friends",
        "displayed_total_count": total,
        "coverage": {"status": status, "full_list_verified": status == "complete", "pages_observed": [1], "termination": "end_of_list" if status == "complete" else "not_scrolled"},
        "friends": [{"id": target, "username": "Friend" + target, "profile_url": obs.profile_url(target)} for target in targets],
    }


def snapshot():
    return {"schema_version": 1, "generated_at": "2026-11-24T08:00:00Z", "ledger_latest_checkpoint": {"id": "cp", "at": "2026-11-24T05:17:00Z", "day_key": "2026-11-23"},
            "capabilities": {"friends": {"status": "unavailable", "reason": "API denied"}},
            "accounts": [{"id": source, "username": "User" + source, "aliases": [], "ledger": True, "latest_rank": int(source), "last_seen_day": "2026-11-23",
                          "friends": {"status": "unavailable", "items": [], "fetched_at": None, "checked_at": "2026-11-24T08:00:00Z", "http_status": 403, "source_url": f"https://friends.roblox.com/v1/users/{source}/friends/find", "error": "Request Context Failure"}}
                         for source in ("1", "2")]}


class ObservationTests(unittest.TestCase):
    def test_compressed_database_is_a_readable_sqlite_export(self):
        merged, events = obs.merge_snapshot(snapshot(), [obs.normalize_observation(record(targets=("3",)))])
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "network.sqlite.gz"
            obs.build_database(archive, merged, events)
            database = Path(directory) / "network.sqlite"
            database.write_bytes(gzip.decompress(archive.read_bytes()))
            with sqlite3.connect(database) as connection:
                self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                self.assertEqual(connection.execute("SELECT target_id FROM friendship_current WHERE source_id='1'").fetchone()[0], "3")
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_visible_generated_replacement_username_is_preserved(self):
        actual = record(targets=("5080826450",))
        actual["friends"][0]["username"] = "roblox_user_5080826450"
        parsed = obs.normalize_observation(actual)
        self.assertEqual(parsed["friends"][0]["username"], "roblox_user_5080826450")
        for invalid in ("x" * 21, "roblox_user_not_numeric", "@roblox_user_5080826450"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                obs.safe_text(invalid, username=True)

    def test_displayed_total_and_latest_website_coverage_are_kept_separate(self):
        observed = obs.normalize_observation(record(targets=("3",), total=336))
        merged, _ = obs.merge_snapshot(snapshot(), [observed])
        account = merged["accounts"][0]
        self.assertEqual(account["friends"]["status"], "partial")
        self.assertNotIn("total_count", account["friends"])
        latest = account["friend_evidence"]["latest_website"]
        self.assertEqual((latest["observed_id_count"], latest["displayed_total_count"]), (1, 336))
        self.assertEqual(latest["coverage"], observed["coverage"])
        self.assertEqual(merged["website_observations"]["partial_source_count"], 1)
        self.assertEqual(merged["website_observations"]["complete_source_count"], 0)

    def test_strict_id_url_and_utc_validation(self):
        base = record()
        for change in ({"source_id": True}, {"observed_at": "2026-11-24T09:00:00"}, {"observed_at": "2026-02-30T09:00:00Z"}, {"source_profile_url": obs.profile_url("3")}, {"page_url": "https://evil.example/users/1/friends"}, {"page_url": "https://www.roblox.com/users/1/friends?token=secret"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                obs.normalize_observation({**base, **change})

    def test_auth_context_bios_and_arbitrary_fields_are_rejected(self):
        for key in ("cookies", "authorization", "signed_in_account_id", "session", "bio"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                obs.normalize_observation({**record(), key: "not allowed"})
        wrong = record(); wrong["friends"][0]["bio"] = "not allowed"
        with self.assertRaises(ValueError):
            obs.normalize_observation(wrong)

    def test_exact_target_href_and_self_links(self):
        wrong = record(); wrong["friends"][0]["profile_url"] = obs.profile_url("3")
        with self.assertRaises(ValueError): obs.normalize_observation(wrong)
        with self.assertRaises(ValueError): obs.normalize_observation(record(targets=("1",)))

    def test_complete_requires_full_verified_end_and_matching_displayed_count(self):
        good = record(status="complete", total=1)
        self.assertEqual(obs.normalize_observation(good)["coverage"]["status"], "complete")
        for modifier in ("verified", "ending", "count", "missing_count"):
            bad = copy.deepcopy(good)
            if modifier == "verified": bad["coverage"]["full_list_verified"] = False
            if modifier == "ending": bad["coverage"]["termination"] = "more_available"
            if modifier == "count": bad["displayed_total_count"] = 2
            if modifier == "missing_count": bad["displayed_total_count"] = None
            with self.subTest(modifier=modifier), self.assertRaises(ValueError): obs.normalize_observation(bad)
        zero = obs.normalize_observation(record(targets=(), status="complete", total=0))
        self.assertEqual(zero["friends"], [])

    def test_partial_empty_is_not_complete_and_unavailable_cannot_hide_items(self):
        partial = obs.normalize_observation(record(targets=(), total=20))
        self.assertEqual(partial["coverage"]["status"], "partial")
        with self.assertRaises(ValueError): obs.normalize_observation(record(status="unavailable"))

    def test_deterministic_journal_append_duplicate_and_batch_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.jsonl"
            first = obs.append_journal([record()], path, allowed_sources={"1"})
            original = path.read_bytes()
            again = obs.append_journal([record()], path, allowed_sources={"1"})
            self.assertEqual((first["added"], again["added"], again["duplicates"]), (1, 0, 1))
            self.assertEqual(path.read_bytes(), original)
            with self.assertRaises(ValueError): obs.append_journal([record(at="2026-11-24T10:00:00Z"), {"bad": True}], path)
            self.assertEqual(path.read_bytes(), original)
            with self.assertRaises(ValueError): obs.append_journal([record(source="3")], path, allowed_sources={"1"})
            self.assertEqual(len(obs.read_journal(path)), 1)

    def test_tampered_journal_id_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.jsonl"
            item = obs.normalize_observation(record())
            item["source_username"] = "Changed"
            path.write_text(json.dumps(item) + "\n")
            with self.assertRaises(ValueError): obs.read_journal(path)

    def test_append_preserves_valid_last_line_missing_newline(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.jsonl"
            first = obs.canonical(obs.normalize_observation(record()))
            path.write_text(first)
            obs.append_journal([record(at="2026-11-24T10:00:00Z")], path)
            self.assertTrue(path.read_text().startswith(first + "\n"))
            self.assertEqual(len(obs.read_journal(path)), 2)

    def test_derived_outputs_cannot_replace_canonical_journal(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.jsonl"
            obs.append_journal([record()], path)
            before = path.read_bytes()
            with self.assertRaises(SystemExit):
                obs.main(["build", "--journal", str(path), "--output", str(path)])
            self.assertEqual(path.read_bytes(), before)

    def test_api_metadata_and_avatar_candidate_list_are_preserved(self):
        original = snapshot(); before = copy.deepcopy(original)
        merged, _ = obs.merge_snapshot(original, [obs.normalize_observation(record(targets=("3",)))])
        self.assertEqual(original, before)
        self.assertEqual(merged["accounts"][0]["friend_evidence"]["api"], before["accounts"][0]["friends"])
        self.assertEqual(merged["capabilities"], before["capabilities"])
        self.assertEqual(len(merged["accounts"]), 2)
        self.assertTrue(next(n for n in merged["network_nodes"] if n["id"] == "3")["external"])
        item = merged["accounts"][0]["friends"]["items"][0]
        self.assertEqual((item["method"], item["source_label"]), ("roblox_website", "Roblox website"))

    def test_external_visual_records_survive_social_rebuild_with_original_provenance(self):
        original = snapshot()
        visual = {
            "avatar": {"status": "ok", "assets": [{"id": "617605556", "name": "GreenBean"}],
                       "fetched_at": "2026-11-24T07:00:00Z", "source_url": "https://avatar.roblox.com/v1/users/3/avatar"},
            "avatar_thumbnail": "https://tr.rbxcdn.com/external-avatar.png",
            "headshot": "https://tr.rbxcdn.com/external-headshot.png",
            "thumbnail": {"status": "ok", "fetched_at": "2026-11-24T07:01:00Z", "source_url": "https://thumbnails.roblox.com/v1/users/avatar?userIds=3", "http_status": 200},
        }
        original["network_nodes"] = [{"id": "3", "username": "OldName", "ledger": True, "target": True,
                                       "external": False, "friends": {"status": "complete", "items": [{"id": "9"}]}, **visual}]
        before = copy.deepcopy(original)
        observations = [obs.normalize_observation(record(targets=("3", "4")))]
        merged, _ = obs.merge_snapshot(original, observations)
        nodes = {node["id"]: node for node in merged["network_nodes"]}
        self.assertEqual({key: nodes["3"][key] for key in visual}, visual)
        self.assertEqual((nodes["3"]["username"], nodes["3"]["ledger"], nodes["3"]["target"], nodes["3"]["external"]), ("Friend3", False, False, True))
        self.assertNotIn("friends", nodes["3"])
        self.assertNotIn("9", nodes)
        self.assertTrue(all(key not in nodes["4"] for key in visual))
        self.assertEqual(len(merged["accounts"]), 2)
        self.assertEqual(original, before)
        twice, _ = obs.merge_snapshot(merged, observations)
        repeated = next(node for node in twice["network_nodes"] if node["id"] == "3")
        self.assertEqual({key: repeated[key] for key in visual}, visual)

    def test_external_visual_metadata_matches_only_exact_ids_and_does_not_resurrect_nodes(self):
        original = snapshot()
        original["accounts"][0]["avatar"] = {"status": "unavailable", "fetched_at": "2026-11-24T08:00:00Z"}
        original["network_nodes"] = [
            {"id": "1", "username": "User1", "avatar": {"status": "ok", "assets": [{"id": "617605556"}]}},
            {"id": "003", "username": "Renamed", "avatar": {"status": "unavailable", "fetched_at": "2026-11-24T07:00:00Z"}},
            {"id": "9", "username": "Friend4", "avatar": {"status": "ok", "assets": [{"id": "617605556"}]}},
        ]
        merged, _ = obs.merge_snapshot(original, [obs.normalize_observation(record(targets=("3", "4")))])
        nodes = {node["id"]: node for node in merged["network_nodes"]}
        self.assertEqual(nodes["3"]["avatar"], original["network_nodes"][1]["avatar"])
        self.assertNotIn("avatar", nodes["4"])
        self.assertNotIn("9", nodes)
        self.assertNotIn("avatar", nodes["1"])
        self.assertEqual(merged["accounts"][0]["avatar"], original["accounts"][0]["avatar"])

    def test_external_visual_preservation_rejects_ambiguous_or_invalid_snapshot_ids(self):
        for nodes in ([{"id": "3"}, {"id": "003"}], [{"id": True}], [None]):
            with self.subTest(nodes=nodes), self.assertRaises(ValueError):
                obs.merge_snapshot({**snapshot(), "network_nodes": nodes}, [])

    def test_latest_complete_replaces_older_partials_but_history_survives(self):
        records = [obs.normalize_observation(record(targets=("3",))), obs.normalize_observation(record(targets=("4",), at="2026-11-24T10:00:00Z", status="complete", total=1))]
        merged, events = obs.merge_snapshot(snapshot(), records)
        friends = merged["accounts"][0]["friends"]
        self.assertEqual(friends["status"], "complete")
        self.assertEqual([i["id"] for i in friends["items"]], ["4"])
        self.assertTrue(any(any(i["id"] == "3" for i in event["items"]) for event in events))
        self.assertEqual(len(merged["accounts"][0]["friend_evidence"]["website_observation_ids"]), 2)

    def test_later_partial_adds_positive_and_makes_absence_unknown(self):
        records = [obs.normalize_observation(record(targets=("3",), status="complete", total=1)), obs.normalize_observation(record(targets=("4",), at="2026-11-24T10:00:00Z"))]
        merged, _ = obs.merge_snapshot(snapshot(), records)
        friends = merged["accounts"][0]["friends"]
        self.assertEqual(friends["status"], "partial")
        self.assertNotIn("total_count", friends)
        self.assertEqual({i["id"] for i in friends["items"]}, {"3", "4"})

    def test_older_item_in_later_partial_cannot_resurrect_after_complete_exclusion(self):
        complete = record(targets=("4",), at="2026-11-24T09:30:00Z", status="complete", total=1)
        partial = record(targets=("3",), at="2026-11-24T10:00:00Z")
        partial["friends"][0]["observed_at"] = "2026-11-24T09:00:00Z"
        records = [obs.normalize_observation(complete), obs.normalize_observation(partial)]
        merged, events = obs.merge_snapshot(snapshot(), records)
        friends = merged["accounts"][0]["friends"]
        self.assertEqual(friends["status"], "partial")
        self.assertEqual([item["id"] for item in friends["items"]], ["4"])
        self.assertTrue(any(any(item["id"] == "3" for item in event["items"]) for event in events))

    def test_later_failed_api_check_keeps_success_time_separate_and_absence_unknown(self):
        source = snapshot()
        source["accounts"][0]["friends"] = {
            "status": "partial", "fetched_at": "2026-11-24T09:00:00Z", "checked_at": "2026-11-24T10:00:00Z",
            "http_status": 403, "source_url": "https://friends.roblox.com/v1/users/1/friends/find",
            "items": [{"id": "3", "username": "OldFriend", "observed_at": "2026-11-24T09:00:00Z"}],
        }
        records = [obs.normalize_observation(record(targets=("4",), at="2026-11-24T09:30:00Z", status="complete", total=1))]
        merged, events = obs.merge_snapshot(source, records)
        friends = merged["accounts"][0]["friends"]
        self.assertEqual(friends["status"], "partial")
        self.assertEqual(friends["fetched_at"], "2026-11-24T09:30:00.000Z")
        self.assertEqual(friends["checked_at"], "2026-11-24T10:00:00.000Z")
        self.assertEqual(friends["failed_at"], "2026-11-24T10:00:00.000Z")
        self.assertEqual([item["id"] for item in friends["items"]], ["4"])
        self.assertEqual(events[0]["at"], "2026-11-24T09:00:00.000Z")
        self.assertEqual(events[0]["checked_at"], "2026-11-24T10:00:00.000Z")

    def test_later_unavailable_retains_positive_time_without_claiming_complete(self):
        records = [obs.normalize_observation(record(status="complete", total=1)), obs.normalize_observation(record(targets=(), status="unavailable", at="2026-11-24T10:00:00Z"))]
        merged, _ = obs.merge_snapshot(snapshot(), records)
        friends = merged["accounts"][0]["friends"]
        self.assertEqual(friends["status"], "partial")
        self.assertEqual(friends["items"][0]["observed_at"], "2026-11-24T09:00:00.000Z")
        self.assertEqual(friends["failed_at"], "2026-11-24T10:00:00.000Z")

    def test_item_page_provenance_and_multiple_observations_survive(self):
        first = record(at="2026-11-24T10:00:00Z")
        first["friends"][0].update(observed_at="2026-11-24T09:59:00Z", source_url="https://www.roblox.com/users/1/friends?page=2")
        records = [obs.normalize_observation(first), obs.normalize_observation(record(at="2026-11-24T11:00:00Z"))]
        merged, _ = obs.merge_snapshot(snapshot(), records)
        item = merged["accounts"][0]["friends"]["items"][0]
        self.assertEqual(len(item["evidence"]), 2)
        self.assertEqual(item["evidence"][0]["observed_at"], "2026-11-24T09:59:00.000Z")
        self.assertTrue(item["evidence"][0]["source_url"].endswith("?page=2"))

    def test_rebuilding_merged_snapshot_does_not_reclassify_website_as_api(self):
        records = [obs.normalize_observation(record())]
        original = snapshot()
        merged, _ = obs.merge_snapshot(original, records)
        twice, _ = obs.merge_snapshot(merged, records)
        self.assertEqual(twice["accounts"][0]["friend_evidence"]["api"], original["accounts"][0]["friends"])
        self.assertEqual(twice["accounts"][0]["friends"], merged["accounts"][0]["friends"])

    def test_rebuilding_merged_snapshot_rejects_missing_or_truncated_journal(self):
        records = [obs.normalize_observation(record(targets=("3",))), obs.normalize_observation(record(at="2026-11-24T10:00:00Z"))]
        merged, _ = obs.merge_snapshot(snapshot(), records)
        before = copy.deepcopy(merged)
        for incomplete in ([], records[:1]):
            with self.subTest(length=len(incomplete)), self.assertRaisesRegex(ValueError, "restore the complete journal"):
                obs.merge_snapshot(merged, incomplete)
        self.assertEqual(merged, before)

    def test_sqlite_stable_nodes_evidence_and_shared_neighbor_query(self):
        records = [obs.normalize_observation(record(source="1", targets=("3",))), obs.normalize_observation(record(source="2", targets=("3",)))]
        merged, events = obs.merge_snapshot(snapshot(), records)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "network.sqlite"
            obs.build_database(path, merged, events)
            with sqlite3.connect(path) as db:
                self.assertEqual(db.execute("SELECT id,external FROM nodes WHERE id='3'").fetchone(), ("3", 1))
                self.assertEqual(db.execute("SELECT COUNT(*) FROM friendship_evidence").fetchone()[0], 2)
                shared = db.execute("SELECT a.target_id FROM friendship_current a JOIN friendship_current b ON a.target_id=b.target_id WHERE a.source_id=? AND b.source_id=?", ("1", "2")).fetchall()
                self.assertEqual(shared, [("3",)])
                self.assertEqual(db.execute("SELECT COUNT(*) FROM account_coverage").fetchone()[0], 2)
                self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])


    def test_directional_lists_stay_separate_from_friendship(self):
        followers = record(source="1", targets=("3",), status="complete", total=1)
        followers.update(relation="followers", page_url="https://www.roblox.com/users/1/friends#!/followers")
        followers["followers"] = followers.pop("friends")
        following = record(source="1", targets=("2",), status="complete", total=1)
        following.update(relation="following", page_url="https://www.roblox.com/users/1/friends#!/following")
        following["following"] = following.pop("friends")
        entries = list(map(obs.normalize_observation, (followers, following)))
        merged, events = obs.merge_snapshot(snapshot(), entries)
        again, _ = obs.merge_snapshot(merged, entries)
        self.assertEqual(merged["accounts"], again["accounts"])
        with self.assertRaisesRegex(ValueError, "previously retained website observations"):
            obs.merge_snapshot(merged, entries[:1])
        self.assertEqual(merged["website_observations"]["source_account_count"], 0)
        self.assertEqual(merged["website_observations"]["follow_source_count"], 1)
        account = merged["accounts"][0]
        self.assertEqual(account["friends"]["status"], "unavailable")
        self.assertEqual(account["followers"]["items"][0]["id"], "3")
        self.assertEqual(account["following"]["items"][0]["id"], "2")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "network.sqlite"
            obs.build_database(path, merged, events)
            with sqlite3.connect(path) as db:
                self.assertEqual(db.execute("SELECT follower_id,followed_id FROM follow_evidence ORDER BY 1").fetchall(), [("1", "2"), ("3", "1")])
                self.assertEqual(db.execute("SELECT COUNT(*) FROM friendship_evidence").fetchone(), (0,))
                self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_follow_list_evidence_must_match_its_exact_route(self):
        wrong = record()
        wrong["relation"] = "followers"
        wrong["followers"] = wrong.pop("friends")
        with self.assertRaises(ValueError):
            obs.normalize_observation(wrong)
        wrong["page_url"] = wrong["page_url"].replace("#!/friends", "#!/followers")
        wrong["followers"][0]["source_url"] = wrong["page_url"].replace("#!/followers", "#!/following")
        with self.assertRaises(ValueError):
            obs.normalize_observation(wrong)


if __name__ == "__main__":
    unittest.main()

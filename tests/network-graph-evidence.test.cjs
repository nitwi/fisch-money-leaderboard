"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../site/networker-core.js");
const graph = require("../site/network-graph.js");
const lower = "2026-11-24T10:00:00Z", higher = "2026-11-25T10:00:00Z";
const preset = core.RBI_AVATAR_RULES.presets.find(item => item.assetIds.length >= 2);
const avatar = (status, ids) => ({status, assets: ids.map(id => ({id})), fetched_at: lower});
const relationship = (kind, from, to, timestamp = lower) => ({kind, from, to,
  evidence: [{source_url: "https://www.roblox.com/users/1/profile", observed_at: timestamp}]});
function testView(accounts, edges, expandedIds = [], extra = {}) {
  return graph.buildBranches({network: {nodes: new Map(accounts.map(node => [node.id, node])), edges},
    focusId: "1", core, expandedIds, ...extra});
}

test("only leaderboard accounts or exact full presets are visible across observed edges", () => {
  const accounts = [
    {id: "1", ledger: true}, {id: "2", ledger: true, avatar: avatar("partial", [])},
    {id: "3", avatar: avatar("ok", [...preset.assetIds, "999999"])},
    {id: "4", avatar: avatar("ok", [preset.assetIds[0]])},
    {id: "5", avatar: avatar("partial", [])},
    {id: "6", avatar: avatar("partial", preset.assetIds)},
    {id: "7", ledger: true},
  ];
  const edges = accounts.slice(1, 6).map(node => relationship("friend", "1", node.id));
  edges.push({kind: "friend", from: "1", to: "7", evidence: []});
  edges.push(relationship("outfit", "1", "7"));
  const view = testView(accounts, edges, [], {includePartial: true});
  assert.deepEqual(view.nodes.map(node => node.id), ["1", "2", "3", "6"]);
  assert.equal(view.eligibility.get("2").incomplete, true);
  assert.equal(view.eligibility.get("4").category, "partial");
  assert.equal(view.eligibility.get("5").category, "unknown");
  assert.equal(view.hidden.partial, 1);
  assert.equal(view.hidden.unchecked, 1);
});

test("expansion retains genuinely shared links and preserves follow direction", () => {
  const accounts = ["1", "2", "3", "4", "5"].map(id => ({id, ledger: true}));
  const edges = [
    relationship("friend", "1", "2"), relationship("friend", "1", "3"),
    relationship("follow", "4", "2"), relationship("follow", "3", "4"),
    relationship("friend", "4", "5")
  ];
  const view = testView(accounts, edges, ["2", "4"]);
  assert.deepEqual(view.nodes.map(node => node.id), ["1", "2", "3", "4", "5"]);
  assert.equal(view.edges.find(edge => edge.from === "4" && edge.to === "2").crossLink, false);
  assert.equal(view.edges.find(edge => edge.from === "3" && edge.to === "4").crossLink, true);
  assert.deepEqual(testView(accounts, edges, ["3", "4"]).nodes.map(node => node.id), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(testView(accounts, edges).nodes.map(node => node.id), ["1", "2", "3"]);
});

test("only a strictly later relevant complete list can mark a positive edge historical", () => {
  const edges = [relationship("follow", "1", "2"), relationship("follow", "2", "1")];
  const list = (status, fetched_at, items = []) => ({status, fetched_at, items, source_url: "https://www.roblox.com/users/1/profile"});
  const accounts = [
    {id: "1", ledger: true, following: list("complete", higher), followers: list("partial", higher)},
    {id: "2", ledger: true, following: list("complete", lower), followers: list("partial", higher)},
  ];
  let view = testView(accounts, edges);
  assert.equal(view.edges.find(edge => edge.from === "1").status, "historical");
  assert.equal(view.edges.find(edge => edge.from === "1").laterChecks[0].kind, "following");
  assert.equal(view.edges.find(edge => edge.from === "2").status, "latest-saved");
  view = testView(accounts, [relationship("follow", "1", "2", null)]);
  assert.equal(view.edges[0].status, "undated");
});

test("projected historical evidence is retained and a newer positive can reverify the same pair", () => {
  const accounts = ["1", "2"].map(id => ({id, ledger: true}));
  const saved = relationship("friend", "1", "2");
  saved.laterChecks = [{ownerId: "1", kind: "friends", observed_at: higher}];
  let view = testView(accounts, [], [], {historicalEdges: [saved]});
  assert.equal(view.edges[0].status, "historical");
  view = testView(accounts, [relationship("friend", "2", "1", "2026-11-26T10:00:00Z")], [], {historicalEdges: [saved]});
  assert.equal(view.edges[0].status, "latest-saved");
  assert.equal(view.edges[0].evidence.length, 2);
});

test("explicit projected avatar scans override older baseline API records in the graph only", () => {
  const accounts = [{id:"1", ledger:true}, {id:"2", avatar: avatar("ok", [])}];
  const data = [{id:"2", avatar: avatar("partial", preset.assetIds), avatar_preset_review: {status:"full"}}];
  const view = testView(accounts, [relationship("friend", "1", "2")], [], {avatarNodes: data});
  assert.deepEqual(view.nodes.map(node => node.id), ["1","2"]);
  assert.equal(view.eligibility.get("2").incomplete, true);
  assert.equal(accounts[1].avatar.status, "ok");
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { timestampChoices } = require("../site/ledger-timestamp.js");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../site/data.json"), "utf8"));

function selected(snapshot, player = "id:1316700350") {
  const checkpoint = data.checkpoints.find(item => item.id === snapshot);
  assert.ok(checkpoint, `Missing fixture snapshot ${snapshot}`);
  return {
    checkpoint,
    row: data.observations.find(item => item.checkpoint === snapshot && item.key === player) || null,
    selectedKey: player,
    playerName: data.players.find(item => item.key === player)?.name,
    captures: data.captures
  };
}

test("selected latest balance uses its recorded UTC instant", () => {
  const result = timestampChoices(selected("2026-11-22_2213"));
  assert.equal(result.choices[0].iso, "2026-11-23T04:13:00.000Z");
  assert.equal(result.choices[0].id, "balance");
});

test("later player profile, original rank photo, and snapshot anchor remain distinct", () => {
  const result = timestampChoices(selected("2026-11-12_2258"));
  assert.deepEqual(result.choices.map(item => [item.id, item.iso]), [
    ["balance", "2026-11-13T05:38:50.000Z"],
    ["rank", "2026-11-13T04:56:50.000Z"],
    ["snapshot", "2026-11-13T04:58:00.000Z"]
  ]);
  assert.deepEqual(result.choices[0].evidence, ["PU0001"]);
  assert.deepEqual(result.choices[1].evidence, ["EV0169"]);
  assert.equal(result.choices[0].precision, "profile-photo");
});

test("another player on the board never inherits a later profile time", () => {
  const result = timestampChoices(selected("2026-11-12_2258", "id:2769135100"));
  assert.equal(result.choices[0].iso, "2026-11-13T04:58:00.000Z");
  assert.equal(result.choices.length, 1);
});

test("an early morning photo uses its actual date, not the previous leaderboard day", () => {
  const context = selected("2026-11-20_0008");
  assert.equal(context.checkpoint.day_key, "2026-11-19");
  assert.equal(timestampChoices(context).choices[0].iso, "2026-11-20T06:08:00.000Z");
});

test("a merged session's corroborating later evidence does not move the balance time", () => {
  assert.equal(timestampChoices(selected("2026-11-04_0142")).choices[0].iso, "2026-11-04T07:42:00.000Z");
});

test("a future merged row preserves its individual capture time and precision", () => {
  const context = {
    checkpoint: { id: "a", at: "2026-11-04T07:42:00Z", day_key: "2026-11-03", precision: "user-supplied" },
    row: { checkpoint: "a", key: "user:50", rank: 50, source_checkpoint: "b", at: "2026-11-04T07:52:00Z", evidence: ["proof-b"] },
    selectedKey: "user:50",
    captures: [{ id: "b", precision: "approximate_or_contextual" }]
  };
  const result = timestampChoices(context);
  assert.equal(result.choices[0].iso, "2026-11-04T07:52:00.000Z");
  assert.equal(result.choices[0].precision, "approximate_or_contextual");
  assert.equal(result.choices[1].iso, "2026-11-04T07:42:00.000Z");
});

test("an absent selected player has no copyable timestamp and never falls back to the board", () => {
  const context = selected("2026-11-20_0008", "id:8144154137");
  assert.equal(context.row, null);
  const result = timestampChoices(context);
  assert.deepEqual(result.choices, []);
  assert.match(result.message, /No photographed balance/);
});

test("a present player excluded from graph scale can still use their recorded time", () => {
  const result = timestampChoices(selected("2026-11-17_2350", "id:8144154137"));
  assert.equal(result.choices[0].iso, "2026-11-18T05:50:00.000Z");
});

test("clearing player selection explicitly uses the selected snapshot time", () => {
  const context = selected("2026-11-12_2258");
  context.selectedKey = null;
  context.row = null;
  const result = timestampChoices(context);
  assert.equal(result.choices[0].id, "snapshot");
  assert.equal(result.choices[0].iso, "2026-11-13T04:58:00.000Z");
});

test("a standout before-photo option uses the earlier player's observation", () => {
  const context = selected("2026-11-22_2213");
  context.previousRow = selected("2026-11-21_2214").row;
  const before = timestampChoices(context).choices.find(item => item.id === "before");
  assert.equal(before.iso, "2026-11-22T04:14:00.000Z");
});

test("invalid recorded balance time clears choices instead of substituting another time", () => {
  const context = selected("2026-11-12_2258");
  context.row = { ...context.row, at: "2026-02-30T12:00:00Z" };
  assert.deepEqual(timestampChoices(context).choices, []);
});

test("source precision is preserved for an approximate capture", () => {
  const result = timestampChoices(selected("2026-11-04_2100"));
  assert.equal(result.choices[0].iso, "2026-11-05T03:00:00.000Z");
  assert.match(result.choices[0].precision, /approximate/);
});

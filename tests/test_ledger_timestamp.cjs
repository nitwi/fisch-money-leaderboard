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

// Exercise the actual render/updateOutput path under real per-process device timezones.
// These minimal elements model only the DOM operations that the panel uses.
function renderPanelFixture(options) {
  const {render} = require("./site/ledger-timestamp.js");
  const fields = new Map();
  const node = {id: "fixture-stamp", dataset: {}, querySelector: selector => fields.get(selector)};
  const selectors = [".stamp-source", ".stamp-source-label", ".stamp-selection", ".stamp-feedback", ".stamp-copy", ".stamp-copy-raw", ".stamp-command", ".stamp-raw", ".stamp-local", ".stamp-description", ".stamp-precision", ".stamp-adjust", ".stamp-proofs"];
  for (const selector of selectors) fields.set(selector, {
    value: "", textContent: "", hidden: false, disabled: false, children: [],
    replaceChildren() { this.children = []; this.value = ""; },
    add(option) { this.children.push(option); if (this.children.length === 1) this.value = option.value; },
    append(child) { this.children.push(child); }
  });
  globalThis.Option = function (label, value) { this.label = label; this.value = value; };
  globalThis.document = {createElement: () => ({})};
  const iso = "2026-09-29T02:25:52.123Z";
  const context = {
    checkpoint: {id: "selected", day_key: "2026-09-28", at: iso},
    row: {key: "id:fixture", username: "fixture-player", rank: 2, at: iso, evidence: []},
    selectedKey: "id:fixture",
    ...options
  };
  render(node, context);
  const link = new URL(fields.get(".stamp-adjust").href, "https://example.test/");
  process.stdout.write(JSON.stringify({
    local: fields.get(".stamp-local").textContent,
    command: fields.get(".stamp-command").value,
    raw: fields.get(".stamp-raw").textContent,
    linkInstant: link.searchParams.get("instant"),
    linkZone: link.searchParams.get("zone"),
    disabled: fields.get(".stamp-copy").disabled,
    iso: node.dataset.iso
  }));
}

function renderedInDeviceZone(zone, options = {}) {
  const {spawnSync} = require("node:child_process");
  const result = spawnSync(process.execPath, ["-e", `(${renderPanelFixture.toString()})(${JSON.stringify(options)})`], {
    cwd: path.join(__dirname, ".."), env: {...process.env, TZ: zone}, encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function assertUnchangedInstant(rendered) {
  const iso = "2026-09-29T02:25:52.123Z";
  assert.equal(rendered.command, `latest:${iso}`);
  assert.equal(rendered.raw, iso);
  assert.equal(rendered.iso, iso);
  assert.equal(rendered.linkInstant, iso);
  assert.equal(rendered.disabled, false);
}

test("panel follows each viewer's local clock and calendar while UTC commands stay identical", () => {
  const scenarios = [
    ["America/Los_Angeles", "September 28, 2026 at 7:25:52.123 PM", "UTC−07:00"],
    ["Asia/Kathmandu", "September 29, 2026 at 8:10:52.123 AM", "UTC+05:45"],
    ["UTC", "September 29, 2026 at 2:25:52.123 AM", "UTC+00:00"]
  ];
  for (const [zone, clock, offset] of scenarios) {
    const rendered = renderedInDeviceZone(zone);
    assert.ok(rendered.local.startsWith(clock), rendered.local);
    assert.ok(rendered.local.includes(offset), rendered.local);
    // Some runtimes use the legacy Katmandu spelling for the same IANA zone.
    assert.ok(rendered.local.endsWith(rendered.linkZone), rendered.local);
    if (zone === "Asia/Kathmandu") assert.match(rendered.linkZone, /^Asia\/Kat[h]?mandu$/);
    else assert.equal(rendered.linkZone, zone);
    assertUnchangedInstant(rendered);
  }
});

test("panel uses the caller's explicit display zone and 24-hour preference in its adjustment link", () => {
  const rendered = renderedInDeviceZone("America/Los_Angeles", {displayTimeZone: "Europe/London", hour12: false});
  assert.equal(rendered.local, "September 29, 2026 at 03:25:52.123 · UTC+01:00 · Europe/London");
  assert.equal(rendered.linkZone, "Europe/London");
  assertUnchangedInstant(rendered);
});

test("invalid panel zone overrides fall back to the viewer without changing the observation", () => {
  const rendered = renderedInDeviceZone("Asia/Tokyo", {displayTimeZone: "Mars/Olympus"});
  assert.equal(rendered.local, "September 29, 2026 at 11:25:52.123 AM · UTC+09:00 · Asia/Tokyo");
  assert.equal(rendered.linkZone, "Asia/Tokyo");
  assertUnchangedInstant(rendered);
});

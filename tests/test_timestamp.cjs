"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const time = require("../site/time-utils.js");
const isoCandidates = (date, clock, zone, milliseconds) => time.resolveLocal(date, clock, zone, milliseconds).candidates.map(time.toUTC);

test("original command example converts from Chicago with UTC date rollover", () => {
  assert.deepEqual(isoCandidates("2026-09-28", "21:25:52", "America/Chicago"), ["2026-09-29T02:25:52.000Z"]);
  assert.equal(time.toUTC("latest:2026-09-29T02:25:52.000Z"), "2026-09-29T02:25:52.000Z");
});

test("winter and summer offsets are selected using the date", () => {
  assert.deepEqual(isoCandidates("2026-01-15", "21:25:52", "America/Chicago"), ["2026-01-16T03:25:52.000Z"]);
  assert.deepEqual(isoCandidates("2026-07-15", "21:25:52", "America/Chicago"), ["2026-07-16T02:25:52.000Z"]);
});

test("Chicago repeated hour has both UTC candidates and spring gap has none", () => {
  const folded = time.resolveLocal("2026-11-01", "01:30:00", "America/Chicago");
  assert.equal(folded.kind, "ambiguous");
  assert.deepEqual(folded.candidates.map(time.toUTC), ["2026-11-01T06:30:00.000Z", "2026-11-01T07:30:00.000Z"]);
  assert.equal(time.resolveLocal("2026-03-08", "02:30:00", "America/Chicago").kind, "gap");
  assert.deepEqual(isoCandidates("2026-03-08", "03:00:00", "America/Chicago"), ["2026-03-08T08:00:00.000Z"]);
});

test("loading an exact second-fold instant recovers its matching candidate", () => {
  const secondFold = time.parseISO("2026-11-01T07:30:00.321Z");
  const wall = time.partsAt(secondFold, "America/Chicago");
  assert.equal(wall.hour, 1);
  assert.equal(wall.millisecond, 321);
  const result = time.resolveLocal("2026-11-01", "01:30:00", "America/Chicago", wall.millisecond);
  assert.equal(result.candidates[1], secondFold);
});

test("half-hour daylight saving changes and a skipped calendar day", () => {
  assert.deepEqual(isoCandidates("2026-04-05", "01:45:00", "Australia/Lord_Howe"), ["2026-04-04T14:45:00.000Z", "2026-04-04T15:15:00.000Z"]);
  assert.equal(time.resolveLocal("2026-10-04", "02:15:00", "Australia/Lord_Howe").kind, "gap");
  assert.equal(time.resolveLocal("2011-12-30", "12:00:00", "Pacific/Apia").kind, "gap");
});

test("fractional UTC offsets and UTC calendar rollover", () => {
  assert.deepEqual(isoCandidates("2026-09-29", "08:10:52", "Asia/Kathmandu"), ["2026-09-29T02:25:52.000Z"]);
  assert.deepEqual(isoCandidates("2026-09-29", "00:15:00", "Asia/Kolkata"), ["2026-09-28T18:45:00.000Z"]);
  assert.equal(time.toUTC("2026-09-29T08:10:52.123+05:45"), "2026-09-29T02:25:52.123Z");
  assert.equal(time.toUTC("2026-09-28T21:25:52-05:00"), "2026-09-29T02:25:52.000Z");
});

test("invalid calendar dates, missing offsets and malformed input are rejected", () => {
  for (const text of ["", "2026-02-29T12:00:00Z", "2026-04-31T12:00:00Z", "2026-13-01T12:00:00Z", "2026-09-29", "2026-09-29T02:25:52", "2026-09-29T24:00:00Z", "2026-09-29T02:60:00Z", "2026-09-29T02:25:60Z", "2026-09-29T02:25:52+24:00", "2026-09-29T02:25:52+05:60", "2026-09-29T02:25:52-00:00", "2026-09-29T02:25:52.1234Z", "unrelated latest:2026-09-29T02:25:52Z", "2026-09-29T02:25:52Z trailing"]) assert.equal(time.parseISO(text), null, text);
  assert.equal(time.resolveLocal("2026-02-29", "12:00:00", "UTC").kind, "invalid");
  assert.equal(time.resolveLocal("2026-09-29", "25:00:00", "UTC").kind, "invalid");
  assert.equal(time.resolveLocal("2026-09-29", "12:00:00", "Mars/Olympus").kind, "invalid");
  assert.equal(time.toUTC(null), null);
  assert.equal(time.toUTC(NaN), null);
});

test("leap years and early years retain zero padding without 1900 coercion", () => {
  assert.deepEqual(isoCandidates("2024-02-29", "12:00:00", "UTC"), ["2024-02-29T12:00:00.000Z"]);
  assert.deepEqual(isoCandidates("0001-01-01", "12:00:00", "UTC"), ["0001-01-01T12:00:00.000Z"]);
  assert.deepEqual(isoCandidates("0099-03-15", "12:00:00", "UTC"), ["0099-03-15T12:00:00.000Z"]);
  assert.equal(time.toUTC("0099-03-15T12:00:00Z"), "0099-03-15T12:00:00.000Z");
});

test("milliseconds are normalized and preserved in local display", () => {
  assert.equal(time.toUTC("2026-09-29T02:25:52.1Z"), "2026-09-29T02:25:52.100Z");
  assert.equal(time.toUTC("2026-09-29T02:25:52.12Z"), "2026-09-29T02:25:52.120Z");
  assert.match(time.formatLocal("2026-09-29T02:25:52.123Z", "America/Chicago"), /9:25:52\.123 PM/);
  assert.match(time.formatLocal("2026-09-29T02:25:52.123Z", "America/Chicago", false), /21:25:52\.123/);
  assert.match(time.formatLocal("2026-09-29T02:25:52Z", "America/Chicago"), /UTC−05:00/);
});

test("valid IANA aliases remain valid and ambiguous abbreviations do not", () => {
  assert.equal(time.isValidTimeZone("US/Central"), true);
  assert.equal(time.isValidTimeZone("Asia/Katmandu"), true);
  assert.equal(time.isValidTimeZone("UTC"), true);
  assert.equal(time.isValidTimeZone("CST"), false);
  assert.equal(time.isValidTimeZone(""), false);
});

function timeWithDeviceZone(detectedZone, detectionThrows = false) {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const path = require("node:path");
  const sandbox = {
    module: {exports: {}},
    Intl: {
      DateTimeFormat: function (locale, options) {
        if (arguments.length === 0) {
          if (detectionThrows) throw new Error("Device zone unavailable");
          return {resolvedOptions: () => ({timeZone: detectedZone})};
        }
        return new Intl.DateTimeFormat(locale, options);
      }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../site/time-utils.js"), "utf8"), sandbox);
  return sandbox.module.exports;
}

test("viewer timezone accepts a valid explicit override and otherwise follows the device", () => {
  const localTime = timeWithDeviceZone("America/Los_Angeles");
  assert.equal(localTime.viewerTimeZone(), "America/Los_Angeles");
  assert.equal(localTime.viewerTimeZone("Asia/Kathmandu"), "Asia/Kathmandu");
  assert.equal(localTime.viewerTimeZone("Mars/Olympus"), "America/Los_Angeles");
  assert.equal(localTime.viewerTimeZone("CST"), "America/Los_Angeles");
  assert.match(localTime.formatLocal("2026-09-29T02:25:52Z"), /September 28, 2026 at 7:25:52 PM.*America\/Los_Angeles$/);
});

test("viewer timezone falls back safely when device zone detection is missing or throws", () => {
  assert.equal(timeWithDeviceZone(undefined).viewerTimeZone(), "UTC");
  assert.equal(timeWithDeviceZone("CST").viewerTimeZone(), "UTC");
  const noDetection = timeWithDeviceZone(null, true);
  assert.equal(noDetection.viewerTimeZone(), "UTC");
  assert.equal(noDetection.viewerTimeZone("Europe/London"), "Europe/London");
  assert.match(noDetection.formatLocal("2026-09-29T02:25:52Z"), /September 29, 2026 at 2:25:52 AM.*UTC$/);
});

function initializeGenerator(search, savedZone) {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const path = require("node:path");
  function element(value = "") {
    let storedValue = String(value);
    return {
      get value() { return storedValue; }, set value(next) { storedValue = String(next); },
      textContent: "", dataset: {}, children: [], style: {},
      classList: {toggle() {}}, setAttribute() {}, addEventListener() {}, focus() {},
      append(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; this.value = children[0]?.value || ""; },
      add(option) { this.children.push(option); if (this.children.length === 1) this.value = option.value; }
    };
  }
  const html = fs.readFileSync(path.join(__dirname, "../site/timestamp.html"), "utf8");
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], element()]));
  nodes.get("prefix").value = "latest:";
  nodes.get("millisecond").value = "0";
  nodes.get("period").value = "AM";
  const copies = new Map(["command", "raw", "decoded"].map(id => [id, element()]));
  const clock = element();
  const saved = new Map([["fisch-timestamp-zone", savedZone], ["fisch-timestamp-format", "24"]]);
  const writes = [];
  const sandbox = {
    window: {FischTime: timeWithDeviceZone("America/Los_Angeles")},
    document: {
      getElementById: id => nodes.get(id),
      createElement: () => element(),
      querySelector: selector => selector === ".ts-clock" ? clock : copies.get(selector.match(/data-copy="([^"]+)"/)?.[1]),
      querySelectorAll: () => [...copies.values()]
    },
    localStorage: {getItem: key => saved.get(key) || null, setItem: (key, value) => { writes.push([key, value]); saved.set(key, value); }},
    location: {search}, URLSearchParams, Intl, setTimeout, clearTimeout,
    Option: function (label, value) { this.label = label; this.value = value; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../site/timestamp.js"), "utf8"), sandbox);
  return {nodes, saved, writes};
}

test("linked generator zone and instant override saved display preferences without saving imports", () => {
  const iso = "2026-09-29T02:25:52.123Z";
  const linked = initializeGenerator(`?${new URLSearchParams({instant: iso, zone: "Europe/London"})}`, "America/Chicago");
  assert.equal(linked.nodes.get("zone").value, "Europe/London");
  assert.equal(linked.nodes.get("time-format").value, "24");
  assert.equal(linked.nodes.get("date").value, "2026-09-29");
  assert.equal(linked.nodes.get("hour").value, "3");
  assert.equal(linked.nodes.get("command").value, `latest:${iso}`);
  assert.equal(linked.saved.get("fisch-timestamp-zone"), "America/Chicago");
  assert.equal(linked.saved.get("fisch-timestamp-format"), "24");
  assert.deepEqual(linked.writes, []);

  const direct = initializeGenerator("", "America/Chicago");
  assert.equal(direct.nodes.get("zone").value, "America/Chicago");
  assert.deepEqual(direct.writes, []);
  const invalidSaved = initializeGenerator("", "Mars/Olympus");
  assert.equal(invalidSaved.nodes.get("zone").value, "America/Los_Angeles");
});

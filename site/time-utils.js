/* Shared browser/Node time helpers. No date strings are parsed in the device timezone. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FischTime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const formatters = new Map();
  const HOUR = 3600000;
  const pad = (value, width = 2) => String(value).padStart(width, "0");

  function utcFromFields(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, millisecond);
    return date.getTime();
  }

  function validFields(year, month, day, hour, minute, second, millisecond = 0) {
    const values = [year, month, day, hour, minute, second, millisecond];
    if (!values.every(Number.isInteger) || year < 1 || year > 9999 || month < 1 || month > 12 ||
        day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 ||
        second < 0 || second > 59 || millisecond < 0 || millisecond > 999) return false;
    const check = new Date(utcFromFields(...values));
    return check.getUTCFullYear() === year && check.getUTCMonth() + 1 === month && check.getUTCDate() === day;
  }

  // ISO calendar timestamps only. Date-only, rolled-over dates and offset-free inputs are rejected.
  function parseISO(text) {
    if (typeof text !== "string") return null;
    const match = text.trim().match(/^(?:[a-z][a-z0-9_-]*:\s*)?(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/i);
    if (!match) return null;
    const fields = match.slice(1, 7).map(Number);
    const milliseconds = Number((match[7] || "").padEnd(3, "0"));
    if (!validFields(...fields, milliseconds)) return null;
    const offset = match[8].toUpperCase();
    let offsetMinutes = 0;
    if (offset !== "Z") {
      const hours = Number(offset.slice(1, 3)), minutes = Number(offset.slice(4, 6));
      if (hours > 23 || minutes > 59 || offset === "-00:00") return null;
      offsetMinutes = (hours * 60 + minutes) * (offset[0] === "+" ? 1 : -1);
    }
    const epoch = utcFromFields(...fields, milliseconds) - offsetMinutes * 60000;
    const year = new Date(epoch).getUTCFullYear();
    return Number.isFinite(epoch) && year >= 1 && year <= 9999 ? epoch : null;
  }

  function instant(value) {
    const epoch = typeof value === "string" ? parseISO(value) : value instanceof Date ? value.getTime() : value;
    if (typeof epoch !== "number" || !Number.isFinite(epoch)) return null;
    const date = new Date(epoch), year = date.getUTCFullYear();
    return Number.isFinite(date.getTime()) && year >= 1 && year <= 9999 ? date.getTime() : null;
  }

  function toUTC(value) {
    const epoch = instant(value);
    return epoch === null ? null : new Date(epoch).toISOString();
  }

  function isValidTimeZone(zone) {
    // Short names such as CST are ambiguous. Accept UTC and region-based IANA identifiers.
    if (typeof zone !== "string" || (zone !== "UTC" && !zone.includes("/"))) return false;
    try { new Intl.DateTimeFormat("en", {timeZone: zone}).format(0); return true; }
    catch { return false; }
  }

  function zoneFormatter(zone) {
    if (!formatters.has(zone)) {
      formatters.set(zone, new Intl.DateTimeFormat("en-GB-u-ca-gregory-nu-latn", {
        timeZone: zone, era: "short", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
      }));
    }
    return formatters.get(zone);
  }

  function partsAt(value, zone) {
    const epoch = typeof value === "number" ? value : instant(value);
    if (epoch === null || !Number.isFinite(epoch) || !isValidTimeZone(zone)) return null;
    const parts = Object.fromEntries(zoneFormatter(zone).formatToParts(epoch).map(part => [part.type, part.value]));
    const year = parts.era === "BC" ? 1 - Number(parts.year) : Number(parts.year);
    return {year, month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour),
      minute: Number(parts.minute), second: Number(parts.second), millisecond: ((epoch % 1000) + 1000) % 1000};
  }

  function offsetAt(epoch, zone) {
    const part = partsAt(epoch, zone);
    return utcFromFields(part.year, part.month, part.day, part.hour, part.minute, part.second, part.millisecond) - epoch;
  }

  function offsetLabel(epoch, zone) {
    const offset = offsetAt(epoch, zone), seconds = Math.abs(offset) / 1000;
    return "UTC" + (offset >= 0 ? "+" : "−") + pad(Math.floor(seconds / 3600)) + ":" +
      pad(Math.floor(seconds / 60) % 60) + (seconds % 60 ? ":" + pad(seconds % 60) : "");
  }

  function formatLocal(value, zone = "America/Chicago", hour12 = true) {
    const epoch = instant(value);
    if (epoch === null || !isValidTimeZone(zone)) return "";
    const part = partsAt(epoch, zone);
    const date = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, year: "numeric", month: "long", day: "numeric"
    }).format(epoch);
    const hour = hour12 ? part.hour % 12 || 12 : pad(part.hour);
    const time = `${hour}:${pad(part.minute)}:${pad(part.second)}${part.millisecond ? "." + pad(part.millisecond, 3) : ""}${hour12 ? part.hour < 12 ? " AM" : " PM" : ""}`;
    return `${date} at ${time} · ${offsetLabel(epoch, zone)} · ${zone}`;
  }

  function resolveLocal(date, time, zone, milliseconds = 0) {
    const invalid = message => ({kind: "invalid", candidates: [], message});
    if (!isValidTimeZone(zone)) return invalid("Choose a valid IANA timezone, such as America/Chicago.");
    const day = typeof date === "string" && date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const clock = typeof time === "string" && time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!day || !clock) return invalid("Enter a complete date and time.");
    const fields = [...day.slice(1).map(Number), Number(clock[1]), Number(clock[2]), Number(clock[3] || 0), milliseconds];
    if (!validFields(...fields)) return invalid("Enter a valid calendar date and time.");
    const wall = utcFromFields(...fields), offsets = new Set();
    // Inspect both sides of nearby timezone transitions, including half-hour and date-line changes.
    for (let hours = -48; hours <= 48; hours += 3) offsets.add(offsetAt(wall + hours * HOUR, zone));
    const candidates = [...offsets].map(offset => wall - offset).filter(epoch => {
      if (instant(epoch) === null) return false;
      const p = partsAt(epoch, zone);
      return [p.year, p.month, p.day, p.hour, p.minute, p.second, p.millisecond].every((field, index) => field === fields[index]);
    }).sort((a, b) => a - b);
    if (!candidates.length) return {kind: "gap", candidates, message: "This local time does not exist because the clocks move forward. Choose a time outside the skipped interval."};
    if (candidates.length > 1) return {kind: "ambiguous", candidates, message: "This local time occurs twice when the clocks move back. Choose which occurrence you mean."};
    return {kind: "unique", candidates, message: ""};
  }

  return Object.freeze({parseISO, toUTC, formatLocal, isValidTimeZone, partsAt, resolveLocal});
});

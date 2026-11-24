(function () {
  "use strict";
  const time = window.FischTime;
  const byId = id => document.getElementById(id);
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  const preference = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ } }
  };
  const zoneInput = byId("zone"), formatInput = byId("time-format");
  const copyTimers = new WeakMap();
  let currentEpoch = null, decodedEpoch = null, chosenOccurrence = "", occurrenceSignature = "";
  let hour12 = preference.get("fisch-timestamp-format") !== "24";
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const saved = preference.get("fisch-timestamp-zone");
  const params = new URLSearchParams(location.search);
  const requestedZone = params.get("zone");
  zoneInput.value = time.isValidTimeZone(requestedZone) ? requestedZone : time.isValidTimeZone(saved) ? saved : time.isValidTimeZone(detected) ? detected : "UTC";
  formatInput.value = hour12 ? "12" : "24";

  const commonZones = {
    "UTC": "Coordinated Universal Time",
    "America/Chicago": "Central Time · Chicago",
    "America/New_York": "Eastern Time · New York",
    "America/Denver": "Mountain Time · Denver",
    "America/Phoenix": "Arizona · Phoenix",
    "America/Los_Angeles": "Pacific Time · Los Angeles",
    "Europe/London": "United Kingdom · London",
    "Europe/Berlin": "Central Europe · Berlin",
    "Asia/Kolkata": "India · Kolkata",
    "Asia/Kathmandu": "Nepal · Kathmandu",
    "Asia/Manila": "Philippines · Manila",
    "Australia/Sydney": "Australia · Sydney",
    "Australia/Lord_Howe": "Australia · Lord Howe",
    "Pacific/Auckland": "New Zealand · Auckland"
  };
  let available = [];
  try { available = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []; }
  catch { /* Common IANA choices still work if enumeration is unavailable. */ }
  const zones = [...new Set([...Object.keys(commonZones), zoneInput.value, ...available])].sort();
  for (const zone of zones) {
    const option = document.createElement("option");
    option.value = zone;
    if (commonZones[zone]) option.label = commonZones[zone];
    byId("timezone-options").append(option);
  }

  function configureClock() {
    byId("hour").min = hour12 ? "1" : "0";
    byId("hour").max = hour12 ? "12" : "23";
    byId("period-field").hidden = !hour12;
    document.querySelector(".ts-clock").classList.toggle("is-24", !hour12);
  }

  function formHour(is12 = hour12) {
    const value = byId("hour").value;
    if (value === "") return null;
    const hour = Number(value);
    if (!Number.isInteger(hour) || hour < (is12 ? 1 : 0) || hour > (is12 ? 12 : 23)) return null;
    return is12 ? hour % 12 + (byId("period").value === "PM" ? 12 : 0) : hour;
  }

  function readWallTime() {
    const hour = formHour();
    const numeric = ["minute", "second", "millisecond"].map(id => byId(id).value === "" ? null : Number(byId(id).value));
    if (hour === null || numeric.some(value => value === null || !Number.isInteger(value))) return null;
    return {clock: `${pad(hour)}:${pad(numeric[0])}:${pad(numeric[1])}`, millisecond: numeric[2]};
  }

  function writeInstant(epoch) {
    const zone = zoneInput.value.trim();
    if (!time.isValidTimeZone(zone)) {
      byId("status").textContent = "Choose a valid timezone before using a timestamp.";
      return;
    }
    const part = time.partsAt(epoch, zone);
    byId("date").value = `${pad(part.year, 4)}-${pad(part.month)}-${pad(part.day)}`;
    byId("hour").value = hour12 ? part.hour % 12 || 12 : part.hour;
    byId("minute").value = pad(part.minute);
    byId("second").value = pad(part.second);
    byId("period").value = part.hour < 12 ? "AM" : "PM";
    byId("millisecond").value = part.millisecond;
    if (part.millisecond) byId("advanced").open = true;
    // Retain the instant, including the second occurrence of a repeated local hour.
    chosenOccurrence = String(epoch);
    render();
  }

  function setOutput(id, value) {
    const element = byId(id);
    if ("value" in element) element.value = value || "";
    else element.textContent = value || (id === "decoded" ? "Paste a timestamp to convert it." : "—");
    const copy = document.querySelector(`[data-copy="${id}"]`);
    if (copy) copy.disabled = !value;
  }

  function clearOutputs() {
    currentEpoch = null;
    setOutput("raw", ""); setOutput("command", "");
    byId("local-preview").textContent = "—";
    byId("utc-preview").textContent = "—";
  }

  function render() {
    byId("copy-status").textContent = "";
    const zone = zoneInput.value.trim(), wall = readWallTime();
    const validZone = time.isValidTimeZone(zone);
    zoneInput.setAttribute("aria-invalid", String(!validZone));
    const result = wall ? time.resolveLocal(byId("date").value, wall.clock, zone, wall.millisecond) :
      {kind: "invalid", candidates: [], message: "Enter a complete date and time; hours, minutes and seconds must be whole numbers."};
    const signature = result.candidates.join(",");
    if (signature !== occurrenceSignature) {
      const select = byId("occurrence");
      select.replaceChildren(new Option("Choose first or second occurrence", ""));
      result.candidates.forEach((epoch, index) => {
        select.add(new Option(`${index === 0 ? "First" : "Second"} occurrence · ${time.toUTC(epoch)}`, String(epoch)));
      });
      occurrenceSignature = signature;
    }
    byId("ambiguity").hidden = result.kind !== "ambiguous";
    byId("occurrence").value = result.candidates.some(epoch => String(epoch) === chosenOccurrence) ? chosenOccurrence : "";
    const candidate = result.kind === "unique" ? result.candidates[0] :
      result.kind === "ambiguous" && byId("occurrence").value !== "" ? Number(byId("occurrence").value) : null;
    byId("status").textContent = candidate === null ? result.message : "";
    if (candidate === null) clearOutputs();
    else {
      currentEpoch = candidate;
      const utc = time.toUTC(candidate);
      setOutput("raw", utc);
      setOutput("command", byId("prefix").value + utc);
      byId("local-preview").textContent = time.formatLocal(candidate, zone, hour12);
      byId("utc-preview").textContent = time.formatLocal(candidate, "UTC", hour12);
    }
    decode();
  }

  function decode() {
    const input = byId("reverse").value.trim(), zone = zoneInput.value.trim();
    const parsed = time.parseISO(input);
    decodedEpoch = parsed !== null && time.isValidTimeZone(zone) ? parsed : null;
    const decoded = decodedEpoch === null ? "" : time.formatLocal(decodedEpoch, zone, hour12);
    setOutput("decoded", decoded);
    byId("use-decoded").disabled = decodedEpoch === null;
    byId("reverse-status").textContent = !input ? "" : parsed === null ?
      "Use a valid ISO timestamp with Z or a known numeric offset, for example 2026-09-29T02:25:52.000Z. Optional prefixes such as latest: are accepted." :
      !time.isValidTimeZone(zone) ? "Choose a valid timezone to display this timestamp." : "";
    if (input && decodedEpoch === null) byId("decoded").textContent = "No conversion available.";
  }

  for (const id of ["date", "hour", "minute", "second", "period", "millisecond"]) {
    byId(id).addEventListener("input", () => {
      chosenOccurrence = ""; // A changed wall time needs a fresh explicit DST choice.
      byId("import-note").hidden = true;
      render();
    });
  }
  byId("prefix").addEventListener("input", render);
  byId("occurrence").addEventListener("change", () => { chosenOccurrence = byId("occurrence").value; render(); });
  zoneInput.addEventListener("input", () => { chosenOccurrence = ""; render(); });
  zoneInput.addEventListener("change", () => {
    const zone = zoneInput.value.trim();
    if (time.isValidTimeZone(zone)) { zoneInput.value = zone; preference.set("fisch-timestamp-zone", zone); }
    render();
  });
  formatInput.addEventListener("change", () => {
    const hour = formHour();
    hour12 = formatInput.value === "12";
    configureClock();
    if (hour !== null) {
      byId("hour").value = hour12 ? hour % 12 || 12 : hour;
      byId("period").value = hour < 12 ? "AM" : "PM";
    }
    preference.set("fisch-timestamp-format", formatInput.value);
    render();
  });
  byId("now").addEventListener("click", () => {
    byId("import-note").hidden = true;
    writeInstant(Math.floor(Date.now() / 1000) * 1000);
  });
  byId("reverse").addEventListener("input", () => { byId("copy-status").textContent = ""; decode(); });
  byId("use-decoded").addEventListener("click", () => {
    if (decodedEpoch !== null) {
      writeInstant(decodedEpoch);
      byId("import-note").hidden = false;
      byId("import-note").textContent = "Loaded the pasted timestamp into the generator. Its exact instant and milliseconds are preserved.";
      byId("date").focus();
    }
  });

  async function copyOutput(button) {
    const target = byId(button.dataset.copy), value = "value" in target ? target.value : target.textContent;
    if (!value || button.disabled) return;
    const stillCurrent = () => !button.disabled && ("value" in target ? target.value : target.textContent) === value;
    let copied = false;
    try { await navigator.clipboard.writeText(value); copied = true; }
    catch {
      if (!stillCurrent()) return;
      // Selection remains available when browser clipboard permissions are restricted.
      const helper = document.createElement("textarea");
      helper.value = value; helper.setAttribute("readonly", "");
      helper.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.append(helper); helper.select();
      try { copied = document.execCommand("copy"); } catch { /* Manual fallback below. */ }
      helper.remove(); button.focus();
    }
    if (!stillCurrent()) return;
    byId("copy-status").textContent = copied ? "Copied to clipboard." : "Automatic copying is unavailable. Select and copy the displayed timestamp manually.";
    if (!copied && typeof target.select === "function") { target.focus(); target.select(); }
    if (copied) {
      if (!button.dataset.copyLabel) button.dataset.copyLabel = button.textContent;
      clearTimeout(copyTimers.get(button));
      button.textContent = "Copied!";
      copyTimers.set(button, setTimeout(() => { button.textContent = button.dataset.copyLabel; }, 1600));
    }
  }
  document.querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", () => copyOutput(button)));

  configureClock();
  const requestedInstant = params.get("instant");
  if (requestedInstant !== null) {
    const epoch = time.parseISO(requestedInstant);
    byId("import-note").hidden = false;
    if (epoch !== null) {
      writeInstant(epoch);
      byId("import-note").textContent = "Loaded the selected ledger photo time. You can copy it as recorded or adjust the date and time below.";
    } else {
      render();
      byId("import-note").textContent = "The linked timestamp is invalid. Choose a date and time below; no timestamp has been substituted.";
    }
  } else writeInstant(Math.floor(Date.now() / 1000) * 1000);
})();

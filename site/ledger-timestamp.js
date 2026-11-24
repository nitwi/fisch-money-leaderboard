(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./time-utils.js"));
  } else {
    root.FischTimestampPanel = factory(root.FischTime);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (time) {
  "use strict";

  // These are observation instants, never dates reconstructed from a chart label.
  function timestampChoices(context) {
    const { checkpoint, row, selectedKey, playerName, previousRow, captures = [] } = context;
    const choices = [];
    if (!checkpoint) return { choices, message: "Select a photographed point to generate a command." };
    if (selectedKey && !row) {
      return { choices, message: `No photographed balance for ${playerName || "this player"} on this selected day. Choose one of their plotted points.` };
    }
    function add(id, label, at, evidence, precision, description) {
      const iso = time.toUTC(at);
      if (iso) choices.push({ id, label, iso, evidence: evidence || [], precision: precision || "", description });
    }
    function precisionFor(reading) {
      return captures.find(capture => capture.id === reading.source_checkpoint)?.precision || checkpoint.precision;
    }
    if (row) {
      add("balance", row.profile_update ? "Selected balance · later profile photo" : "Selected balance photo", row.at,
        row.balance_evidence || row.evidence, row.profile_update ? "profile-photo" : precisionFor(row),
        row.profile_update ? "This plotted balance comes from the later player-profile photo." : "This is the recorded photo time for the selected balance.");
      if (!choices.length) return { choices, message: "This balance has no valid recorded timestamp." };
      if (row.board_at && time.toUTC(row.board_at) !== choices[0].iso) {
        add("rank", "Earlier rank / board photo", row.board_at, row.evidence, "board-photo",
          "This earlier photo establishes the player's rank and board balance.");
      }
      const anchor = time.toUTC(checkpoint.at);
      if (anchor && !choices.some(choice => choice.iso === anchor)) {
        add("snapshot", "Whole snapshot · session time", checkpoint.at, checkpoint.primary_evidence, checkpoint.precision,
          "This is the whole snapshot's recorded session time, separate from the selected player's photo time.");
      }
      if (previousRow) {
        add("before", "Before photo · previous balance", previousRow.at, previousRow.balance_evidence || previousRow.evidence,
          previousRow.profile_update ? "profile-photo" : precisionFor(previousRow), "This is the earlier balance photo used in the selected comparison.");
      }
    } else {
      add("snapshot", "Selected snapshot · session time", checkpoint.at, checkpoint.primary_evidence, checkpoint.precision,
        "Choose a player's plotted point to use that balance's photo time.");
    }
    return { choices, message: choices.length ? "" : "This snapshot has no valid recorded timestamp." };
  }

  function setup(node) {
    const id = node.id || "point-timestamp";
    node.innerHTML = `
      <div class="stamp-heading"><div><p class="stamp-kicker">MODERATOR TOOL</p><h3>Command timestamp</h3></div><a class="stamp-adjust" href="timestamp.html">Choose another time</a></div>
      <p class="stamp-selection"></p>
      <label class="stamp-source-label" for="${id}-source">Use time from</label>
      <select id="${id}-source" class="stamp-source"></select>
      <p class="stamp-local" aria-live="polite"></p>
      <p class="stamp-description"></p>
      <label class="stamp-command-label" for="${id}-command">Paste into your command</label>
      <div class="stamp-command-row"><textarea id="${id}-command" class="stamp-command" readonly rows="2" spellcheck="false" aria-label="Command timestamp to copy"></textarea><button type="button" class="stamp-copy">Copy latest: timestamp</button></div>
      <div class="stamp-raw-row"><span>UTC <code class="stamp-raw"></code></span><button type="button" class="stamp-copy-raw">Copy UTC only</button></div>
      <p class="stamp-precision"></p><div class="stamp-proofs"></div><p class="stamp-feedback" role="status" aria-live="polite"></p>`;
    node.querySelector(".stamp-source").addEventListener("change", () => updateOutput(node));
    node.querySelector(".stamp-command").addEventListener("click", event => event.currentTarget.select());
    for (const [selector, rawOnly] of [[".stamp-copy", false], [".stamp-copy-raw", true]]) {
      node.querySelector(selector).addEventListener("click", async () => {
        const choice = node.stampChoices.find(item => item.id === node.querySelector(".stamp-source").value);
        if (!choice) return;
        const value = rawOnly ? choice.iso : `latest:${choice.iso}`;
        const button = node.querySelector(selector);
        try {
          if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(value);
          // A completed clipboard write must never describe a newly selected point.
          if (node.querySelector(".stamp-command").value !== `latest:${choice.iso}`) return;
          node.querySelector(".stamp-feedback").textContent = rawOnly ? "UTC timestamp copied." : "Command timestamp copied. Ready to paste.";
          button.textContent = "Copied";
        } catch {
          const field = node.querySelector(".stamp-command");
          field.focus();
          field.setSelectionRange(rawOnly ? "latest:".length : 0, field.value.length);
          node.querySelector(".stamp-feedback").textContent = `Clipboard access is unavailable. The ${rawOnly ? "UTC timestamp" : "command"} is selected; copy it with your keyboard or touch menu.`;
        }
      });
    }
  }

  function updateOutput(node) {
    const choice = node.stampChoices.find(item => item.id === node.querySelector(".stamp-source").value);
    const context = node.stampContext;
    node.querySelector(".stamp-feedback").textContent = "";
    node.querySelector(".stamp-copy").textContent = "Copy latest: timestamp";
    node.querySelector(".stamp-copy-raw").textContent = "Copy UTC only";
    node.querySelector(".stamp-copy").disabled = !choice;
    node.querySelector(".stamp-copy-raw").disabled = !choice;
    node.querySelector(".stamp-command").value = choice ? `latest:${choice.iso}` : "";
    node.querySelector(".stamp-command").placeholder = "Select a photographed point";
    node.querySelector(".stamp-raw").textContent = choice?.iso || "—";
    node.querySelector(".stamp-local").textContent = choice ? time.formatLocal(choice.iso, "America/Chicago", true) : "No timestamp available";
    node.querySelector(".stamp-description").textContent = choice?.description || node.stampMessage;
    const precision = choice?.precision || "";
    const precisionText = /approximate|contextual/i.test(precision) ? "Source time is approximate; the command preserves the recorded time." :
      precision === "screenshot-filename-minute" ? "Source time was recorded to the minute." :
      precision === "user-supplied" ? "Time recorded from the owner's capture time." : "";
    const precisionNode = node.querySelector(".stamp-precision");
    precisionNode.textContent = precisionText;
    precisionNode.hidden = !precisionText;
    const adjust = node.querySelector(".stamp-adjust");
    adjust.href = choice ? `timestamp.html?${new URLSearchParams({ instant: choice.iso, zone: "America/Chicago" })}` : "timestamp.html";
    adjust.textContent = choice ? "Adjust date / time" : "Choose another time";
    const proofNode = node.querySelector(".stamp-proofs");
    proofNode.replaceChildren();
    for (const id of choice?.evidence || []) {
      const proof = context.proofs?.get(id);
      if (!proof) continue;
      const link = document.createElement("a");
      link.href = encodeURI(proof.url).replaceAll("#", "%23");
      link.textContent = `Source ${id}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      proofNode.append(link);
    }
    node.dataset.iso = choice?.iso || "";
    node.dataset.source = choice?.id || "";
  }

  function render(node, context) {
    if (!node || !time) return;
    if (!node.querySelector(".stamp-source")) setup(node);
    const identity = `${context.checkpoint?.id || ""}/${context.selectedKey || ""}`;
    const oldChoice = identity === node.stampIdentity ? node.querySelector(".stamp-source").value : "";
    const result = timestampChoices(context);
    node.stampIdentity = identity;
    node.stampContext = context;
    node.stampChoices = result.choices;
    node.stampMessage = result.message;
    const select = node.querySelector(".stamp-source");
    select.replaceChildren();
    for (const choice of result.choices) select.add(new Option(choice.label, choice.id));
    if (result.choices.some(choice => choice.id === oldChoice)) select.value = oldChoice;
    select.hidden = result.choices.length < 2;
    node.querySelector(".stamp-source-label").hidden = select.hidden;
    const day = context.checkpoint?.day_key || "";
    node.querySelector(".stamp-selection").textContent = context.row ?
      `${context.playerName || context.row.username} · ${day} leaderboard day · pictured rank #${context.row.rank}` :
      context.selectedKey ? `${context.playerName || "Selected player"} · ${day}` : `${day} leaderboard day · selected snapshot`;
    updateOutput(node);
  }

  return { timestampChoices, render };
});

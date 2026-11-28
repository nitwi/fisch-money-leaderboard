(function (global, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    global.FischNetworkFocus = api;
    if (global.document) api.start(global);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function label(person) {
    if (person && typeof person.username === "string" && person.username.trim())
      return "@" + person.username;
    // Display names are not Roblox usernames. Mark them clearly instead of
    // turning one into a guessed @handle or showing an avoidable numeric ID.
    const alias = Array.isArray(person?.aliases) ?
      person.aliases.find(value => typeof value === "string" && /^[A-Za-z0-9_]{1,20}$/.test(value)) : null;
    if (alias) return "@" + alias + " (previously observed)";
    if (person && typeof person.display_name === "string" && person.display_name.trim())
      return person.display_name + " (display name)";
    return "ID " + (person && person.id || "unknown");
  }
  function applyVerifiedUsernames(network, overlay, core) {
    if (!network?.nodes || overlay?.schema_version !== 1 ||
        !["https://users.roblox.com/v1/users", "roblox_verified_profile_and_prior_api"].includes(overlay?.source_url) ||
        !overlay.users || typeof overlay.users !== "object" || Array.isArray(overlay.users)) return 0;
    let changed = 0;
    for (const [key, record] of Object.entries(overlay.users)) {
      const id = core.normalizeId(key);
      if (id !== key || !record || typeof record !== "object" ||
          core.normalizeId(record.id) !== id ||
          !(record.source_url === "https://users.roblox.com/v1/users" ||
            record.source_url === `https://www.roblox.com/users/${id}/profile`) ||
          !Number.isFinite(Date.parse(record.observed_at || ""))) continue;
      const username = record.username;
      if (typeof username !== "string" || !/^[A-Za-z0-9_]{1,20}$/.test(username)) continue;
      const person = network.nodes.get(id);
      if (!person || person.ledger || (typeof person.username === "string" && person.username.trim())) continue;
      const display = typeof record.display_name === "string" && record.display_name.length <= 80 ? record.display_name : "";
      network.nodes.set(id, {...person, username,
        display_name: person.display_name || display,
        username_observed_at: record.observed_at,
        username_source_url: record.source_url});
      changed++;
    }
    return changed;
  }
  // The leaderboard and social-census snapshots are updated separately.
  // Reconcile ranks by exact stable Roblox IDs from a small, photo-verified
  // overlay emitted alongside each site publication. Never infer identities,
  // and never change the actual social edges or observation timestamps.
  function applyLeaderboardRanks(accounts, overlay, previousCheckpoint, core) {
    if (!Array.isArray(accounts) || overlay?.schema_version !== 1 ||
        overlay?.source !== "photo_verified_ledger" ||
        overlay?.checkpoint?.complete !== true ||
        overlay?.verified_rank_slots !== 50 ||
        !Array.isArray(overlay.entries) || !overlay.entries.length || overlay.entries.length > 50) return null;
    const incoming = Date.parse(overlay.checkpoint.at || "");
    const previous = Date.parse(previousCheckpoint?.at || "");
    if (!Number.isFinite(incoming) || (Number.isFinite(previous) && incoming < previous) ||
        typeof overlay.checkpoint.id !== "string" || !overlay.checkpoint.id.trim()) return null;
    const byId = new Map(), usedRanks = new Set();
    for (const row of overlay.entries) {
      const id = core.normalizeId(row?.id);
      const number = row?.rank;
      if (!id || String(row.id) !== id ||
          !Number.isInteger(number) || number < 1 || number > 50 ||
          byId.has(id) || usedRanks.has(number)) return null;
      if (row.username !== undefined && (typeof row.username !== "string" ||
          (row.username && !/^[A-Za-z0-9_]{1,20}$/.test(row.username)))) return null;
      byId.set(id, row); usedRanks.add(number);
    }
    let added = 0;
    const existing = new Set();
    for (const account of accounts) {
      existing.add(account.id);
      const current = byId.get(account.id);
      account.latest_rank = current ? current.rank : null;
      if (current) {
        account.ledger = true;
        account.last_seen_day = overlay.checkpoint.day_key || account.last_seen_day;
      }
    }
    for (const [id, row] of byId) {
      if (existing.has(id)) continue;
      const username = row.username || "";
      const headshot = core.thumbnailUrl(row.headshot);
      accounts.push({id, username, display_name: username, aliases: [], ledger: true,
        latest_rank: row.rank, last_seen_day: overlay.checkpoint.day_key || null,
        headshot, avatar: {status: "unavailable"},
        friends: {status: "unavailable", items: []},
        followers: {status: "unavailable", items: []},
        following: {status: "unavailable", items: []}});
      added++;
    }
    return {checkpoint: {...overlay.checkpoint}, ranked: byId.size, added};
  }

  function rank(person) {
    return Number.isInteger(person && person.latest_rank) && person.latest_rank > 0 ? person.latest_rank : null;
  }
  function sortPeople(a, b) {
    return Number(Boolean(b.ledger)) - Number(Boolean(a.ledger)) ||
      (rank(a) || Infinity) - (rank(b) || Infinity) ||
      label(a).localeCompare(label(b), "en", {sensitivity: "base"}) ||
      String(a.id).localeCompare(String(b.id));
  }
  function matchingPeople(network, query, limit) {
    const needle = String(query || "").trim().replace(/^@/, "").toLowerCase();
    const people = [...(network && network.nodes && network.nodes.values() || [])];
    if (!needle) return people.filter(item => item.ledger && rank(item) && rank(item) <= 50).sort(sortPeople).slice(0, limit || 50);
    return people.filter(item =>
      String(item.username || "").toLowerCase().includes(needle) ||
      String(item.display_name || "").toLowerCase().includes(needle) ||
      String(item.id || "").includes(needle) ||
      (item.aliases || []).some(alias => String(alias).toLowerCase().includes(needle)) ||
      String(rank(item) || "") === needle
    ).sort(sortPeople).slice(0, limit || 80);
  }
  function resolveAccount(network, value, core) {
    const needle = String(value || "").trim().replace(/^@/, "").toLowerCase();
    if (!needle) return null;
    const id = core.normalizeId(needle);
    if (id && network.nodes.has(id)) return network.nodes.get(id);
    const matches = [...network.nodes.values()].filter(item => String(item.username || "").toLowerCase() === needle);
    return matches.length === 1 ? matches[0] : null;
  }

  // This returns observed network facts, never an ownership or misconduct score.
  // All neighbors come from buildBranches()'s evidence-validated adjacency.
  function insights(model, patterns, core) {
    const empty = {neighbors: [], ledger: [], connectors: [], external: [], paths: [],
      nameHints: [], presetHints: [], unknownAvatars: 0};
    if (!model || !model.root) return empty;
    const root = model.root;
    const neighbors = [...(model.adjacency.get(root.id) || [])]
      .map(id => model.nodesById.get(id)).filter(Boolean).sort(sortPeople);
    const ledger = neighbors.filter(person => person.ledger);
    const connectors = neighbors.filter(person => !person.ledger && model.eligibility.get(person.id) &&
      model.eligibility.get(person.id).category === "connector");
    const external = neighbors.filter(person => !person.ledger && !connectors.some(c => c.id === person.id));
    const paths = [];
    for (const connector of connectors) {
      for (const nextId of model.adjacency.get(connector.id) || []) {
        const next = model.nodesById.get(nextId);
        if (!next || !next.ledger || next.id === root.id) continue;
        paths.push({via: connector, to: next});
      }
    }
    const uniquePaths = [...new Map(paths.map(path => [path.via.id + ":" + path.to.id, path])).values()];
    const nameHints = [], presetHints = [];
    let unknownAvatars = 0;
    for (const person of neighbors) {
      const namePattern = patterns && typeof patterns.compare === "function" ?
        patterns.compare(root.username, person.username) : null;
      if (namePattern && ["strong", "possible"].includes(namePattern.tier)) {
        nameHints.push({person, tier: namePattern.tier, label: namePattern.label, reasons: namePattern.reasons || []});
      }
      const avatar = core.reviewAvatar(person.avatar);
      if (!avatar.available) unknownAvatars++;
      else if (avatar.fullMatches.length) presetHints.push({person, type: "full", names: avatar.fullMatches.map(value => value.name)});
      else if (avatar.partialMatches.length) presetHints.push({person, type: "partial", names: avatar.partialMatches.slice(0, 2).map(value => value.name)});
    }
    return {neighbors, ledger, connectors, external, paths: uniquePaths,
      nameHints: nameHints.sort((a, b) => Number(b.tier === "strong") - Number(a.tier === "strong")),
      presetHints, unknownAvatars};
  }

  function start(global) {
    const doc = global.document;
    const core = global.FischNetworker, graph = global.FischNetworkGraph;
    const patterns = global.FischUsernamePatterns;
    const time = global.FischTime;
    const get = id => doc.getElementById(id);
    const state = {data: null, accounts: [], network: null, rootId: null, selectedId: null,
      view: null, model: null, allExternal: false, expandedPicker: false};
    function node(tag, className, content) {
      const el = doc.createElement(tag);
      if (className) el.className = className;
      if (content !== undefined) el.textContent = String(content);
      return el;
    }
    function imageFor(person) {
      const src = core.thumbnailUrl(person && person.avatar_thumbnail) || core.thumbnailUrl(person && person.headshot);
      if (!src) return node("span", "nwf-avatar-empty", "◉");
      const image = node("img", "nwf-avatar");
      image.src = src;
      image.alt = "Cached avatar for " + label(person);
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => image.replaceWith(node("span", "nwf-avatar-empty", "◉")), {once: true});
      return image;
    }
    function button(text, handler, className) {
      const item = node("button", className || "nwf-text-button", text);
      item.type = "button"; item.addEventListener("click", handler); return item;
    }
    function personButton(person, action, selected) {
      const item = node("button", "nwf-person-card" + (selected ? " is-current" : ""));
      item.type = "button";
      item.setAttribute("aria-pressed", String(Boolean(selected)));
      item.setAttribute("aria-label", "Investigate " + label(person));
      const content = node("span", "nwf-person-text");
      content.append(node("strong", "", label(person)), node("small", "", (rank(person) ? "#" + rank(person) + " · " : "") + "ID " + person.id));
      item.append(imageFor(person), content);
      item.addEventListener("click", () => action(person));
      return item;
    }
    function fillSticky(id, person, fallback) {
      const holder = get(id);
      holder.replaceChildren();
      if (!person) { holder.textContent = fallback; return; }
      holder.append(imageFor(person), node("strong", "", label(person)));
      const marker = node("small", "", (rank(person) ? "#" + rank(person) + " · " : "") + "ID " + person.id);
      holder.append(marker);
    }
    function updateSticky() {
      fillSticky("nwf-root-label", state.network && state.network.nodes.get(state.rootId), "Choose a root");
      fillSticky("nwf-inspected-label", state.network && state.network.nodes.get(state.selectedId), "Select a graph node");
    }
    function setStatus(message, error) {
      const el = get("network-status");
      el.textContent = message || "";
      el.hidden = !message;
      el.classList.toggle("is-error", Boolean(error));
    }
    function getRoot() { return state.network && state.network.nodes.get(state.rootId); }
    function updateURL() {
      if (!state.rootId) return;
      const url = new URL(global.location.href);
      url.searchParams.set("target", state.rootId);
      for (const key of ["compare", "scope", "review", "sort"]) url.searchParams.delete(key);
      global.history.replaceState(null, "", url);
    }
    function chooseRoot(person) {
      if (!person || !state.network.nodes.has(person.id)) return;
      state.rootId = person.id;
      state.selectedId = person.id;
      state.allExternal = !person.ledger;
      get("nwf-show-external").checked = state.allExternal;
      get("nwf-target-search").value = "";
      get("nwf-root-picker").open = false;
      state.expandedPicker = false;
      updateURL();
      render();
    }
    function renderPicker() {
      const needle = get("nwf-target-search").value.trim();
      const matches = matchingPeople(state.network, needle, needle ? 80 : 50);
      const shown = needle || state.expandedPicker ? matches : matches.slice(0, 9);
      get("nwf-picker-heading").textContent = needle ? "Saved matching identities" : "Latest photographed Top 50";
      get("nwf-picker-count").textContent = shown.length + (needle ? " matches shown" : " of " + matches.length);
      const grid = get("nwf-account-grid");
      grid.replaceChildren();
      for (const item of shown) grid.append(personButton(item, chooseRoot, item.id === state.rootId));
      if (!shown.length) grid.append(node("p", "nwf-help", "No saved account matches. Unscanned accounts cannot be invented."));
      const more = get("nwf-more-accounts");
      more.hidden = Boolean(needle) || matches.length <= 9;
      more.textContent = state.expandedPicker ? "Show fewer" : "Show all " + matches.length;
      more.setAttribute("aria-expanded", String(state.expandedPicker));
      const refs = get("nwf-reference-picks");
      refs.replaceChildren();
      const named = ["12013950464", "9579548886", "12026234206"].map(id => state.network.nodes.get(id)).filter(Boolean);
      if (!needle && named.length) {
        refs.append(node("span", "nwf-help", "Saved reference accounts"));
        for (const item of named) refs.append(personButton(item, chooseRoot, item.id === state.rootId));
      }
    }
    function modelFor(rootId) {
      return graph.buildBranches({network: state.network, accounts: state.accounts,
        historicalEdges: state.data.historical_friend_edges || [],
        avatarNodes: state.data.network_nodes || [], focusId: rootId, core,
        includeConnectors: true, includeExternal: state.allExternal});
    }
    function addCount(container, number, description) {
      const box = node("div", "nwf-stat");
      box.append(node("strong", "", String(number)), node("span", "", description));
      container.append(box);
    }
    function renderStats(model, info) {
      const counts = get("nwf-network-counts");
      counts.replaceChildren();
      addCount(counts, info.ledger.length, "Direct ledger accounts");
      addCount(counts, info.connectors.length, "Shared external connectors");
      addCount(counts, info.external.length, "Other observed external neighbors");
      addCount(counts, info.paths.length, "Two-hop ledger paths via connectors");
      const root = model.root;
      const lists = ["friends", "followers", "following"].map(kind => core.socialList(root, kind));
      const incomplete = lists.some(list => !list.complete);
      get("nwf-network-note").textContent = incomplete ?
        "Observation coverage is incomplete. These are saved positive links, not a complete or current account network." :
        "The displayed paths come from saved observations, not inferred names or avatars.";
    }
    function linkSourceRow(person, main) {
      const row = node("div", "nwf-evidence-row");
      row.append(personButton(person, chooseRoot, person.id === state.rootId));
      const text = node("span", "nwf-evidence-kind", main || "Observed social connection");
      row.append(text);
      return row;
    }
    function renderLinks(info) {
      const direct = get("nwf-direct-links"), paths = get("nwf-connector-paths");
      direct.replaceChildren(); paths.replaceChildren();
      direct.append(node("h4", "", "Direct leaderboard connections (" + info.ledger.length + ")"));
      if (!info.ledger.length) direct.append(node("p", "nwf-help", "No direct leaderboard links recorded for this root. This does not prove there are none."));
      for (const person of info.ledger.slice(0, 10)) direct.append(linkSourceRow(person, "Observed link"));
      if (info.ledger.length > 10) direct.append(node("p", "nwf-help", (info.ledger.length - 10) + " additional direct leaderboard links in the graph/evidence list."));
      paths.append(node("h4", "", "External bridges to other ledger accounts (" + info.paths.length + ")"));
      for (const path of info.paths.slice(0, 10)) {
        const row = node("div", "nwf-path");
        row.append(button(label(path.via), () => chooseRoot(path.via)), node("span", "", " → "),
          button(label(path.to), () => chooseRoot(path.to)));
        paths.append(row);
      }
      if (!info.paths.length) paths.append(node("p", "nwf-help", "No observed two-hop ledger path through a shared external connector. Expand branches to inspect available connections."));
      if (info.paths.length > 10) paths.append(node("p", "nwf-help", (info.paths.length - 10) + " additional saved paths; inspect the graph for linked nodes."));
    }
    function renderFlags(info) {
      const names = get("nwf-pattern-flags"), avatars = get("nwf-avatar-flags");
      names.replaceChildren(); avatars.replaceChildren();
      names.append(node("h4", "", "Username patterns among observed neighbors (" + info.nameHints.length + ")"));
      for (const hint of info.nameHints.slice(0, 8)) {
        const row = node("p", "nwf-signal-row");
        const action = button(label(hint.person), () => chooseRoot(hint.person));
        row.append(action, node("span", "", " · " + hint.label));
        if (hint.reasons.length) row.title = hint.reasons.join(" ");
        names.append(row);
      }
      if (!info.nameHints.length) names.append(node("p", "nwf-help", "No strong or possible name patterns found among observed direct neighbors."));
      avatars.append(node("h4", "", "RBI outfit scan clues (" + info.presetHints.length + ")"));
      for (const hint of info.presetHints.slice(0, 8)) {
        const row = node("p", "nwf-signal-row");
        row.append(button(label(hint.person), () => chooseRoot(hint.person)),
          node("span", "", " · " + hint.type + ": " + hint.names.join(", ")));
        avatars.append(row);
      }
      if (!info.presetHints.length) avatars.append(node("p", "nwf-help", "No recorded preset flags among observed direct neighbors."));
      avatars.append(node("p", "nwf-help", String(info.unknownAvatars) + " neighboring avatars are unscanned or unavailable; this is not a confirmed nonmatch."));
    }
    function renderRaw(info) {
      const root = getRoot(), host = get("nwf-friend-results");
      const coverage = ["friends", "followers", "following"].map(kind => {
        const data = core.socialList(root, kind);
        return kind + ": " + (data.readable ? data.items.size + " saved IDs · " + (data.complete ? "complete" : "partial") : "not readable");
      });
      get("nwf-coverage-note").textContent = coverage.join("  |  ");
      const needle = get("nwf-friend-filter").value.trim().replace(/^@/, "").toLowerCase();
      const matching = info.neighbors.filter(person => !needle ||
        String(person.username || "").toLowerCase().includes(needle) || String(person.id).includes(needle));
      host.replaceChildren(node("p", "nwf-help", matching.length + " observed direct identities match; showing up to 60."));
      for (const person of matching.slice(0, 60)) host.append(personButton(person, chooseRoot, false));
    }
    function render() {
      const root = getRoot();
      updateSticky(); renderPicker();
      const model = modelFor(state.rootId);
      state.model = model;
      const info = insights(model, patterns, core);
      renderStats(model, info);
      renderLinks(info);
      renderFlags(info);
      renderRaw(info);
      const opts = {network: state.network, accounts: state.accounts,
        historicalEdges: state.data.historical_friend_edges || [],
        avatarNodes: state.data.network_nodes || [],
        focusId: state.rootId, core, usernamePatterns: patterns,
        includeConnectors: true, includeExternal: state.allExternal, quadrant: true,
        onSelect: (id) => { state.selectedId = id; updateSticky(); },
        onReference: (id, person) => { chooseRoot(person || state.network.nodes.get(id)); }
      };
      if (state.view) state.view.update(opts);
      else state.view = graph.mount(get("nwf-graph"), opts);
    }
    async function init() {
      try {
        const response = await global.fetch("network-data.json", {cache:"no-cache"});
        if (!response.ok) throw new Error("HTTP " + response.status);
        const data = await response.json();
        if (data.schema_version !== 1 || !Array.isArray(data.accounts)) throw new Error("Unsupported network snapshot");
        state.data = data;
        const seen = new Set();
        state.accounts = data.accounts.filter(account => {
          const id = core.normalizeId(account && account.id);
          if (!id || seen.has(id) || typeof account.username !== "string") return false;
          seen.add(id);
          account.id = id;
          return true;
        });
        let currentRanks = null;
        try {
          const ranksResponse = await global.fetch("network-ranks.json", {cache: "no-cache"});
          if (ranksResponse.ok) currentRanks = applyLeaderboardRanks(
            state.accounts, await ranksResponse.json(), data.ledger_latest_checkpoint, core);
        } catch { /* Older published sites keep their saved as-of rank snapshot. */ }
        if (currentRanks) data.ledger_latest_checkpoint = currentRanks.checkpoint;
        state.network = core.socialNetwork(state.accounts, Array.isArray(data.network_nodes) ? data.network_nodes : []);
        // Optional static overlay generated from the official Roblox Users API
        // at publication time. GitHub Pages cannot safely rely on Roblox CORS.
        // Missing/unavailable responses retain the original ID-only fallback.
        try {
          const namesResponse = await global.fetch("network-usernames.json", {cache: "no-cache"});
          if (namesResponse.ok) applyVerifiedUsernames(state.network, await namesResponse.json(), core);
        } catch { /* Preserve historical data when lookup is unavailable. */ }
        const params = new URLSearchParams(global.location.search);
        const requested = core.normalizeId(params.get("target"));
        const preferred = state.network.nodes.has("1316700350") ? "1316700350" :
          (state.accounts.find(account => account.ledger && rank(account) === 1) || state.accounts[0]).id;
        state.rootId = params.has("target") ? state.network.nodes.has(requested) ? requested : null : preferred;
        state.selectedId = state.rootId;
        state.allExternal = Boolean(getRoot() && !getRoot().ledger);
        get("nwf-show-external").checked = state.allExternal;
        const cacheTime = data.generated_at ? new Date(data.generated_at) : null;
        get("cache-time").textContent = cacheTime && Number.isFinite(cacheTime.getTime()) ?
          cacheTime.toLocaleString() : "Timestamp unavailable";
        const rankCheckpoint = currentRanks?.checkpoint || data.ledger_latest_checkpoint;
        get("cache-coverage").textContent = state.accounts.length + " saved network accounts · leaderboard ranks as of " +
          (rankCheckpoint?.day_key || "last saved network snapshot") +
          (currentRanks ? " (photo-verified)" : " (cached)");
        get("networker-app").hidden = false;
        setStatus("");
        if (params.has("target") && !state.rootId) setStatus("Requested ID is not present in the saved network. Choose another root.", true);
        if (!params.has("target")) updateURL();
        get("nwf-picker-trigger").addEventListener("click", () => {
          get("nwf-root-picker").open = true;
          get("nwf-root-picker").scrollIntoView({block:"start",behavior:"smooth"});
        });
        get("nwf-root-shortcut").addEventListener("click", () => {
          get("nwf-root-picker").open = true;
          get("nwf-root-picker").scrollIntoView({block:"start",behavior:"smooth"});
        });
        get("nwf-inspected-shortcut").addEventListener("click", () => get("nwf-graph").scrollIntoView({block:"start",behavior:"smooth"}));
        get("nwf-target-search").addEventListener("input", renderPicker);
        get("nwf-target-form").addEventListener("submit", event => {
          event.preventDefault();
          const result = resolveAccount(state.network, get("nwf-target-search").value, core);
          if (result) { setStatus(""); chooseRoot(result); }
          else setStatus("Select a saved identity or enter its exact username / Roblox ID.", true);
        });
        get("nwf-more-accounts").addEventListener("click", () => { state.expandedPicker = !state.expandedPicker; renderPicker(); });
        get("nwf-show-external").addEventListener("change", event => { state.allExternal = Boolean(event.target.checked); render(); });
        get("nwf-friend-filter").addEventListener("input", () => renderRaw(insights(state.model, patterns, core)));
        render();
      } catch (error) {
        get("networker-app").hidden = true;
        setStatus("Could not load saved network (" + error.message + ").", true);
      }
    }
    init();
  }
  return Object.freeze({label, applyVerifiedUsernames, applyLeaderboardRanks, matchingPeople, resolveAccount, insights, start});
});

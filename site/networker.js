(function () {
  "use strict";
  const core = window.FischNetworker, time = window.FischTime, patterns = window.FischUsernamePatterns;
  let graphView = null;
  const byId = id => document.getElementById(id);
  const state = {data: null, accounts: [], byId: new Map(), assetCatalog: new Map(), network: null, targetId: null, compareId: null, scope: "latest", sort: "review", reviewFilter: "all", filter: "", friendFilter: "", friendLimit: 50, assetFilter: "all"};
  const viewerZone = time.viewerTimeZone();
  const localTimeFormat = new Intl.DateTimeFormat("en-US", {timeZone: viewerZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"});
  const GROUP_LABELS = {cosmetic: "Clothing & accessories", body: "Body parts & faces", animation: "Animations", other: "Other assets"};
  const SOCIAL_LABELS = {friends: "Friends", followers: "Followers", following: "Following"};
  const PRESET_CATEGORIES = {defaultcombos: "Default outfits", xboxcombos: "Xbox outfits", freeoutfitcombos: "Other outfit presets"};

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }
  function externalLink(label, href) {
    const link = node("a", "", label);
    link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
    return link;
  }
  function checkedTime(iso, fallback = "Not checked") {
    const canonical = time.toUTC(iso);
    if (!canonical) return node("span", "", fallback);
    const element = node("time", "", localTimeFormat.format(new Date(canonical)));
    element.dateTime = canonical; element.title = `${canonical} · displayed in ${viewerZone}`;
    return element;
  }
  function accountImage(account, full = false) {
    const placeholder = () => node("span", "nw-avatar-placeholder", full ? "Full avatar unavailable" : "No image");
    const url = core.thumbnailUrl(account.avatar_thumbnail) || (!full && core.thumbnailUrl(account.headshot));
    if (!url) return placeholder();
    const image = node("img");
    image.src = url; image.alt = `${full ? "Collected full avatar" : "Avatar thumbnail"} of @${account.username}`;
    image.loading = "lazy"; image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.replaceWith(placeholder()), {once: true});
    return image;
  }
  function percentage(value) { return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`; }
  function updateUrl() {
    if (!state.targetId) return;
    const url = new URL(location.href);
    url.searchParams.set("target", state.targetId);
    if (state.compareId) url.searchParams.set("compare", state.compareId); else url.searchParams.delete("compare");
    if (state.scope === "all") url.searchParams.set("scope", "all"); else url.searchParams.delete("scope");
    if (state.reviewFilter !== "all") url.searchParams.set("review", state.reviewFilter); else url.searchParams.delete("review");
    if (state.sort !== "review") url.searchParams.set("sort", state.sort); else url.searchParams.delete("sort");
    history.replaceState(null, "", url);
  }
  function setStatus(text, error = false) {
    byId("network-status").textContent = text;
    byId("network-status").hidden = !text;
    byId("network-status").classList.toggle("is-error", error);
  }
  function referenceAccount() {
    return state.byId.get(state.targetId) || state.network?.nodes.get(state.targetId);
  }
  function accountFromInput(value) {
    const query = value.trim().replace(/^@/, "").toLowerCase();
    const exactId = state.network?.nodes.get(core.normalizeId(query));
    if (exactId) return exactId;
    const matches = [...(state.network?.nodes.values() || [])].filter(account => query && String(account.username || "").toLowerCase() === query);
    return matches.length === 1 ? matches[0] : null;
  }
  function renderTop50List(query = "") {
    const list = byId("top50-target"), needle = String(query || "").trim().replace(/^@/, "").toLowerCase();
    const matches = state.top50Accounts.filter(account => !needle ||
      String(account.username).toLowerCase().includes(needle) || String(account.id).includes(needle) ||
      String(account.latest_rank) === needle);
    list.replaceChildren();
    byId("top50-count").textContent = `${matches.length} of ${state.top50Accounts.length}`;
    if (!matches.length) {
      list.append(node("p", "nw-top50-empty", "No Top 50 matches. You can still select a saved historical account using the search above."));
      return;
    }
    for (const account of matches) {
      const button = node("button", "nw-top50-account");
      button.type = "button";
      button.setAttribute("aria-pressed", String(account.id === state.targetId));
      button.setAttribute("aria-label", `Set @${account.username}, rank #${account.latest_rank}, as main account`);
      if (account.id === state.targetId) button.className += " is-selected";
      const rank = node("span", "nw-top50-rank", `#${account.latest_rank}`);
      const details = node("span", "nw-top50-details");
      details.append(node("strong", "", `@${account.username}`), node("small", "", `Roblox ID ${account.id}`));
      button.append(rank, accountImage(account), details);
      button.addEventListener("click", () => chooseTarget(account));
      list.append(button);
    }
  }
  function allCandidates(filtered = true) {
    if (!state.targetId) return [];
    return core.candidates(state.accounts, referenceAccount(), state.scope, state.sort, filtered ? state.reviewFilter : "all");
  }
  function ensureComparison() {
    const choices = allCandidates();
    if (!choices.some(item => item.account.id === state.compareId)) state.compareId = choices[0]?.account.id || null;
  }
  function chooseTarget(account) {
    if (!account) { setStatus("Enter an exact Roblox ID or a unique username saved in this snapshot.", true); return; }
    state.targetId = account.id;
    state.friendFilter = ""; state.friendLimit = 50; byId("friend-search").value = "";
    byId("target-input").value = account.username || account.id;
    renderTop50List();
    ensureComparison(); state.assetFilter = "all";
    setStatus(""); updateUrl(); renderReference(); renderReviewOverview(); renderSocialGraph(); renderCandidates(); renderComparison();
  }
  function chooseCandidate(id, scroll = false) {
    if (!state.targetId || !state.byId.has(id) || id === state.targetId) return;
    const candidate = state.byId.get(id);
    if (state.scope === "latest" && (!candidate.ledger || !candidate.latest_rank)) {
      state.scope = "all"; byId("candidate-scope").value = "all";
    }
    state.compareId = id; state.assetFilter = "all";
    if (!core.matchesReviewFilter(core.reviewAvatar(candidate.avatar), state.reviewFilter)) {
      state.reviewFilter = "all"; byId("candidate-review-filter").value = "all";
    }
    updateUrl(); renderReviewOverview(); renderCandidates(); renderComparison();
    if (scroll && window.innerWidth <= 850) byId("comparison-panel").scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
  }

  function renderReference() {
    const account = referenceAccount(), wrapper = byId("reference-summary");
    if (!account) {
      wrapper.replaceChildren(node("p", "nw-empty", "Choose a cached reference account above to begin a comparison."));
      return;
    }
    wrapper.replaceChildren(accountImage(account));
    const detail = node("div");
    detail.append(node("p", "nw-kicker", "MAIN ACCOUNT"), node("h2", "", personLabel(account)));
    const place = account.latest_rank ? `Latest board rank #${account.latest_rank}` : account.ledger ? `Previously photographed · last seen ${account.last_seen_day || "date unavailable"}` : account.external ? "Observed external account · outside the photographed ledger" : "Reference account · outside the photographed ledger";
    detail.append(node("p", "", `Roblox ID ${account.id} · ${place}`));
    detail.append(reviewBadge(core.reviewAvatar(account.avatar)));
    wrapper.append(detail);
    const links = node("div", "nw-ref-links");
    links.append(externalLink("Roblox profile", core.profileUrl(account.id)));
    if (account.ledger) {
      const url = new URL("./", location.href);
      url.searchParams.set("player", `id:${account.id}`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(account.last_seen_day || "")) url.searchParams.set("day", account.last_seen_day);
      const link = node("a", "", "Inspect on ledger"); link.href = url.href; links.append(link);
    }
    wrapper.append(links);
  }

  function reviewBadge(review) {
    let label = review.status === "unknown" ? "Avatar review unknown" : "No RBI preset items observed";
    if (review.status === "full") label = review.fullMatches.map(preset => `Full ${preset.name} preset (${preset.matchedCount}/${preset.requiredCount})`).join(" · ");
    if (review.status === "partial") label = review.partialMatches.map(preset => `Partial ${preset.name} (${preset.matchedCount}/${preset.requiredCount})`).join(" · ");
    return node("span", `nw-review-badge is-${review.status}`, label);
  }

  function applyReviewFilter(value) {
    state.reviewFilter = value;
    byId("candidate-review-filter").value = value;
    ensureComparison(); updateUrl(); renderReviewOverview(); renderCandidates(); renderComparison();
  }

  function renderReviewOverview() {
    const choices = allCandidates(false), wrapper = byId("review-totals");
    wrapper.replaceChildren();
    const labels = {full: "Full preset matches", partial: "Partial matches only", none: "No preset items", unknown: "Avatar unavailable"};
    for (const [kind, label] of Object.entries(labels)) {
      const button = node("button", `nw-review-total is-${kind}`); button.type = "button";
      button.setAttribute("aria-pressed", String(state.reviewFilter === kind));
      button.append(node("strong", "", choices.filter(item => item.review.status === kind).length), node("span", "", label));
      button.addEventListener("click", () => applyReviewFilter(state.reviewFilter === kind ? "all" : kind));
      wrapper.append(button);
    }
    byId("review-scope-summary").textContent = state.targetId ? `Counts cover ${choices.length} ${state.scope === "latest" ? "latest-board" : "historical and reference"} candidates, excluding the reference account. Select a count to filter the review queue.` : "Select a cached reference account to load the review queue.";
  }

  function renderPresetLibrary() {
    byId("review-rule-count").textContent = `${core.RBI_AVATAR_RULES.presets.length} verified presets`;
    const wrapper = byId("review-presets"); wrapper.replaceChildren();
    for (const [category, label] of Object.entries(PRESET_CATEGORIES)) {
      const presets = core.RBI_AVATAR_RULES.presets.filter(preset => preset.category === category);
      const group = node("section"); group.append(node("h3", "", `${label} · ${presets.length}`));
      for (const preset of presets) {
        const details = node("details", "nw-preset-definition");
        details.append(node("summary", "", `${preset.name} · ${preset.assetIds.length} item${preset.assetIds.length === 1 ? "" : "s"}`));
        const list = node("ul", "nw-preset-items");
        for (const id of preset.assetIds) {
          const item = node("li"); item.append(externalLink(state.assetCatalog.get(id)?.name || `Asset ${id}`, core.assetUrl(id)), node("small", "", `ID ${id}`)); list.append(item);
        }
        details.append(list); group.append(details);
      }
      wrapper.append(group);
    }
    const source = byId("review-rule-source"); source.replaceChildren("Preset IDs and subset-matching rule: ", externalLink(`Roblox Bot Investigator ${core.RBI_AVATAR_RULES.version}`, core.RBI_AVATAR_RULES.sourceUrl), ". The source's free-outfit category is shown as Other outfit presets; current catalog prices and availability are not checked.");
  }

  function avatarReviewCard(account, label) {
    const review = core.reviewAvatar(account.avatar), card = node("article", "nw-account-review");
    card.append(node("p", "nw-kicker", label), node("h4", "", `@${account.username}`), reviewBadge(review));
    const observed = node("p", "nw-help"); observed.append("Avatar observed ", checkedTime(account.avatar?.fetched_at, "time unavailable"));
    const source = core.sourceUrl(account.avatar?.source_url);
    if (source) observed.append(" · ", externalLink("Source", source));
    card.append(observed);
    if (!review.available) { card.append(node("p", "", "The equipped-asset record is unavailable. Preset matching is unknown.")); return card; }
    if (review.status === "none") { card.append(node("p", "", "No required preset IDs were observed in this readable avatar record.")); return card; }
    for (const preset of review.presets.filter(item => item.matchedCount > 0)) {
      const details = node("details", "nw-preset-match"); details.open = true;
      details.append(node("summary", "", `${preset.name} · ${preset.matchedCount}/${preset.requiredCount} required items · ${preset.status === "full" ? "full preset" : "partial"}`));
      const list = node("ul", "nw-preset-items");
      for (const [ids, present] of [[preset.matchedIds, true], [preset.missingIds, false]]) for (const id of ids) {
        const item = node("li", present ? "is-present" : "is-missing");
        item.append(node("span", "nw-item-state", present ? "Present" : "Missing"), externalLink(state.assetCatalog.get(id)?.name || `Asset ${id}`, core.assetUrl(id)), node("small", "", `ID ${id}`)); list.append(item);
      }
      details.append(list); card.append(details);
    }
    return card;
  }

  function methodLabel(record) {
    if (record?.source_label) return record.source_label;
    if (record?.method === "roblox_website") return "Roblox website observation";
    if (record?.method === "mixed") return "Website and API observations";
    return "Roblox API";
  }

  function personLabel(person) {
    return person.username ? `@${person.username}` : person.display_name ? `${person.display_name} (display name)` : `ID ${person.id}`;
  }

  function coverageText(record) {
    if (!record) return "Unknown · no list collected for this account";
    if (record?.status === "complete") return `Complete ${methodLabel(record)} · ${Array.isArray(record.items) ? record.items.length : "unknown"} records`;
    if (record?.status === "partial") return `Partial ${methodLabel(record)} · ${Array.isArray(record.items) ? record.items.length : "unknown"} observed records`;
    if (record?.attempted === false) return "Unknown · not individually requested after source access failed";
    return `Unknown · ${methodLabel(record)} unavailable${record?.http_status ? ` (HTTP ${record.http_status})` : ""}`;
  }

  function evidenceList(evidence) {
    const list = node("ul", "nw-observation-evidence");
    for (const item of evidence) {
      const owner = state.byId.get(item.ownerId), line = node("li");
      line.append(`${owner ? personLabel(owner) : `ID ${item.ownerId || "unknown"}`} · ${methodLabel(item)} · `,
        checkedTime(item.observed_at || item.fetched_at, "observation time unavailable"));
      const source = core.sourceUrl(item.source_url);
      if (source) line.append(" · ", externalLink("Observed source", source));
      list.append(line);
    }
    return list;
  }

  function renderCapabilityDetails(target) {
    const wrapper = byId("capability-details"); wrapper.replaceChildren(); wrapper.className = "nw-capabilities";
    for (const kind of ["friends", "followers", "following"]) {
      const capability = state.data.capabilities?.[kind], record = target[kind];
      const apiRecord = kind === "friends" ? target.friend_evidence?.api || record : record;
      const card = node("div", "nw-capability"); card.append(node("strong", "", SOCIAL_LABELS[kind]), node("p", "", coverageText(record)));
      const when = node("p"); when.append("Readable observation: ", checkedTime(record?.fetched_at, "none collected")); card.append(when);
      if (record?.checked_at && record.checked_at !== record.fetched_at) {
        const attempt = node("p"); attempt.append("Last collection attempt: ", checkedTime(record.checked_at)); card.append(attempt);
      }
      const source = core.sourceUrl(record?.source_url);
      if (source) card.append(externalLink("Observation source", source));
      if (kind === "friends" && target.friend_evidence?.api) {
        card.append(node("p", "nw-api-coverage", `Separate API record: ${coverageText(apiRecord)}`));
        const apiTime = node("p"); apiTime.append("API record checked: ", checkedTime(apiRecord?.checked_at || apiRecord?.fetched_at, "not individually requested")); card.append(apiTime);
      }
      if (capability?.reason) card.append(node("p", "nw-api-coverage", `API capability probe: ${capability.reason}`));
      if (capability?.checked_at) { const probe = node("p"); probe.append("API access checked: ", checkedTime(capability.checked_at)); card.append(probe); }
      const apiSource = core.sourceUrl(capability?.source_url || apiRecord?.source_url);
      if (apiSource && apiSource !== source) card.append(externalLink("API probe endpoint", apiSource));
      wrapper.append(card);
    }
  }

  function renderWebsiteCoverage() {
    const info = state.data.website_observations, wrapper = byId("website-coverage");
    wrapper.replaceChildren();
    if (!info) { wrapper.append("No website observations are included in this snapshot. API source availability is shown separately below."); return; }
    wrapper.append(`Website inspections recorded for ${info.source_account_count} of ${state.accounts.length} cached accounts (${info.ledger_source_count} ledger accounts). Latest website observation: `,
      checkedTime(info.latest_observed_at), ". Collection covers direct friends only. External avatars qualify for branches only when an equipped-asset record verifies a preset match.");
    if (Number.isSafeInteger(info.complete_source_count)) wrapper.append(` Latest inspections: ${info.complete_source_count} complete, ${info.partial_source_count} partial, ${info.unavailable_source_count} unavailable.`);
  }

  function renderCensusCoverage() {
    const wrapper = byId("census-coverage-table"); wrapper.replaceChildren();
    const table = node("table"), head = node("thead"), row = node("tr");
    for (const label of ["Account", "Board", "Website coverage", "Readable IDs / displayed", "List views", "Observed"]) { const th = node("th", "", label); th.scope = "col"; row.append(th); }
    head.append(row); table.append(head);
    const body = node("tbody");
    const accounts = [...state.accounts].sort((a, b) => (a.latest_rank || 9999) - (b.latest_rank || 9999) || String(a.username).localeCompare(String(b.username)));
    for (const account of accounts) {
      const latest = account.friend_evidence?.latest_website, tr = node("tr"), name = node("td");
      name.append(externalLink(personLabel(account), core.profileUrl(account.id))); tr.append(name);
      tr.append(node("td", "", account.latest_rank ? `#${account.latest_rank}` : account.ledger ? "History" : "Reference"));
      tr.append(node("td", "", latest ? latest.coverage?.status || "Unknown" : "No saved inspection"));
      tr.append(node("td", "", latest ? `${latest.observed_id_count} / ${Number.isSafeInteger(latest.displayed_total_count) ? latest.displayed_total_count : "unknown"}` : "—"));
      tr.append(node("td", "", latest ? String(latest.coverage?.pages_observed?.length || 0) : "—"));
      const time = node("td"); if (latest) { time.append(checkedTime(latest.observed_at)); const url = core.sourceUrl(latest.source_url); if (url) time.append(" · ", externalLink("Source", url)); } else time.textContent = "—";
      tr.append(time); body.append(tr);
    }
    table.append(body); wrapper.append(table);
  }

  function renderObservedFriends(view) {
    const target = referenceAccount(), list = byId("friend-list"); list.replaceChildren();
    const more = byId("friend-load-more"); more.hidden = true;
    if (!target || !view) {
      byId("friend-list-count").textContent = "No reference selected";
      byId("friend-list-coverage").textContent = "Select a cached reference to inspect recorded friends.";
      byId("friend-list-status").textContent = ""; byId("friend-search").disabled = true; return;
    }
    const coverage = core.socialList(target, "friends"), friends = view.friends;
    byId("friend-search").disabled = !friends.length;
    byId("friend-list-count").textContent = friends.length ? `${friends.length} observed IDs` : coverage.complete ? "Complete empty list" : "Unknown total";
    const website = target.friend_evidence?.latest_website;
    const displayed = Number.isSafeInteger(website?.displayed_total_count) ? ` The website displayed ${website.displayed_total_count} friends at its latest inspection; ${website.observed_id_count} exact IDs were readable in that inspection.` : "";
    byId("friend-list-coverage").textContent = `${coverageText(target.friends)}.${displayed} ${coverage.complete ? "The reference's complete list applies at its observation time." : "The list is incomplete or unavailable; absent IDs remain unknown. Readable partial and counterpart records can still establish observed links."} Exact IDs from counterpart lists may also appear below, with their own source times.`;
    if (!friends.length) {
      byId("friend-list-status").textContent = coverage.complete ? "The complete reference observation contains no friend IDs." : "No direct friend IDs are available from the readable observations. This does not establish zero friends.";
      return;
    }
    const term = state.friendFilter.trim().replace(/^@/, "").toLowerCase();
    const matches = friends.filter(item => !term || [item.node.id, item.node.username, item.node.display_name, ...(item.node.aliases || [])].some(value => String(value || "").toLowerCase().includes(term)));
    const shown = matches.slice(0, state.friendLimit);
    byId("friend-list-status").textContent = `Showing ${shown.length} of ${matches.length} matching observed friends (${friends.length} total observed IDs).`;
    if (!matches.length) list.append(node("li", "nw-empty", "No observed friend matches this search."));
    for (const entry of shown) {
      const person = entry.node, row = node("li", "nw-observed-friend");
      const heading = node("div", "nw-observed-friend-head"), identity = node("div");
      identity.append(externalLink(personLabel(person), core.profileUrl(person.id)), node("small", "", `Roblox ID ${person.id} · ${person.cached ? person.ledger ? "Ledger account" : "Cached reference account" : "External friend"}`));
      heading.append(identity);
      if (person.cached) {
        const button = node("button", "nw-quiet", "Compare"); button.type = "button"; button.addEventListener("click", () => chooseCandidate(person.id, true)); heading.append(button);
      }
      row.append(heading);
      const namePattern = patterns.compare(target.username, person.username);
      if (namePattern.tier === "strong" || namePattern.tier === "possible") {
        row.append(node("p", `nw-friend-name-pattern is-${namePattern.tier}`, `${namePattern.label}: ${namePattern.reasons.join(" ")}`));
      }
      if (entry.cachedFriendIds.length) {
        const linked = node("p", "nw-help", "Also observed with ");
        entry.cachedFriendIds.slice(0, 4).forEach((id, index) => { if (index) linked.append(", "); linked.append(externalLink(personLabel(state.byId.get(id)), core.profileUrl(id))); });
        if (entry.cachedFriendIds.length > 4) linked.append(` and ${entry.cachedFriendIds.length - 4} other cached accounts`);
        row.append(linked);
      }
      const evidence = entry.edges.filter(edge => edge.kind === "friend").flatMap(edge => edge.evidence);
      if (evidence.length) {
        const latest = [...evidence].sort((a, b) => String(b.observed_at || b.fetched_at).localeCompare(String(a.observed_at || a.fetched_at)))[0];
        const observed = node("p", "nw-help"); observed.append(`${methodLabel(latest)} · observed `, checkedTime(latest.observed_at || latest.fetched_at));
        const source = core.sourceUrl(latest.source_url);
        if (source) observed.append(" · ", externalLink("Source", source));
        row.append(observed);
      }
      const details = node("details", "nw-friend-proof"); details.append(node("summary", "", `Observation evidence · ${evidence.length} source record${evidence.length === 1 ? "" : "s"}`), evidenceList(evidence)); row.append(details); list.append(row);
    }
    more.hidden = shown.length >= matches.length;
  }

  function renderRelationshipLens(target) {
    const host = byId("relationship-lens");
    if (!host) return;
    host.replaceChildren();
    if (!target) return;
    const lens = core.relationshipLens(state.network, target.id, state.data.network_nodes || []);
    const coverage = core.socialList(target, "friends");
    const summary = node("p", "nw-lens-metric", lens.matchPercent === null
      ? "Outfit match rate unavailable"
      : `${percentage(lens.matchPercent)} of fully scanned friends matched a preset`);
    const counts = node("p", "nw-help", `${lens.fullCount} exact · ${lens.nearCount} near · ${lens.classifiedCount}/${lens.observedFriendCount} observed friends fully scanned · ${lens.unknownCount} unknown`);
    const note = node("p", "nw-help", "Near means at least 80% of a preset’s required item IDs, using a complete outfit scan. A full preset match contains every required ID. Exact matches found in partial scans are shown separately and excluded from the rate. Outfit matches, including defaults, do not establish botting, shared ownership, or farming.");
    const listCoverage = node("p", "nw-help", coverage.complete
      ? "A complete Friends list was recorded. Entries and outfits reflect saved observation times, not live status."
      : "The Friends list is incomplete or unavailable. The rate describes only fully scanned observed friends, not the whole list.");
    const grid = node("div", "nw-lens-grid");
    function lane(key, title, entries, format = entry => ({person: entry}), empty = "No saved links in this group.") {
      const article = node("section", `nw-lens-lane nw-lens-${key}`);
      article.append(node("h3", "", `${title} · ${entries.length}`));
      if (!entries.length) article.append(node("p", "nw-help", empty));
      else {
        const list = node("ul", "nw-lens-list");
        for (const entry of entries) {
          const {person, description, observedAt} = format(entry), row = node("li");
          row.append(externalLink(personLabel(person), core.profileUrl(person.id)));
          if (description) row.append(node("span", "nw-help", description));
          if (observedAt) row.append(checkedTime(observedAt));
          list.append(row);
        }
        article.append(list);
      }
      return article;
    }
    grid.append(
      lane("followers", "Followers (they follow this account)", lens.followers, undefined, "No saved incoming follows; the list may be uninspected."),
      lane("outfits", "Friends with preset matches", lens.outfitFriends, entry => ({
        person: entry.node, description: entry.matches.map(m => `${entry.status === "full" ? entry.completeScan ? "Exact" : "Exact (partial scan)" : "Near"}: ${m.name} (${m.matchedCount}/${m.requiredCount})`).join(" · "),
        observedAt: entry.observedAt,
      }), "No exact or near matches in the available scans."),
      lane("leaderboard", "Leaderboard friends", lens.leaderboardFriends),
      lane("following", "Following (this account follows them)", lens.following, undefined, "No saved outgoing follows; the list may be uninspected.")
    );
    host.append(summary, counts, listCoverage, note, grid);
  }

  function renderSocialGraph() {
    const target = referenceAccount();
    renderWebsiteCoverage();
    renderCensusCoverage();
    renderRelationshipLens(target);
    if (!target) {
      byId("social-coverage").textContent = "No main account selected";
      byId("social-summary").textContent = "Choose an account to explore its saved social connections.";
      if (graphView) { graphView.destroy(); graphView = null; }
      byId("social-graph").replaceChildren(); byId("capability-details").replaceChildren(); renderObservedFriends(null); return;
    }
    const view = core.oneHopNetwork(state.network, target.id, 12);
    const readable = ["friends", "followers", "following"].some(kind => core.socialList(target, kind).readable);
    const badge = byId("social-coverage"); badge.classList.toggle("is-known", view.totalEdges > 0);
    badge.textContent = view.totalEdges ? `${view.totalEdges} observed link${view.totalEdges === 1 ? "" : "s"}` : readable ? "No links observed" : "Coverage unknown";
    byId("social-summary").textContent = `Start at ${personLabel(target)} and expand saved connections to leaderboard accounts or verified RBI preset matches. Select a node to inspect its evidence. The main account stays fixed until you choose Use as main account.`;
    const options = {network: state.network, historicalEdges: state.data.historical_friend_edges, avatarNodes: state.data.network_nodes, accounts: state.accounts, focusId: target.id, core, usernamePatterns: patterns,
      onCompare: id => chooseCandidate(id, true),
      onReference: (id, person) => chooseTarget(person || state.network.nodes.get(id))};
    if (graphView) graphView.update(options);
    else graphView = window.FischNetworkGraph.mount(byId("social-graph"), options);
    renderObservedFriends(view);
    renderCapabilityDetails(target);
  }

  function compactSocial(comparison) {
    if (comparison.social.observedCount > 0) return `${comparison.social.observedCount} observed direct link${comparison.social.observedCount === 1 ? "" : "s"}`;
    const states = [comparison.social.friends, comparison.social.targetFollowsCandidate, comparison.social.candidateFollowsTarget];
    return states.some(relation => relation.status === "unknown") ? "Social links unknown" : "No direct link observed in complete lists";
  }

  function renderCandidates() {
    const all = allCandidates();
    const term = state.filter.trim().replace(/^@/, "").toLowerCase();
    const filtered = all.filter(item => !term || item.account.username.toLowerCase().includes(term) || item.account.id.includes(term) || (item.account.aliases || []).some(alias => String(alias).toLowerCase().includes(term)));
    const wrapper = byId("candidate-list"); wrapper.replaceChildren();
    byId("candidate-count").textContent = `${filtered.length} / ${allCandidates(false).length}`;
    const scopeLabel = state.scope === "latest" ? `latest photographed Top 50 (${state.data.ledger_latest_checkpoint?.day_key || "date unavailable"})` : "all cached historical and reference accounts";
    byId("candidate-description").textContent = state.targetId ? `Comparing ${scopeLabel}. The reference account is excluded. Username patterns, avatar matches and observed social links are separate review signals.` : "Select a cached reference account to load comparisons.";
    if (!state.targetId) { wrapper.append(node("p", "nw-empty", "The requested reference is not available in this snapshot. No comparison has been calculated.")); return; }
    if (!filtered.length) { wrapper.append(node("p", "nw-empty", "No accounts match these filters. Try another username, choose All accounts, or include all history.")); return; }
    for (const comparison of filtered) {
      const account = comparison.account, cosmetics = comparison.avatar.groups.cosmetic;
      const button = node("button", "nw-candidate"); button.type = "button";
      button.setAttribute("aria-pressed", String(account.id === state.compareId)); button.setAttribute("aria-label", `Compare reference with ${account.username}`);
      const head = node("span", "nw-candidate-head");
      const name = node("span", "nw-candidate-name", `@${account.username}`); name.append(node("small", "", `ID ${account.id}`));
      head.append(accountImage(account), name, node("span", "nw-rank", account.latest_rank ? `#${account.latest_rank}` : account.ledger ? "History" : "Reference"));
      const metrics = node("span", "nw-candidate-metrics");
      const assets = node("span"); assets.append("Cosmetics: ", node("strong", "", cosmetics ? `${cosmetics.sharedCount} shared · ${percentage(cosmetics.jaccard)}` : "unavailable"));
      const names = node("span", `nw-name-pattern is-${comparison.namePattern.tier}`); names.append("Username: ", node("strong", "", comparison.namePattern.label));
      if (comparison.namePattern.reasons.length) names.title = comparison.namePattern.reasons.join(" ");
      const social = node("span", `nw-wide${comparison.social.observedCount ? " nw-observed" : ""}`, compactSocial(comparison));
      metrics.append(assets, names);
      if (["strong", "possible"].includes(comparison.namePattern.tier)) metrics.append(node("span", "nw-wide nw-name-reason", comparison.namePattern.reasons[0]));
      metrics.append(social); button.append(head, reviewBadge(comparison.review), metrics);
      button.addEventListener("click", () => chooseCandidate(account.id, true)); wrapper.append(button);
    }
  }

  function avatarCard(account, label) {
    const card = node("article", "nw-avatar-card"), picture = node("div", "nw-avatar-picture"), copy = node("div", "nw-avatar-copy");
    picture.append(accountImage(account, true));
    copy.append(node("p", "nw-kicker", label), externalLink(`@${account.username}`, core.profileUrl(account.id)), node("small", "", `Roblox ID ${account.id}`));
    const checked = node("small"); checked.append("Avatar checked ", checkedTime(account.avatar?.fetched_at, "time unavailable")); copy.append(checked);
    card.append(picture, copy); return card;
  }
  function metric(label, value, description) {
    const card = node("div", "nw-metric"); card.append(node("span", "", label), node("strong", "", value), node("p", "", description)); return card;
  }
  function relationRow(label, relation) {
    const row = node("li");
    const status = relation.status === "observed" ? "Observed" : relation.status === "not_observed" ? "Not in complete cached list" : "Unknown";
    const result = node("strong", relation.status === "observed" ? "is-known" : "", status);
    const dates = relation.evidence.map(item => time.toUTC(item.fetched_at)).filter(Boolean);
    if (dates.length) result.title = `Source checks: ${[...new Set(dates)].join(", ")}`;
    const heading = node("div", "nw-relation-summary"); heading.append(node("span", "", label), result); row.append(heading);
    if (relation.evidence.length) {
      const details = node("details", "nw-friend-proof"); details.append(node("summary", "", "Observation sources & times"), evidenceList(relation.evidence)); row.append(details);
    }
    return row;
  }
  function sourceProvenance(account, kinds) {
    const wrapper = node("div", "nw-provenance");
    for (const kind of kinds) {
      const record = account[kind], line = node("div");
      line.append(`@${account.username} · ${kind} · ${methodLabel(record)}: `, checkedTime(record?.fetched_at, record?.attempted === false ? "not individually requested" : "check time unavailable"));
      if (kind !== "avatar") line.append(` · ${coverageText(record)}`);
      if (record?.checked_at && record.checked_at !== record.fetched_at) line.append(" · last attempted ", checkedTime(record.checked_at));
      const url = core.sourceUrl(record?.source_url);
      if (url) line.append(" · ", externalLink("Source", url));
      wrapper.append(line);
      if (kind === "friends" && account.friend_evidence?.api) {
        const api = account.friend_evidence.api, original = node("div");
        original.append(`@${account.username} · separate API record: ${coverageText(api)} · `, checkedTime(api.checked_at || api.fetched_at, "not individually requested"));
        const apiUrl = core.sourceUrl(api.source_url);
        if (apiUrl) original.append(" · ", externalLink("API source", apiUrl));
        wrapper.append(original);
      }
    }
    return wrapper;
  }

  function renderSharedAssets(container, comparison) {
    container.replaceChildren();
    const assets = comparison.avatar.sharedAssets;
    if (!comparison.avatar.available) { container.append(node("p", "", "Equipped assets are unavailable for one or both accounts, so overlap cannot be calculated.")); return; }
    if (!assets.length) { container.append(node("p", "", "No shared asset IDs were observed in these two readable avatar records.")); return; }
    const tabs = node("div", "nw-asset-tabs"); tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "Filter shared asset types");
    const options = [["all", "All"], ["cosmetic", "Cosmetics"], ["body", "Body"], ["animation", "Animations"], ["other", "Other"]];
    for (const [id, label] of options) {
      const count = id === "all" ? assets.length : assets.filter(asset => asset.group === id).length;
      if (id !== "all" && !count) continue;
      const button = node("button", "", `${label} ${count}`); button.type = "button"; button.setAttribute("aria-pressed", String(state.assetFilter === id));
      button.addEventListener("click", () => { state.assetFilter = id; renderSharedAssets(container, comparison); }); tabs.append(button);
    }
    const list = node("ul", "nw-asset-list");
    for (const asset of assets.filter(item => state.assetFilter === "all" || item.group === state.assetFilter)) {
      const item = node("li"); item.append(externalLink(asset.name || `Asset ${asset.id}`, core.assetUrl(asset.id)), node("small", "", `ID ${asset.id} · ${asset.type_name || "Unspecified type"} · ${GROUP_LABELS[asset.group]}`)); list.append(item);
    }
    container.append(tabs, list);
  }

  function renderComparison() {
    const wrapper = byId("comparison-content"); wrapper.replaceChildren(); byId("share-status").textContent = "";
    const target = referenceAccount(), candidate = state.byId.get(state.compareId);
    byId("share-comparison").disabled = !candidate;
    if (!target || !candidate) { wrapper.append(node("p", "nw-empty", "Choose another account to inspect its public data beside the reference.")); return; }
    const comparison = core.compareAccounts(target, candidate), avatar = comparison.avatar, namePattern = comparison.namePattern;
    const pair = node("div", "nw-avatar-pair"); pair.append(avatarCard(target, "REFERENCE"), avatarCard(candidate, "COMPARISON")); wrapper.append(pair);
    const reviewSection = node("section", "nw-detail-section nw-preset-review"); reviewSection.append(node("h3", "", "Avatar preset review"));
    const reviewPair = node("div", "nw-review-pair"); reviewPair.append(avatarReviewCard(target, "REFERENCE"), avatarReviewCard(candidate, "COMPARISON")); reviewSection.append(reviewPair); wrapper.append(reviewSection);
    const metrics = node("div", "nw-metrics"), cosmetics = avatar.groups.cosmetic;
    metrics.append(metric("Cosmetic asset overlap", cosmetics ? cosmetics.unionCount ? `${cosmetics.sharedCount} shared` : "No cosmetics" : "Unavailable", cosmetics ? `${percentage(cosmetics.jaccard)} Jaccard · ${cosmetics.sharedCount} shared IDs / ${cosmetics.unionCount} unique IDs across both accounts` : "Both equipped-asset records are needed."));
    metrics.append(metric("Username pattern", namePattern.label, namePattern.reasons.join(" ")));
    wrapper.append(metrics);
    if (avatar.available) wrapper.append(node("p", "nw-help", `Compared separately: ${avatar.groups.body.sharedCount} shared body/face assets; ${avatar.groups.animation.sharedCount} shared animations; ${avatar.groups.other.sharedCount} other shared assets.`));
    if (avatar.exactAssetSet) wrapper.append(node("p", "nw-match-note", avatar.configurationMatch === true ? "Matching equipped assets and recorded avatar settings." : avatar.configurationMatch === false ? "Matching equipped assets; recorded body colors, scales or rig settings differ." : "Matching equipped assets. Full appearance settings are not available to verify an identical avatar configuration."));

    const social = node("section", "nw-detail-section"); social.append(node("h3", "", "Friend & follow evidence"));
    const relations = node("ul", "nw-relation-list");
    relations.append(relationRow("Friend link", comparison.social.friends), relationRow(`@${target.username} follows @${candidate.username}`, comparison.social.targetFollowsCandidate), relationRow(`@${candidate.username} follows @${target.username}`, comparison.social.candidateFollowsTarget)); social.append(relations);
    const shared = comparison.sharedFriends;
    social.append(node("p", "", !shared.available ? "Shared friends: unknown; both friend lists must be readable." : shared.complete ? `Shared friends in complete cached lists: ${shared.count}.` : shared.count > 0 ? `At least ${shared.count} shared friend${shared.count === 1 ? "" : "s"} observed. One or both lists are partial.` : "No shared friends observed in the partial lists. The complete overlap is unknown."));
    if (shared.items.length) {
      const names = node("ul", "nw-shared-friend-evidence");
      for (const friend of shared.items) {
        const row = node("li"); row.append(externalLink(personLabel(friend), core.profileUrl(friend.id)), node("small", "", `Roblox ID ${friend.id}`), evidenceList(friend.evidence)); names.append(row);
      }
      social.append(names);
    }
    const details = node("details", "nw-source-details"); details.append(node("summary", "", "Check times & list coverage"), sourceProvenance(target, ["friends", "followers", "following"]), sourceProvenance(candidate, ["friends", "followers", "following"]));
    social.append(details); wrapper.append(social);

    const assets = node("section", "nw-detail-section"); assets.append(node("h3", "", "Shared equipped assets"));
    const assetContent = node("div"); assets.append(assetContent); renderSharedAssets(assetContent, comparison);
    const provenance = node("details", "nw-source-details"); provenance.append(node("summary", "", "Avatar source checks"), sourceProvenance(target, ["avatar"]), sourceProvenance(candidate, ["avatar"]));
    assets.append(provenance); wrapper.append(assets);
    const explanation = node("p", "nw-help", "These comparisons describe public account features. Similar names or outfits do not establish shared ownership."); wrapper.append(explanation);
  }

  async function init() {
    try {
      const response = await fetch("network-data.json", {cache: "no-cache"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.accounts)) throw new Error("Unsupported account snapshot format");
      state.data = data;
      for (const account of data.accounts) {
        const id = core.normalizeId(account?.id);
        if (!id || typeof account.username !== "string" || !account.username.trim() || state.byId.has(id)) continue;
        const normalized = {...account, id}; state.accounts.push(normalized); state.byId.set(id, normalized);
        if (account.avatar?.status === "ok" && Array.isArray(account.avatar.assets)) for (const asset of account.avatar.assets) {
          const assetId = core.normalizeId(asset?.id);
          if (assetId && !state.assetCatalog.has(assetId)) state.assetCatalog.set(assetId, {...asset, id: assetId});
        }
      }
      if (!state.accounts.length) throw new Error("No cached accounts are available");
      state.network = core.socialNetwork(state.accounts, Array.isArray(data.network_nodes) ? data.network_nodes : []);
      const cache = byId("cache-time"); cache.replaceChildren(checkedTime(data.generated_at, "Snapshot time unavailable"));
      byId("cache-coverage").textContent = `${state.accounts.length} accounts · ${state.accounts.filter(account => account.avatar?.status === "ok").length} readable avatars`;
      for (const account of [...state.accounts].sort((a, b) => a.username.localeCompare(b.username))) {
        const option = node("option"); option.value = account.username; option.label = `ID ${account.id}${account.latest_rank ? ` · latest #${account.latest_rank}` : account.ledger ? " · ledger history" : " · reference"}`; byId("target-options").append(option);
      }
      state.top50Accounts = state.accounts.filter(account => account.ledger && Number.isInteger(account.latest_rank) && account.latest_rank >= 1 && account.latest_rank <= 50).sort((a, b) => a.latest_rank - b.latest_rank || a.id.localeCompare(b.id));
      const params = new URLSearchParams(location.search), requestedTarget = core.normalizeId(params.get("target")), requestedCompare = core.normalizeId(params.get("compare"));
      if (["avatar", "name", "social", "review"].includes(params.get("sort"))) state.sort = params.get("sort");
      if (["full", "partial", "none", "unknown"].includes(params.get("review"))) state.reviewFilter = params.get("review");
      state.targetId = params.has("target") ? state.network.nodes.has(requestedTarget) ? requestedTarget : null : state.byId.has("12013950464") ? "12013950464" : state.accounts[0].id;
      state.compareId = state.targetId && state.byId.has(requestedCompare) && requestedCompare !== state.targetId ? requestedCompare : null;
      if (state.compareId && !core.matchesReviewFilter(core.reviewAvatar(state.byId.get(state.compareId).avatar), state.reviewFilter)) state.reviewFilter = "all";
      if (params.get("scope") === "all" || state.compareId && (!state.byId.get(state.compareId).ledger || !state.byId.get(state.compareId).latest_rank)) state.scope = "all";
      byId("candidate-scope").value = state.scope;
      byId("candidate-sort").value = state.sort;
      byId("candidate-review-filter").value = state.reviewFilter;
      ensureComparison(); byId("target-input").value = referenceAccount()?.username || requestedTarget || "";
      renderTop50List();
      byId("networker-app").hidden = false; setStatus("");
      if (params.has("target") && !state.targetId) setStatus(requestedTarget ? `Roblox account ID ${requestedTarget} is not in this snapshot. Select another cached reference account, or return after the snapshot is refreshed.` : "The requested reference ID is invalid. Select a cached account to begin.", true);
      updateUrl(); renderPresetLibrary(); renderReference(); renderReviewOverview(); renderSocialGraph(); renderCandidates(); renderComparison();

      byId("target-input").addEventListener("input", event => renderTop50List(event.target.value));
      byId("target-form").addEventListener("submit", event => { event.preventDefault(); chooseTarget(accountFromInput(byId("target-input").value)); });
      byId("target-input").addEventListener("change", () => { const account = accountFromInput(byId("target-input").value); if (account) chooseTarget(account); });
      byId("candidate-scope").addEventListener("change", event => { state.scope = event.target.value; ensureComparison(); updateUrl(); renderReviewOverview(); renderCandidates(); renderComparison(); });
      byId("candidate-sort").addEventListener("change", event => { state.sort = event.target.value; updateUrl(); renderCandidates(); });
      byId("candidate-review-filter").addEventListener("change", event => applyReviewFilter(event.target.value));
      byId("candidate-search").addEventListener("input", event => { state.filter = event.target.value; renderCandidates(); });
      byId("friend-search").addEventListener("input", event => {
        state.friendFilter = event.target.value; state.friendLimit = 50;
        renderObservedFriends(core.oneHopNetwork(state.network, state.targetId, 12));
      });
      byId("friend-load-more").addEventListener("click", () => {
        state.friendLimit += 50; renderObservedFriends(core.oneHopNetwork(state.network, state.targetId, 12));
      });
      byId("share-comparison").addEventListener("click", async () => {
        const url = location.href;
        try { await navigator.clipboard.writeText(url); if (location.href === url) byId("share-status").textContent = "Comparison link copied."; }
        catch { byId("share-status").textContent = "Copy the page address from your browser to share this comparison."; }
      });
    } catch (error) {
      byId("networker-app").hidden = true;
      byId("cache-time").textContent = "Snapshot unavailable";
      byId("cache-coverage").textContent = "No comparison results loaded";
      setStatus(`The account snapshot could not be loaded (${error.message}). Reload this page to try again.`, true);
    }
  }
  init();
})();

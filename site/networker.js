(function () {
  "use strict";
  const core = window.FischNetworker, time = window.FischTime;
  const byId = id => document.getElementById(id);
  const state = {data: null, accounts: [], byId: new Map(), assetCatalog: new Map(), targetId: null, compareId: null, scope: "latest", sort: "review", reviewFilter: "all", filter: "", assetFilter: "all"};
  const viewerZone = time.viewerTimeZone();
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
    const element = node("time", "", new Intl.DateTimeFormat("en-US", {timeZone: viewerZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"}).format(new Date(canonical)));
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
  function accountFromInput(value) {
    const query = value.trim().replace(/^@/, "").toLowerCase();
    return state.byId.get(core.normalizeId(query)) || state.accounts.find(account => account.username.toLowerCase() === query);
  }
  function allCandidates(filtered = true) {
    if (!state.targetId) return [];
    return core.candidates(state.accounts, state.byId.get(state.targetId), state.scope, state.sort, filtered ? state.reviewFilter : "all");
  }
  function ensureComparison() {
    const choices = allCandidates();
    if (!choices.some(item => item.account.id === state.compareId)) state.compareId = choices[0]?.account.id || null;
  }
  function chooseTarget(account) {
    if (!account) { setStatus("Choose a username or Roblox ID that appears in this cached snapshot.", true); return; }
    state.targetId = account.id;
    byId("target-input").value = account.username;
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
    const account = state.byId.get(state.targetId), wrapper = byId("reference-summary");
    if (!account) {
      wrapper.replaceChildren(node("p", "nw-empty", "Choose a cached reference account above to begin a comparison."));
      return;
    }
    wrapper.replaceChildren(accountImage(account));
    const detail = node("div");
    detail.append(node("p", "nw-kicker", "REFERENCE ACCOUNT"), node("h2", "", `@${account.username}`));
    const place = account.latest_rank ? `Latest board rank #${account.latest_rank}` : account.ledger ? `Previously photographed · last seen ${account.last_seen_day || "date unavailable"}` : "Reference account · outside the photographed ledger";
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

  function coverageText(record) {
    if (record?.status === "complete") return `Complete cached list · ${Array.isArray(record.items) ? record.items.length : "unknown"} records`;
    if (record?.status === "partial") return `Partial cached list · ${Array.isArray(record.items) ? record.items.length : "unknown"} observed records`;
    if (record?.attempted === false) return "Unknown · not individually requested after source access failed";
    return `Unknown · source unavailable${record?.http_status ? ` (HTTP ${record.http_status})` : ""}`;
  }

  function renderCapabilityDetails(target) {
    const wrapper = byId("capability-details"); wrapper.replaceChildren(); wrapper.className = "nw-capabilities";
    for (const kind of ["friends", "followers", "following"]) {
      const capability = state.data.capabilities?.[kind], record = target[kind];
      const card = node("div", "nw-capability"); card.append(node("strong", "", SOCIAL_LABELS[kind]), node("p", "", coverageText(record)));
      if (capability?.reason) card.append(node("p", "", capability.reason));
      const when = node("p"); when.append("Reference list returned: ", checkedTime(record?.fetched_at, "no readable list collected")); card.append(when);
      if (record?.checked_at && record.checked_at !== record.fetched_at) {
        const attempt = node("p"); attempt.append("Last collection attempt: ", checkedTime(record.checked_at)); card.append(attempt);
      }
      if (capability?.checked_at) { const probe = node("p"); probe.append("Source access checked: ", checkedTime(capability.checked_at)); card.append(probe); }
      const url = core.sourceUrl(record?.source_url || capability?.source_url);
      if (url) card.append(externalLink("Official source endpoint", url));
      wrapper.append(card);
    }
  }

  function renderSocialGraph() {
    const target = state.byId.get(state.targetId);
    if (!target) {
      byId("social-coverage").textContent = "No reference selected";
      byId("social-summary").textContent = "Choose a cached account to inspect its available social records.";
      byId("social-graph").replaceChildren(); byId("capability-details").replaceChildren();
      return;
    }
    const edges = core.knownEdges(state.accounts);
    const touching = edges.filter(edge => edge.from === target.id || edge.to === target.id);
    const connectedIds = [...new Set(touching.map(edge => edge.from === target.id ? edge.to : edge.from))];
    const readable = ["friends", "followers", "following"].filter(kind => core.socialList(target, kind).readable);
    const wrapper = byId("social-graph"); wrapper.replaceChildren();
    const badge = byId("social-coverage"); badge.classList.toggle("is-known", touching.length > 0);
    if (!touching.length) {
      badge.textContent = readable.length ? "No links observed" : "Unavailable";
      byId("social-summary").textContent = readable.length ?
        "No links between this reference and other cached accounts appear in the readable lists. Partial and unavailable lists remain unknown." :
        "Friend and follow lists were unavailable for this reference during collection. No social graph can be established from these records. Avatar and username comparisons are available below.";
      renderCapabilityDetails(target); return;
    }
    badge.textContent = `${touching.length} observed link${touching.length === 1 ? "" : "s"}`;
    byId("social-summary").textContent = `Showing recorded links between @${target.username} and other accounts in the snapshot. Only returned account IDs create edges; missing lists do not rule out other links.${connectedIds.length > 10 ? " The graph shows the first 10 connected accounts." : ""}`;
    const shown = connectedIds.sort((a, b) => state.byId.get(a).username.localeCompare(state.byId.get(b).username)).slice(0, 10);
    const included = new Set([target.id, ...shown]);
    const svgNS = "http://www.w3.org/2000/svg";
    const svgNode = (tag, attrs = {}, text) => { const el = document.createElementNS(svgNS, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); if (text !== undefined) el.textContent = text; return el; };
    const svg = svgNode("svg", {viewBox: "0 0 760 420", class: "nw-graph", role: "img", "aria-label": `Observed friend and directed follow links for ${target.username}`});
    const defs = svgNode("defs"), marker = svgNode("marker", {id: "nw-follow-arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse"});
    marker.append(svgNode("path", {d: "M 0 0 L 10 5 L 0 10 z", fill: "#ffd166"})); defs.append(marker); svg.append(defs);
    const positions = new Map([[target.id, {x: 380, y: 210}]]);
    shown.forEach((id, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / shown.length; positions.set(id, {x: 380 + Math.cos(angle) * 285, y: 210 + Math.sin(angle) * 140}); });
    for (const edge of edges.filter(item => included.has(item.from) && included.has(item.to))) {
      const a = positions.get(edge.from), b = positions.get(edge.to), angle = Math.atan2(b.y - a.y, b.x - a.x);
      const x1 = a.x + Math.cos(angle) * 29, y1 = a.y + Math.sin(angle) * 29;
      const x2 = b.x - Math.cos(angle) * 32, y2 = b.y - Math.sin(angle) * 32;
      const path = svgNode("path", {d: edge.kind === "friend" ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} Q ${(x1 + x2) / 2 - Math.sin(angle) * 19} ${(y1 + y2) / 2 + Math.cos(angle) * 19} ${x2} ${y2}`, class: `nw-edge-${edge.kind}`});
      if (edge.kind === "follow") path.setAttribute("marker-end", "url(#nw-follow-arrow)");
      path.append(svgNode("title", {}, edge.kind === "friend" ? `${state.byId.get(edge.from).username} and ${state.byId.get(edge.to).username}: observed friend link` : `${state.byId.get(edge.from).username} follows ${state.byId.get(edge.to).username}`));
      svg.append(path);
    }
    for (const [id, point] of positions) {
      const account = state.byId.get(id), isTarget = id === target.id;
      const group = svgNode("g", {class: "nw-node", transform: `translate(${point.x}, ${point.y})`, role: "button", tabindex: "0", "aria-label": isTarget ? `Reference: ${account.username}` : `Compare ${account.username}`});
      group.append(svgNode("circle", {r: 27, fill: "#102d44", stroke: isTarget ? "#29f8ff" : "#9cbdcc", "stroke-width": isTarget ? 2.5 : 1.5}));
      group.append(svgNode("text", {y: 5, "font-weight": "700"}, account.username.slice(0, 2).toUpperCase()));
      group.append(svgNode("text", {y: 46}, account.username.length > 17 ? account.username.slice(0, 15) + "…" : account.username));
      group.append(svgNode("title", {}, `@${account.username} · Roblox ID ${id}`));
      group.addEventListener("click", () => chooseCandidate(id, true));
      group.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseCandidate(id, true); } });
      svg.append(group);
    }
    wrapper.append(svg);
    const legend = node("p", "nw-graph-legend"); legend.append(node("span", "", "Solid cyan: friendship"), node("span", "", "Gold arrows: following direction")); wrapper.append(legend);
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
    byId("candidate-description").textContent = state.targetId ? `Comparing ${scopeLabel}. The reference account is excluded. Shared cosmetics and username text are separate comparisons.` : "Select a cached reference account to load comparisons.";
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
      const names = node("span"); names.append("Username: ", node("strong", "", percentage(comparison.name.similarity)));
      const social = node("span", `nw-wide${comparison.social.observedCount ? " nw-observed" : ""}`, compactSocial(comparison));
      metrics.append(assets, names, social); button.append(head, reviewBadge(comparison.review), metrics);
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
    row.append(node("span", "", label), result); return row;
  }
  function sourceProvenance(account, kinds) {
    const wrapper = node("div", "nw-provenance");
    for (const kind of kinds) {
      const record = account[kind], line = node("div");
      line.append(`@${account.username} · ${kind}: `, checkedTime(record?.fetched_at, record?.attempted === false ? "not individually requested" : "check time unavailable"));
      if (kind !== "avatar") line.append(` · ${coverageText(record)}`);
      if (record?.checked_at && record.checked_at !== record.fetched_at) line.append(" · last attempted ", checkedTime(record.checked_at));
      const url = core.sourceUrl(record?.source_url);
      if (url) line.append(" · ", externalLink("Source", url));
      wrapper.append(line);
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
    const target = state.byId.get(state.targetId), candidate = state.byId.get(state.compareId);
    byId("share-comparison").disabled = !candidate;
    if (!candidate) { wrapper.append(node("p", "nw-empty", "Choose another account to inspect its public data beside the reference.")); return; }
    const comparison = core.compareAccounts(target, candidate), avatar = comparison.avatar, names = comparison.name;
    const pair = node("div", "nw-avatar-pair"); pair.append(avatarCard(target, "REFERENCE"), avatarCard(candidate, "COMPARISON")); wrapper.append(pair);
    const reviewSection = node("section", "nw-detail-section nw-preset-review"); reviewSection.append(node("h3", "", "Avatar preset review"));
    const reviewPair = node("div", "nw-review-pair"); reviewPair.append(avatarReviewCard(target, "REFERENCE"), avatarReviewCard(candidate, "COMPARISON")); reviewSection.append(reviewPair); wrapper.append(reviewSection);
    const metrics = node("div", "nw-metrics"), cosmetics = avatar.groups.cosmetic;
    metrics.append(metric("Cosmetic asset overlap", cosmetics ? cosmetics.unionCount ? `${cosmetics.sharedCount} shared` : "No cosmetics" : "Unavailable", cosmetics ? `${percentage(cosmetics.jaccard)} Jaccard · ${cosmetics.sharedCount} shared IDs / ${cosmetics.unionCount} unique IDs across both accounts` : "Both equipped-asset records are needed."));
    metrics.append(metric("Username text similarity", percentage(names.similarity), names.available ? `${names.distance} edit${names.distance === 1 ? "" : "s"} / ${names.maxLength} characters in the longer username. Display names are excluded.` : "Both usernames are needed."));
    wrapper.append(metrics);
    if (avatar.available) wrapper.append(node("p", "nw-help", `Compared separately: ${avatar.groups.body.sharedCount} shared body/face assets; ${avatar.groups.animation.sharedCount} shared animations; ${avatar.groups.other.sharedCount} other shared assets.`));
    if (avatar.exactAssetSet) wrapper.append(node("p", "nw-match-note", avatar.configurationMatch === true ? "Matching equipped assets and recorded avatar settings." : avatar.configurationMatch === false ? "Matching equipped assets; recorded body colors, scales or rig settings differ." : "Matching equipped assets. Full appearance settings are not available to verify an identical avatar configuration."));

    const social = node("section", "nw-detail-section"); social.append(node("h3", "", "Friend & follow evidence"));
    const relations = node("ul", "nw-relation-list");
    relations.append(relationRow("Friend link", comparison.social.friends), relationRow(`@${target.username} follows @${candidate.username}`, comparison.social.targetFollowsCandidate), relationRow(`@${candidate.username} follows @${target.username}`, comparison.social.candidateFollowsTarget)); social.append(relations);
    const shared = comparison.sharedFriends;
    social.append(node("p", "", !shared.available ? "Shared friends: unknown; both friend lists must be readable." : shared.complete ? `Shared friends in complete cached lists: ${shared.count}.` : shared.count > 0 ? `At least ${shared.count} shared friend${shared.count === 1 ? "" : "s"} observed. One or both lists are partial.` : "No shared friends observed in the partial lists. The complete overlap is unknown."));
    if (shared.items.length) {
      const names = node("div", "nw-shared-friends");
      for (const friend of shared.items) names.append(externalLink(friend.username ? `@${friend.username}` : `ID ${friend.id}`, core.profileUrl(friend.id)));
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
      const cache = byId("cache-time"); cache.replaceChildren(checkedTime(data.generated_at, "Snapshot time unavailable"));
      byId("cache-coverage").textContent = `${state.accounts.length} accounts · ${state.accounts.filter(account => account.avatar?.status === "ok").length} readable avatars`;
      for (const account of [...state.accounts].sort((a, b) => a.username.localeCompare(b.username))) {
        const option = node("option"); option.value = account.username; option.label = `ID ${account.id}${account.latest_rank ? ` · latest #${account.latest_rank}` : account.ledger ? " · ledger history" : " · reference"}`; byId("target-options").append(option);
      }
      const params = new URLSearchParams(location.search), requestedTarget = core.normalizeId(params.get("target")), requestedCompare = core.normalizeId(params.get("compare"));
      if (["avatar", "name", "social", "review"].includes(params.get("sort"))) state.sort = params.get("sort");
      if (["full", "partial", "none", "unknown"].includes(params.get("review"))) state.reviewFilter = params.get("review");
      state.targetId = params.has("target") ? state.byId.has(requestedTarget) ? requestedTarget : null : state.byId.has("12013950464") ? "12013950464" : state.accounts[0].id;
      state.compareId = state.targetId && state.byId.has(requestedCompare) && requestedCompare !== state.targetId ? requestedCompare : null;
      if (state.compareId && !core.matchesReviewFilter(core.reviewAvatar(state.byId.get(state.compareId).avatar), state.reviewFilter)) state.reviewFilter = "all";
      if (params.get("scope") === "all" || state.compareId && (!state.byId.get(state.compareId).ledger || !state.byId.get(state.compareId).latest_rank)) state.scope = "all";
      byId("candidate-scope").value = state.scope;
      byId("candidate-sort").value = state.sort;
      byId("candidate-review-filter").value = state.reviewFilter;
      ensureComparison(); byId("target-input").value = state.byId.get(state.targetId)?.username || requestedTarget || "";
      byId("networker-app").hidden = false; setStatus("");
      if (params.has("target") && !state.targetId) setStatus(requestedTarget ? `Roblox account ID ${requestedTarget} is not in this snapshot. Select another cached reference account, or return after the snapshot is refreshed.` : "The requested reference ID is invalid. Select a cached account to begin.", true);
      updateUrl(); renderPresetLibrary(); renderReference(); renderReviewOverview(); renderSocialGraph(); renderCandidates(); renderComparison();

      byId("target-form").addEventListener("submit", event => { event.preventDefault(); chooseTarget(accountFromInput(byId("target-input").value)); });
      byId("target-input").addEventListener("change", () => { const account = accountFromInput(byId("target-input").value); if (account) chooseTarget(account); });
      byId("candidate-scope").addEventListener("change", event => { state.scope = event.target.value; ensureComparison(); updateUrl(); renderReviewOverview(); renderCandidates(); renderComparison(); });
      byId("candidate-sort").addEventListener("change", event => { state.sort = event.target.value; updateUrl(); renderCandidates(); });
      byId("candidate-review-filter").addEventListener("change", event => applyReviewFilter(event.target.value));
      byId("candidate-search").addEventListener("input", event => { state.filter = event.target.value; renderCandidates(); });
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

(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FischNetworkGraph = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const NODE_WIDTH = 224, NODE_HEIGHT = 72, MAX_NODES = 120;
  const DEFAULT_LANE_LIMITS = Object.freeze({up: 4, right: 8, down: 4, left: 5});
  const LANE_NAMES = Object.freeze({up: "↑ Following", right: "→ Leaderboard", down: "↓ Followers", left: "← External leads"});
  let instanceCount = 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const name = node => node?.username ? `@${node.username}` : node?.display_name || `ID ${node?.id || "unknown"}`;
  const rank = node => Number.isInteger(node?.latest_rank) && node.latest_rank > 0 ? node.latest_rank : null;

  // Eligibility filters nodes; it never creates a relationship between them.
  function eligibility(node, core) {
    const avatar = node?.avatar;
    const incomplete = avatar?.status === "partial";
    const unavailable = Boolean(avatar && !incomplete && avatar.status !== "ok");
    // A partial scan can prove a positive if every required ID was observed,
    // but missing IDs on an incomplete scan cannot establish a nonmatch.
    const review = core.reviewAvatar(incomplete ? {...avatar, status: "ok"} : avatar);
    const ledger = node?.ledger === true;
    const full = review.available && review.fullMatches.length > 0;
    const partial = review.available && !full && review.partialMatches.length > 0;
    return {eligible: Boolean(ledger || full), ledger,
      category: ledger ? "ledger" : full ? "full" : partial ? "partial" : review.available && !incomplete ? "none" : "unknown",
      review, incomplete, unavailable, matches: full ? review.fullMatches : partial ? review.partialMatches : [],
      label: ledger ? rank(node) ? `Leaderboard #${rank(node)}` : "Leaderboard history" :
        full ? `Full preset · ${review.fullMatches[0].name}` : partial ? `Partial preset · ${review.partialMatches[0].name}` :
          incomplete ? "Avatar scan incomplete" : review.available ? "No preset match" : unavailable ? "Avatar unavailable" : "Avatar unchecked"};
  }

  function compareNodes(a, b) {
    return Number(b.ledger === true) - Number(a.ledger === true) ||
      (rank(a) || Infinity) - (rank(b) || Infinity) ||
      name(a).localeCompare(name(b), "en", {sensitivity: "base"}) || a.id.localeCompare(b.id);
  }

  function neighborStats(id, model) {
    const neighbors = [...(model.adjacency.get(id) || [])];
    const result = {total: neighbors.length, eligible: 0, ledger: 0, full: 0, connector: 0, external: 0, partial: 0, unchecked: 0, noMatch: 0};
    for (const neighborId of neighbors) {
      const item = model.eligibility.get(neighborId);
      if (item.eligible) result.eligible++;
      if (item.category === "ledger") result.ledger++;
      else if (item.category === "full") result.full++;
      else if (item.category === "connector") result.connector++;
      else if (item.category === "external") result.external++;
      else if (item.category === "partial") result.partial++;
      else if (item.category === "unknown") result.unchecked++;
      else result.noMatch++;
    }
    return result;
  }

  /**
   * Build a rooted, bounded view from recorded friend/follow edges only.
   * Root's direct eligible neighbors are always open. Other branches open only
   * when their ID is in expandedIds. A collapsed subtree may remain reachable
   * through a different expanded branch, as real shared connections should.
   */
  function buildBranches({network, historicalEdges = [], avatarNodes = [], accounts = [], focusId, core, expandedIds = [], includeConnectors = false, includeExternal = false, quadrant = false, laneLimits = null, maxNodes = MAX_NODES}) {
    if (!core?.normalizeId || !core?.reviewAvatar) throw new TypeError("A FischNetworker core is required.");
    const nodesById = new Map();
    for (const node of network?.nodes?.values?.() || []) {
      const id = core.normalizeId(node?.id);
      if (id) nodesById.set(id, {...node, id});
    }
    for (const node of accounts) {
      const id = core.normalizeId(node?.id);
      if (id) nodesById.set(id, {...nodesById.get(id), ...node, id, cached: true});
    }
    // Explicit website captures are projected separately from the cached API
    // account record. The importer only projects a capture if it is not stale.
    for (const scan of Array.isArray(avatarNodes) ? avatarNodes : []) {
      const id = core.normalizeId(scan?.id);
      if (id && nodesById.has(id) && scan.avatar && scan.avatar_preset_review) {
        nodesById.set(id, {...nodesById.get(id), avatar: scan.avatar, avatar_preset_review: scan.avatar_preset_review});
      }
    }
    const eligibilityById = new Map([...nodesById].map(([id, node]) => [id, eligibility(node, core)]));
    const edgeMap = new Map(), adjacency = new Map();
    const connect = (a, b) => { if (!adjacency.has(a)) adjacency.set(a, new Set()); adjacency.get(a).add(b); };
    for (const edge of [...(network?.edges || []), ...(Array.isArray(historicalEdges) ? historicalEdges : [])]) {
      const from = core.normalizeId(edge?.from), to = core.normalizeId(edge?.to);
      // A bare pair or a similarity result is not an observed social edge.
      const evidence = Array.isArray(edge?.evidence) ? edge.evidence.filter(item => item && typeof item === "object") : [];
      if (!["friend", "follow"].includes(edge?.kind) || !from || !to || from === to ||
          !nodesById.has(from) || !nodesById.has(to) || !evidence.length) continue;
      const pair = edge.kind === "friend" ? [from, to].sort() : [from, to];
      const key = `${edge.kind}:${pair.join(":")}`;
      if (!edgeMap.has(key)) edgeMap.set(key, {...edge, from: pair[0], to: pair[1], key, evidence: [], laterChecks: []});
      const saved = edgeMap.get(key);
      saved.evidence.push(...evidence);
      if (Array.isArray(edge.laterChecks)) saved.laterChecks.push(...edge.laterChecks);
      connect(from, to); connect(to, from);
    }
    // An external node can be a useful observable bridge between leaderboard accounts,
    // independent of its username or avatar. Count DISTINCT leaderboard neighbors using
    // only source-backed social edges. Shared text/assets NEVER create graph edges.
    if (includeConnectors || includeExternal) for (const [nodeId, node] of nodesById) {
      const review = eligibilityById.get(nodeId);
      if (review.ledger || review.category === "full") continue;
      const ledgerNeighbors = [...(adjacency.get(nodeId) || [])].filter(otherId => nodesById.get(otherId)?.ledger === true);
      const connector = ledgerNeighbors.length >= 2;
      if (includeConnectors && connector) eligibilityById.set(nodeId, {
        ...review, eligible: true, category: "connector", ledgerConnections: ledgerNeighbors.length,
        label: `Shared external connector · ${ledgerNeighbors.length} ledger accounts`
      });
      else if (includeExternal) eligibilityById.set(nodeId, {
        ...review, eligible: true, category: "external", ledgerConnections: ledgerNeighbors.length,
        label: review.label + " · observed external account"
      });
    }
    const id = core.normalizeId(focusId), root = nodesById.get(id) || null;
    // Classify each directly observed connection ONCE. Other relationship kinds
    // remain represented by separate friend/follow edges and in the inspector.
    // Priority: known ledger → right, external friendship → left, outgoing
    // follow → up, incoming follow → down. No username/avatar similarity
    // ever creates a relationship or direction.
    const lanes = new Map(), laneCounts = {up: 0, down: 0, left: 0, right: 0};
    const laneShown = {up: 0, down: 0, left: 0, right: 0};
    const related = new Map();
    for (const edge of edgeMap.values()) {
      if (edge.from !== id && edge.to !== id) continue;
      const other = edge.from === id ? edge.to : edge.from;
      if (!related.has(other)) related.set(other, {friend: false, following: false, follower: false});
      const state = related.get(other);
      if (edge.kind === "friend") state.friend = true;
      else if (edge.from === id) state.following = true;
      else state.follower = true;
    }
    for (const [other, relation] of related) {
      if (!eligibilityById.get(other)?.eligible) continue;
      const lane = nodesById.get(other)?.ledger ? "right" :
        relation.friend ? "left" : relation.following ? "up" : relation.follower ? "down" : "left";
      lanes.set(other, lane);
      laneCounts[lane]++;
    }
    const cap = name => laneLimits && Number.isFinite(laneLimits[name]) ?
      Math.max(0, Math.floor(laneLimits[name])) : Infinity;
    const priority = (a, b) => {
      const ca = eligibilityById.get(a.id), cb = eligibilityById.get(b.id);
      return Number(cb.category === "connector") - Number(ca.category === "connector") ||
        (cb.ledgerConnections || 0) - (ca.ledgerConnections || 0) || compareNodes(a, b);
    };
    const expanded = new Set([...expandedIds].map(core.normalizeId).filter(Boolean));
    if (id) expanded.add(id);
    const limit = Number.isFinite(maxNodes) ? clamp(Math.floor(maxNodes), 2, MAX_NODES) : MAX_NODES;
    const model = {focusId: id, root, nodesById, eligibility: eligibilityById, adjacency, expanded,
      nodes: [], edges: [], parents: new Map(), depths: new Map(), maxNodes: limit,
      lanes, laneCounts, laneShown, quadrant: Boolean(quadrant),
      omittedEligibleIds: [], hidden: {unchecked: 0, partial: 0, noMatch: 0}};
    if (!root) return model;
    const included = new Set([id]), queue = [id], omitted = new Set(), hidden = new Set();
    const directAllowed = new Set();
    for (const lane of ["right", "left", "up", "down"]) {
      const candidates = [...lanes].filter(([, side]) => side === lane)
        .map(([nodeId]) => nodesById.get(nodeId)).sort(priority);
      for (const person of candidates.slice(0, cap(lane))) directAllowed.add(person.id);
      for (const person of candidates.slice(cap(lane))) omitted.add(person.id);
    }
    model.depths.set(id, 0);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const ownerId = queue[cursor];
      if (!expanded.has(ownerId)) continue;
      const neighbors = [...(adjacency.get(ownerId) || [])].map(otherId => nodesById.get(otherId))
        .sort(ownerId === id ? (a, b) => {
          const order = {right: 0, left: 1, up: 2, down: 3};
          return (order[lanes.get(a.id)] ?? 4) - (order[lanes.get(b.id)] ?? 4) || priority(a, b);
        } : compareNodes);
      for (const node of neighbors) {
        if (!eligibilityById.get(node.id).eligible && node.id !== id) { hidden.add(node.id); continue; }
        if (lanes.has(node.id) && !directAllowed.has(node.id)) { omitted.add(node.id); continue; }
        if (included.has(node.id)) continue;
        if (included.size >= limit) { omitted.add(node.id); continue; }
        included.add(node.id); queue.push(node.id);
        if (ownerId === id) laneShown[lanes.get(node.id)]++;
        model.parents.set(node.id, ownerId); model.depths.set(node.id, model.depths.get(ownerId) + 1);
      }
    }
    model.nodes = queue.map(nodeId => nodesById.get(nodeId));
    model.edges = [...edgeMap.values()].filter(edge => included.has(edge.from) && included.has(edge.to)).map(edge => ({
      ...edge,
      crossLink: model.parents.get(edge.from) !== edge.to && model.parents.get(edge.to) !== edge.from,
      ...edgeObservation(edge, nodesById, core),
    }));
    model.omittedEligibleIds = [...omitted].filter(nodeId => !included.has(nodeId));
    for (const nodeId of hidden) {
      const category = eligibilityById.get(nodeId).category;
      model.hidden[category === "unknown" ? "unchecked" : category === "partial" ? "partial" : "noMatch"]++;
    }
    model.directStats = neighborStats(id, model);
    return model;
  }

  const observationTime = item => Date.parse(item?.observed_at || item?.fetched_at || item?.checked_at || "");

  function edgeObservation(edge, nodesById, core) {
    const {from, to, kind, evidence} = edge;
    const checks = kind === "friend" ? [[from, to, "friends"], [to, from, "friends"]] :
      [[from, to, "following"], [to, from, "followers"]];
    const times = evidence.map(observationTime).filter(Number.isFinite);
    const latest = times.length ? Math.max(...times) : null;
    const laterChecks = (edge.laterChecks || []).filter(check => latest !== null && observationTime(check) > latest &&
      checks.some(([ownerId, , kind]) => check.ownerId === ownerId && check.kind === kind));
    for (const [ownerId, neighborId, listKind] of checks) {
      const node = nodesById.get(ownerId), list = core.socialList(node, listKind);
      if (!list.complete || list.items.has(neighborId)) continue;
      const checked = observationTime(list.record);
      if (latest === null || !Number.isFinite(checked) || checked <= latest) continue;
      laterChecks.push({ownerId, kind: listKind, observed_at: new Date(checked).toISOString(),
        source_url: list.record.source_url, source_label: list.record.source_label || "Later complete Roblox list"});
    }
    const uniqueChecks = [...new Map(laterChecks.map(check => [
      [check.ownerId, check.kind, observationTime(check)].join(":"), check
    ])).values()];
    return {latest, laterChecks: uniqueChecks, status: uniqueChecks.length ? "historical" : latest === null ? "undated" : "latest-saved"};
  }

  function layout(model, manualPositions = new Map()) {
    const positions = new Map(), children = new Map();
    if (!model.root) return positions;
    if (model.quadrant) {
      // Stable 4-way radial rows, one lane per saved connection type. Unlike
      // tree-fit, no lane can form a 55-node column that collapses to 11% zoom.
      const buckets = new Map();
      for (const person of model.nodes) {
        if (person.id === model.focusId) continue;
        let first = person.id;
        while (model.parents.get(first) && model.parents.get(first) !== model.focusId) {
          first = model.parents.get(first);
        }
        const lane = model.lanes.get(first) || "left", depth = model.depths.get(person.id) || 1;
        const key = lane + ":" + depth;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(person.id);
      }
      positions.set(model.focusId, {x: 0, y: 0});
      for (const [key, ids] of buckets) {
        const [lane, depthText] = key.split(":"), depth = Number(depthText);
        ids.forEach((nodeId, index) => {
          const offset = index - (ids.length - 1) / 2;
          const position = lane === "right" ? {x: depth * 380, y: offset * 112} :
            lane === "left" ? {x: -depth * 380, y: offset * 112} :
            lane === "up" ? {x: offset * 260, y: -depth * 260} :
            {x: offset * 260, y: depth * 260};
          const manual = manualPositions.get(nodeId);
          if (Number.isFinite(manual?.x) && Number.isFinite(manual?.y)) {
            position.x = manual.x; position.y = manual.y;
          }
          positions.set(nodeId, position);
        });
      }
      return positions;
    }
    for (const node of model.nodes) children.set(node.id, []);
    for (const [child, parent] of model.parents) children.get(parent).push(child);
    let nextRow = 0;
    function place(id) {
      const branch = children.get(id);
      const ys = branch.map(place);
      const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : nextRow++ * 94;
      positions.set(id, {x: model.depths.get(id) * 306, y});
      return y;
    }
    const center = place(model.focusId);
    for (const [id, position] of positions) {
      position.y -= center;
      const manual = manualPositions.get(id);
      if (id !== model.focusId && Number.isFinite(manual?.x) && Number.isFinite(manual?.y)) {
        position.x = manual.x; position.y = manual.y;
      }
    }
    return positions;
  }

  function edgeGeometry(edge, positions, parents = new Map()) {
    const a = positions.get(edge.from), b = positions.get(edge.to);
    const dx = b.x - a.x, dy = b.y - a.y;
    // Connections within a column travel around the cards rather than behind
    // every intervening account. Different lanes retain reciprocal follow paths.
    if (Math.abs(dx) < NODE_WIDTH / 2 && Math.abs(dy) >= NODE_HEIGHT) {
      const direction = Math.sign(dy), offset = edge.kind === "follow" ? 12 : 0;
      const from = {x: a.x + NODE_WIDTH / 2 + 3, y: a.y + direction * offset};
      const to = {x: b.x + NODE_WIDTH / 2 + 3, y: b.y - direction * offset};
      const middleX = (a.x + b.x) / 2, top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
      const columnRight = Math.max(...[...positions.values()].filter(point =>
        Math.abs(point.x - middleX) < NODE_WIDTH / 2 && point.y >= top && point.y <= bottom
      ).map(point => point.x + NODE_WIDTH / 2 + 3));
      const lane = columnRight + (edge.kind === "friend" ? 24 : direction > 0 ? 44 : 64);
      const radius = Math.min(12, Math.abs(to.y - from.y) / 3);
      return {path: `M ${from.x} ${from.y} L ${lane - radius} ${from.y} Q ${lane} ${from.y} ${lane} ${from.y + direction * radius} L ${lane} ${to.y - direction * radius} Q ${lane} ${to.y} ${lane - radius} ${to.y} L ${to.x} ${to.y}`,
        points: [from, to, {x: lane, y: from.y}, {x: lane, y: to.y}]};
    }
    const distance = Math.max(Math.abs(dx) / (NODE_WIDTH / 2 + 3), Math.abs(dy) / (NODE_HEIGHT / 2 + 3), 1);
    const from = {x: a.x + dx / distance, y: a.y + dy / distance};
    const to = {x: b.x - dx / distance, y: b.y - dy / distance};
    const tree = parents.get(edge.to) === edge.from || parents.get(edge.from) === edge.to;
    if (tree && edge.kind === "friend" && Math.abs(dx) > NODE_WIDTH) {
      const middle = (from.x + to.x) / 2;
      return {path: `M ${from.x} ${from.y} C ${middle} ${from.y} ${middle} ${to.y} ${to.x} ${to.y}`,
        points: [from, to, {x: middle, y: from.y}, {x: middle, y: to.y}]};
    }
    const length = Math.hypot(dx, dy) || 1, bend = edge.kind === "follow" ? 32 : 20;
    const control = {x: (from.x + to.x) / 2 - dy / length * bend, y: (from.y + to.y) / 2 + dx / length * bend};
    return {path: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`, points: [from, to, control]};
  }

  function fitTransform(positions, width, height, routePoints = []) {
    if (!positions.size) return {x: width / 2, y: height / 2, scale: 1};
    const xs = [...positions.values()].map(point => point.x), ys = [...positions.values()].map(point => point.y);
    const edgeXs = routePoints.map(point => point.x), edgeYs = routePoints.map(point => point.y);
    const left = Math.min(...xs.map(x => x - NODE_WIDTH / 2), ...edgeXs) - 34;
    const right = Math.max(...xs.map(x => x + NODE_WIDTH / 2), ...edgeXs) + 34;
    const top = Math.min(...ys.map(y => y - NODE_HEIGHT / 2), ...edgeYs) - 34;
    const bottom = Math.max(...ys.map(y => y + NODE_HEIGHT / 2), ...edgeYs) + 34;
    const scale = clamp(Math.min(width / (right - left), height / (bottom - top)), .03, 1.12);
    return {x: width / 2 - (left + right) / 2 * scale, y: height / 2 - (top + bottom) / 2 * scale, scale};
  }

  function zoomTransform(view, factor, point) {
    const scale = clamp(view.scale * factor, .03, 2.4), ratio = scale / view.scale;
    return {scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio};
  }

  function mount(container, initialOptions) {
    if (!container?.ownerDocument) throw new TypeError("A graph container element is required.");
    const doc = container.ownerDocument, win = doc.defaultView;
    const uniqueId = `fng-${++instanceCount}`;
    let options = {...initialOptions}, model, positions = new Map(), manual = new Map();
    let expanded = new Set(), selectedId = null, focusId = options.focusId;
    let laneLimits = options.quadrant ? {...DEFAULT_LANE_LIMITS, ...options.laneLimits} : options.laneLimits || null;
    let view = {x: 0, y: 0, scale: 1}, dimensions = {width: 900, height: 500};
    let destroyed = false, gesture = null, suppressClickUntil = 0;
    const pointers = new Map(), listeners = [], nodeElements = new Map(), edgeElements = [];

    function el(tag, className, text) {
      const item = doc.createElement(tag);
      if (className) item.className = className;
      if (text !== undefined) item.textContent = text;
      return item;
    }
    function svgEl(tag, attrs = {}, text) {
      const item = doc.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, String(value));
      if (text !== undefined) item.textContent = text;
      return item;
    }
    function listen(target, type, handler, opts) {
      target.addEventListener(type, handler, opts);
      listeners.push(() => target.removeEventListener(type, handler, opts));
    }
    function button(text, action, className = "") {
      const item = el("button", `fng-button ${className}`.trim(), text);
      item.type = "button"; item.addEventListener("click", event => { if (!destroyed) action(event); }); return item;
    }
    function safeLink(label, url) {
      if (!url) return el("span", "", label);
      const a = el("a", "", label); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a;
    }
    function time(value) {
      const date = value ? new Date(value) : null;
      if (!date || !Number.isFinite(date.getTime())) return el("span", "", "Time not recorded");
      const item = el("time", "", date.toLocaleString(undefined, {year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"}));
      item.dateTime = date.toISOString(); item.title = date.toISOString(); return item;
    }

    const wrapper = el("div", "fng"), toolbar = el("div", "fng-toolbar"), heading = el("div", "fng-heading");
    const kicker = el("p", "fng-kicker", "MAIN ACCOUNT"), mainName = el("strong", "fng-main-name");
    heading.append(kicker, mainName);
    toolbar.append(heading);
    const summary = el("p", "fng-summary"); summary.setAttribute("aria-live", "polite");
    const laneBar = el("div", "fng-lane-bar"), laneControls = new Map();
    for (const [lane, title] of Object.entries(LANE_NAMES)) {
      const area = el("div", "fng-lane fng-lane-" + lane), heading = el("strong", "", title);
      const counts = el("span", "fng-lane-count", "0 shown");
      const less = button("−", () => { laneLimits[lane] = DEFAULT_LANE_LIMITS[lane]; rebuild(false); });
      less.setAttribute("aria-label", "Show fewer " + title);
      const more = button("+", () => { laneLimits[lane] = Math.min(model.laneCounts[lane], laneLimits[lane] + 5); rebuild(false); });
      more.setAttribute("aria-label", "Show more " + title);
      area.append(heading, counts, less, more); laneBar.append(area);
      laneControls.set(lane, {area, counts, more, less});
    }
    const boundsNote = el("p", "fng-bounds"), workspace = el("div", "fng-workspace"), canvas = el("div", "fng-canvas");
    const controls = el("div", "fng-controls"), zoomLabel = el("output", "fng-zoom", "100%");
    zoomLabel.setAttribute("aria-label", "Graph zoom");
    const zoomOut = button("−", () => zoom(.8)); zoomOut.setAttribute("aria-label", "Zoom graph out");
    const zoomIn = button("+", () => zoom(1.25)); zoomIn.setAttribute("aria-label", "Zoom graph in");
    const fitButton = button("Fit", () => fit()); fitButton.setAttribute("aria-label", "Fit all visible accounts");
    const collapseButton = button("Reset branches", () => {
      expanded.clear(); manual.clear(); rebuild(true); announce("Collapsed expanded branches. Direct neighbors remain visible.");
    });
    controls.append(zoomOut, zoomLabel, zoomIn, fitButton, collapseButton);
    const svg = svgEl("svg", {class: "fng-svg", role: "group", tabindex: "0", "aria-label": "Observed account connection graph", "aria-describedby": `${uniqueId}-help`});
    const defs = svgEl("defs"), marker = svgEl("marker", {id: `${uniqueId}-arrow`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto", markerUnits: "strokeWidth"});
    marker.append(svgEl("path", {d: "M 0 0 L 10 5 L 0 10 z", fill: "#ffd166"})); defs.append(marker);
    const world = svgEl("g"), edgeLayer = svgEl("g", {class: "fng-edges"}), nodeLayer = svgEl("g", {class: "fng-nodes"});
    world.append(edgeLayer, nodeLayer); svg.append(defs, world);
    canvas.append(controls, svg);
    const inspector = el("aside", "fng-inspector"); inspector.setAttribute("aria-label", "Selected account details");
    workspace.append(canvas, inspector);
    const pickerRow = el("label", "fng-picker"), picker = el("select"); picker.setAttribute("aria-label", "Inspect a visible account");
    pickerRow.append(el("span", "", "Inspect visible account"), picker);
    const legend = el("div", "fng-legend");
    legend.append(el("span", "fng-legend-friend", "Cyan solid: recorded friends"), el("span", "fng-legend-follow", "Gold arrows: following direction"), el("span", "", "Green: ledger account"), el("span", "", "Purple: external account connected to ≥2 ledger accounts (not proof of bots)"), el("span", "", "Gold node: RBI preset match"), el("span", "", "Faded: older link not seen in later complete list"));
    const help = el("p", "fng-help", "Select a node to inspect it, then expand its saved connections. Drag nodes or empty space to arrange the view. Pinch or Ctrl + scroll to zoom; keyboard + / − and arrow keys work on the canvas.");
    help.id = `${uniqueId}-help`;
    const caution = el("p", "fng-help", "Every edge requires a saved friend/follow observation. External connectors link two or more ledger accounts through observed relationships; they are not proof of common ownership, automation or misconduct. Incomplete observations remain unknown.");
    const live = el("p", "fng-sr-only"); live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite");
    wrapper.append(toolbar, summary, laneBar, boundsNote, workspace, pickerRow, legend, help, caution, live);
    container.replaceChildren(wrapper);

    function announce(message) { live.textContent = message; }
    function measure() {
      const rect = svg.getBoundingClientRect();
      dimensions = {width: rect.width || 900, height: rect.height || 500};
      svg.setAttribute("viewBox", `0 0 ${dimensions.width} ${dimensions.height}`);
    }
    function transform() {
      world.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.scale})`);
      zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
    }
    function fit() {
      measure();
      const routePoints = model.edges.flatMap(edge => edgeGeometry(edge, positions, model.parents).points);
      view = fitTransform(positions, dimensions.width, dimensions.height, routePoints); transform();
    }
    function rootView() {
      measure();
      view = {scale: dimensions.width < 600 ? .64 : .72, x: dimensions.width / 2, y: dimensions.height / 2};
      transform();
    }
    function zoom(factor) { view = zoomTransform(view, factor, {x: dimensions.width / 2, y: dimensions.height / 2}); transform(); }
    function positionNodes() {
      for (const [id, group] of nodeElements) {
        const position = positions.get(id); group.setAttribute("transform", `translate(${position.x} ${position.y})`);
      }
      for (const item of edgeElements) item.path.setAttribute("d", edgeGeometry(item.edge, positions, model.parents).path);
    }
    function relationLabel(edge) {
      const from = name(model.nodesById.get(edge.from)), to = name(model.nodesById.get(edge.to));
      return edge.kind === "friend" ? `${from} ↔ ${to} · friends` : `${from} → ${to} · follows`;
    }
    function draw() {
      nodeElements.clear(); edgeElements.length = 0; edgeLayer.replaceChildren(); nodeLayer.replaceChildren();
      for (const edge of model.edges) {
        const path = svgEl("path", {class: `fng-edge fng-edge-${edge.kind} fng-edge-${edge.status}${edge.crossLink ? " fng-edge-cross" : ""}`, "vector-effect": "non-scaling-stroke"});
        if (edge.kind === "follow") path.setAttribute("marker-end", `url(#${uniqueId}-arrow)`);
        path.append(svgEl("title", {}, `${relationLabel(edge)}. ${edge.evidence.map(item => item.observed_at || item.fetched_at || "Observation time unknown").join("; ")}`));
        edgeElements.push({edge, path}); edgeLayer.append(path);
      }
      for (const node of model.nodes) {
        const item = model.eligibility.get(node.id), isMain = node.id === model.focusId;
        const group = svgEl("g", {class: `fng-node fng-node-${item.category}${isMain ? " fng-node-main" : ""}`,
          "data-node-id": node.id, role: "button", tabindex: "0", "aria-pressed": String(node.id === selectedId),
          "aria-label": `${isMain ? "Main account. " : ""}${name(node)}, Roblox ID ${node.id}. ${item.label}. Select to inspect.`});
        group.append(svgEl("rect", {x: -NODE_WIDTH / 2, y: -NODE_HEIGHT / 2, width: NODE_WIDTH, height: NODE_HEIGHT, rx: 12, class: "fng-node-card"}));
        group.append(svgEl("circle", {cx: -83, cy: 0, r: 18, class: "fng-node-icon"}));
        group.append(svgEl("text", {x: -83, y: 5, class: "fng-initials"}, String(node.username || node.display_name || node.id).slice(0, 2).toUpperCase()));
        const label = name(node), labelLimit = 17;
        const nameText = svgEl("text", {x: -54, y: -5, class: "fng-node-name"}, label.length > labelLimit ? `${label.slice(0, labelLimit - 1)}…` : label);
        group.append(nameText);
        const badge = isMain ? "MAIN ACCOUNT" : item.category === "ledger" ? rank(node) ? `LEADERBOARD #${rank(node)}` : "LEADERBOARD HISTORY" : item.category === "connector" ? "SHARED CONNECTOR" : item.category === "external" ? "EXTERNAL OBSERVED" : item.category === "full" ? "FULL PRESET MATCH" : "PARTIAL PRESET MATCH";
        group.append(svgEl("text", {x: -54, y: 15, class: "fng-node-badge"}, badge));
        if (!isMain && expanded.has(node.id)) group.append(svgEl("circle", {cx: 102, cy: -27, r: 5, class: "fng-expanded-dot"}));
        group.append(svgEl("title", {}, `${name(node)} · Roblox ID ${node.id} · ${item.label}${isMain ? " · Main account stays fixed" : ""}`));
        group.addEventListener("click", () => { if (Date.now() >= suppressClickUntil) select(node.id); });
        group.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); select(node.id); }
        });
        nodeElements.set(node.id, group); nodeLayer.append(group);
        if (typeof nameText.getComputedTextLength === "function") {
          // Use the rendered font width so 14px names remain inside the 224px card.
          let visible = label.slice(0, 64); nameText.textContent = visible;
          while (visible.length > 1 && nameText.getComputedTextLength() > 154) {
            visible = visible.slice(0, -1); nameText.textContent = `${visible}…`;
          }
        }
      }
      positionNodes(); highlight();
    }
    function highlight() {
      for (const [id, group] of nodeElements) {
        group.setAttribute("aria-pressed", String(id === selectedId)); group.classList.toggle("fng-selected", id === selectedId);
      }
      for (const item of edgeElements) item.path.classList.toggle("fng-edge-selected", item.edge.from === selectedId || item.edge.to === selectedId);
    }
    function select(id) {
      if (destroyed) return;
      if (!model.nodes.some(node => node.id === id)) return;
      selectedId = id; picker.value = id; highlight(); renderInspector();
      if (typeof options.onSelect === "function") options.onSelect(id, model.nodesById.get(id));
      announce(`Selected ${name(model.nodesById.get(id))}. Main account remains ${name(model.root)}.`);
    }
    function hiddenText(stats) {
      const parts = [];
      if (stats.unchecked) parts.push(`${stats.unchecked} unchecked or incomplete avatar scan${stats.unchecked === 1 ? "" : "s"}`);
      if (stats.partial) parts.push(`${stats.partial} partial-only preset match${stats.partial === 1 ? "" : "es"}`);
      if (stats.noMatch) parts.push(`${stats.noMatch} checked avatar${stats.noMatch === 1 ? "" : "s"} without a preset match`);
      return parts.join(" · ");
    }
    function renderSummary() {
      mainName.textContent = model.root ? name(model.root) : "Choose an account";
      if (!model.root) { summary.textContent = "Choose a saved account to explore its observed connections."; boundsNote.hidden = true; return; }
      const stats = model.directStats, shown = Math.max(0, model.nodes.length - 1);
      summary.textContent = options.quadrant ?
        `${shown} visible connected accounts · ${stats.eligible} qualifying direct neighbors out of ${stats.total} observed. Use the + controls to reveal more in each direction; drag to pan.` :
        `${shown} visible branch account${shown === 1 ? "" : "s"} · ${stats.eligible} eligible direct neighbor${stats.eligible === 1 ? "" : "s"} of ${stats.total} observed. ${hiddenText(model.hidden) ? `Hidden across open branches: ${hiddenText(model.hidden)}.` : ""}`;
      boundsNote.hidden = !model.omittedEligibleIds.length;
      boundsNote.textContent = options.quadrant ?
        `${model.omittedEligibleIds.length} qualifying accounts are not drawn yet. Expand the relevant direction with +; selection limits only hide cards, never erase evidence.` :
        `${model.omittedEligibleIds.length} more eligible account${model.omittedEligibleIds.length === 1 ? "" : "s"} cannot fit within this view's ${model.maxNodes}-account limit. Collapse another branch or use a connected account as main to inspect them.`;
      collapseButton.disabled = expanded.size === 0 && manual.size === 0;
      svg.setAttribute("aria-label", `Observed connections branching from ${name(model.root)}. ${shown} visible branch accounts.`);
    }
    function appendEvidence(parent, evidence, latest = null) {
      const list = el("ul", "fng-evidence");
      const unique = new Map();
      for (const item of evidence) {
        const key = [item.source_url, item.observed_at || item.fetched_at, item.ownerId, item.method].join("|");
        if (!unique.has(key)) unique.set(key, item);
      }
      for (const item of unique.values()) {
        const row = el("li"), label = item.source_label || (item.method === "roblox_website" ? "Roblox website observation" : "Recorded source");
        row.append(safeLink(label, options.core.sourceUrl(item.source_url)), el("span", "", " · "), time(item.observed_at || item.fetched_at));
        const observed = observationTime(item);
        if (latest !== null && Number.isFinite(observed)) row.append(el("span", "", observed === latest ? " · latest saved positive" : " · earlier observation"));
        list.append(row);
      }
      parent.append(list);
    }
    function renderInspector() {
      inspector.replaceChildren();
      const node = model.nodesById.get(selectedId);
      if (!node) { inspector.append(el("p", "fng-help", "Select an account to inspect its saved evidence.")); return; }
      const item = model.eligibility.get(node.id), isMain = node.id === model.focusId, stats = neighborStats(node.id, model);
      inspector.append(el("p", "fng-kicker", isMain ? "MAIN ACCOUNT SELECTED" : "SELECTED ACCOUNT"), el("h3", "", name(node)));
      if (node.display_name && node.display_name !== node.username) inspector.append(el("p", "fng-display-name", `Display name: ${node.display_name}`));
      const facts = el("dl", "fng-facts");
      const fact = (label, value) => { facts.append(el("dt", "", label), el("dd", "", value)); };
      fact("Roblox ID", node.id);
      fact("Leaderboard", node.ledger ? rank(node) ? `Latest rank #${rank(node)}` : "Seen in ledger history" : "Not in saved leaderboard");
      if (item.category === "connector") fact("Network", `${item.ledgerConnections} observed ledger neighbors`);
      fact("Avatar", item.review.status === "full" ? "Full preset match" + (item.incomplete ? " · from incomplete scan" : "") :
        item.incomplete ? "Incomplete scan · full match not established" :
        item.review.available ? item.review.status === "partial" ? "Partial preset match" : "Checked · no preset match" : item.unavailable ? "Unavailable at last check" : "Unchecked");
      inspector.append(facts);
      if (item.matches.length) {
        const matchList = el("ul", "fng-presets");
        for (const preset of item.matches) {
          const row = el("li"), details = el("details");
          details.append(el("summary", "", `${preset.name} · ${preset.matchedCount}/${preset.requiredCount} required assets${preset.status === "partial" ? " (partial)" : ""}`));
          details.append(el("p", "fng-help", `Observed required IDs: ${preset.matchedIds.join(", ")}`));
          if (preset.missingIds.length) details.append(el("p", "fng-help",
            `${item.incomplete ? "Unverified" : "Missing"} required IDs: ${preset.missingIds.join(", ")}`));
          row.append(details); matchList.append(row);
        }
        inspector.append(matchList);
      }
      if (item.review.available || item.unavailable) {
        const checked = el("p", "fng-source-time", item.unavailable ? "Avatar checked: " : "Avatar observed: ");
        checked.append(time(node.avatar?.fetched_at || node.avatar?.observed_at || node.avatar?.checked_at));
        const url = options.core.sourceUrl(node.avatar?.source_url); if (url) checked.append(el("span", "", " · "), safeLink("source", url)); inspector.append(checked);
      }
      if (!isMain && typeof options.usernamePatterns?.compare === "function") {
        const pattern = options.usernamePatterns.compare(model.root?.username, node.username);
        if (pattern.available && ["strong", "possible"].includes(pattern.tier)) {
          const clue = el("section", "fng-name-clue");
          clue.append(el("p", "fng-kicker", "USERNAME PATTERN WITH MAIN"), el("strong", "", pattern.label));
          const reasons = el("ul");
          for (const reason of pattern.reasons || []) if (typeof reason === "string") reasons.append(el("li", "", reason));
          clue.append(reasons, el("p", "fng-help", "A username pattern is a review clue. It does not create this connection or establish shared ownership."));
          inspector.append(clue);
        }
      }
      const actions = el("div", "fng-actions");
      if (!isMain) {
        const isOpen = expanded.has(node.id);
        const visible = new Set(model.nodes.map(person => person.id));
        const unseenCount = [...(model.adjacency.get(node.id) || [])].filter(id => !visible.has(id) && model.eligibility.get(id).eligible).length;
        const expand = button(isOpen ? "Collapse this branch" : `Expand saved neighbors (${unseenCount})`, () => {
          if (expanded.has(node.id)) expanded.delete(node.id); else expanded.add(node.id);
          rebuild(!options.quadrant); announce(`${expanded.has(node.id) ? "Expanded" : "Collapsed"} ${name(node)}. Main account remains ${name(model.root)}.`);
        }, "fng-action-primary");
        expand.disabled = !isOpen && !unseenCount;
        actions.append(expand);
        const useMain = button("Use as main account", () => {
          if (typeof options.onReference === "function" && options.onReference(node.id, node) === false) return;
          if (destroyed) return;
          if (focusId !== node.id) { focusId = node.id; selectedId = node.id; expanded.clear(); manual.clear(); rebuild(true); }
          announce(`Main account changed to ${name(node)}.`);
        });
        actions.append(useMain);
        if (typeof options.onCompare === "function" && options.accounts?.some(account => options.core.normalizeId(account?.id) === node.id)) {
          actions.append(button("Compare with main", () => options.onCompare(node.id, node)));
        }
      } else inspector.append(el("p", "fng-help", "Direct eligible neighbors are open. Select a branch account to expand further. The main account stays fixed while you inspect."));
      actions.append(safeLink("Open Roblox profile ↗", options.core.profileUrl(node.id))); inspector.append(actions);
      const neighborNote = el("p", "fng-help", `${stats.eligible} eligible of ${stats.total} observed neighbors. ${hiddenText(stats) ? `Hidden: ${hiddenText(stats)}.` : ""}`);
      inspector.append(neighborNote);
      const coverage = el("details", "fng-details"); coverage.open = true;
      coverage.append(el("summary", "", "Saved list coverage"));
      const coverageList = el("ul", "fng-coverage");
      for (const kind of ["friends", "followers", "following"]) {
        const saved = options.core.socialList(node, kind), row = el("li");
        const label = kind[0].toUpperCase() + kind.slice(1);
        row.append(el("strong", "", `${label}: `));
        row.append(el("span", "", saved.readable ? `${saved.items.size} saved · ${saved.complete ? "complete" : "partial"}` : "No readable list saved"));
        if (saved.readable) {
          const small = el("small"); small.append(time(saved.record.fetched_at || saved.record.checked_at));
          const url = options.core.sourceUrl(saved.record.source_url); if (url) small.append(el("span", "", " · "), safeLink("source", url)); row.append(small);
        }
        coverageList.append(row);
      }
      coverage.append(coverageList, el("p", "fng-help", "Missing and partial lists leave connections unknown. A connection may be observed in the other account's list.")); inspector.append(coverage);
      const incident = model.edges.filter(edge => edge.from === node.id || edge.to === node.id);
      const evidence = el("details", "fng-details"); evidence.open = true;
      evidence.append(el("summary", "", `Observed links in this view (${incident.length})`));
      if (!incident.length) evidence.append(el("p", "fng-help", stats.total ? "No observed neighbor meets the current branch filter. Unchecked avatars remain unqualified." : "No friend or follow links are saved for this account. Unavailable lists do not establish that there are no connections."));
      for (const edge of incident) {
        const entry = el("details", "fng-link-evidence");
        const status = edge.status === "historical" ? "Historical; not seen in later complete list" :
          edge.status === "undated" ? "Saved observation; date unknown" : "Latest saved positive; not checked live";
        entry.append(el("summary", "", `${relationLabel(edge)}${edge.crossLink ? " · cross-link" : ""}`));
        const dates = el("p", "fng-source-time", status);
        if (edge.latest !== null) dates.append(el("span", "", " · "), time(edge.latest));
        entry.append(dates);
        appendEvidence(entry, edge.evidence, edge.latest);
        if (edge.laterChecks.length) {
          entry.append(el("p", "fng-help", "Later complete list(s) without this account:"));
          appendEvidence(entry, edge.laterChecks);
        }
        evidence.append(entry);
      }
      inspector.append(evidence);
    }
    function rebuild(shouldFit = false) {
      if (destroyed) return;
      model = buildBranches({...options, focusId, expandedIds: expanded, laneLimits});
      laneBar.hidden = !options.quadrant;
      if (options.quadrant) for (const [lane, control] of laneControls) {
        control.counts.textContent = `${model.laneShown[lane]} / ${model.laneCounts[lane]}`;
        control.more.disabled = laneLimits[lane] >= model.laneCounts[lane];
        control.less.disabled = laneLimits[lane] <= DEFAULT_LANE_LIMITS[lane];
      }
      if (!model.nodes.some(node => node.id === selectedId)) selectedId = model.focusId;
      positions = layout(model, manual);
      picker.replaceChildren();
      for (const node of model.nodes) {
        const option = el("option", "", `${node.id === model.focusId ? "MAIN · " : ""}${name(node)} · ${model.eligibility.get(node.id).label}`);
        option.value = node.id; picker.append(option);
      }
      picker.value = selectedId || ""; draw(); renderSummary(); renderInspector();
      if (typeof options.onSelect === "function" && model.nodesById.has(selectedId)) options.onSelect(selectedId, model.nodesById.get(selectedId));
      if (shouldFit) { if (options.quadrant) rootView(); else fit(); }
    }
    function point(event) {
      const rect = svg.getBoundingClientRect();
      return {x: (event.clientX - rect.left) * dimensions.width / (rect.width || dimensions.width), y: (event.clientY - rect.top) * dimensions.height / (rect.height || dimensions.height)};
    }
    function nodeIdAt(target) {
      while (target && target !== svg) { const id = target.getAttribute?.("data-node-id"); if (id) return id; target = target.parentNode; }
      return null;
    }
    function beginPinch() {
      const [a, b] = [...pointers.values()];
      const center = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      gesture = {type: "pinch", moved: true, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), scale: view.scale,
        world: {x: (center.x - view.x) / view.scale, y: (center.y - view.y) / view.scale}};
    }
    listen(svg, "pointerdown", event => {
      if (event.button !== undefined && event.button !== 0) return;
      const position = point(event); pointers.set(event.pointerId, position);
      try { svg.setPointerCapture(event.pointerId); } catch { /* Synthetic events need no capture. */ }
      if (pointers.size >= 2) beginPinch();
      else {
        const id = nodeIdAt(event.target), nodePosition = positions.get(id);
        gesture = {type: id ? id === model.focusId ? "select" : "node" : "pan", id, start: position, moved: false,
          view: {...view}, node: nodePosition ? {...nodePosition} : null};
      }
      event.preventDefault();
    });
    listen(svg, "pointermove", event => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      const position = point(event); pointers.set(event.pointerId, position);
      if (pointers.size >= 2) {
        if (gesture.type !== "pinch") beginPinch();
        const [a, b] = [...pointers.values()], center = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
        const scale = clamp(gesture.scale * Math.hypot(b.x - a.x, b.y - a.y) / gesture.distance, .03, 2.4);
        view = {scale, x: center.x - gesture.world.x * scale, y: center.y - gesture.world.y * scale}; transform();
      } else {
        const dx = position.x - gesture.start.x, dy = position.y - gesture.start.y;
        if (Math.hypot(dx, dy) > 4) gesture.moved = true;
        if (gesture.type === "pan") { view = {...gesture.view, x: gesture.view.x + dx, y: gesture.view.y + dy}; transform(); }
        else if (gesture.type === "node" && gesture.moved) {
          const updated = {x: gesture.node.x + dx / view.scale, y: gesture.node.y + dy / view.scale};
          positions.set(gesture.id, updated); manual.set(gesture.id, updated); positionNodes(); collapseButton.disabled = false;
        }
      }
      event.preventDefault();
    });
    function finishPointer(event, cancelled) {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      try { svg.releasePointerCapture(event.pointerId); } catch { /* Capture may already be released. */ }
      if (!cancelled && !gesture?.moved && gesture?.id) select(gesture.id);
      suppressClickUntil = Date.now() + 300;
      if (pointers.size >= 2) beginPinch();
      else if (pointers.size) {
        const position = [...pointers.values()][0]; gesture = {type: "pan", start: position, view: {...view}, moved: true};
      } else gesture = null;
    }
    listen(svg, "pointerup", event => finishPointer(event, false));
    listen(svg, "pointercancel", event => finishPointer(event, true));
    listen(svg, "lostpointercapture", event => finishPointer(event, true));
    listen(svg, "wheel", event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); view = zoomTransform(view, Math.exp(-event.deltaY * .008), point(event)); transform();
    }, {passive: false});
    listen(svg, "keydown", event => {
      if (event.target !== svg) return;
      if (event.key === "+" || event.key === "=") zoom(1.25);
      else if (event.key === "-") zoom(.8);
      else if (event.key === "0") fit();
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        view.x += event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0;
        view.y += event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0; transform();
      } else return;
      event.preventDefault();
    });
    listen(picker, "change", () => select(picker.value));
    let resizeObserver;
    if (win?.ResizeObserver) {
      resizeObserver = new win.ResizeObserver(() => {
        const before = dimensions; measure();
        view.x += (dimensions.width - before.width) / 2; view.y += (dimensions.height - before.height) / 2; transform();
      }); resizeObserver.observe(svg);
    }
    measure(); rebuild(true);
    return Object.freeze({
      update(nextOptions = {}) {
        if (destroyed) return;
        const nextFocus = nextOptions.focusId === undefined ? focusId : nextOptions.focusId;
        const changed = options.core.normalizeId(nextFocus) !== options.core.normalizeId(focusId);
        options = {...options, ...nextOptions}; focusId = nextFocus;
        if (changed) { expanded.clear(); manual.clear(); selectedId = focusId; pointers.clear(); gesture = null;
          laneLimits = options.quadrant ? {...DEFAULT_LANE_LIMITS, ...options.laneLimits} : options.laneLimits || null; }
        rebuild(changed);
      },
      destroy() {
        if (destroyed) return;
        destroyed = true; resizeObserver?.disconnect(); listeners.splice(0).forEach(remove => remove());
        pointers.clear(); gesture = null; wrapper.remove();
      }
    });
  }

  return Object.freeze({eligibility, neighborStats, buildBranches, edgeObservation, layout, edgeGeometry, fitTransform, zoomTransform, mount});
});

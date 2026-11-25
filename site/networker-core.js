(function (root, factory) {
  "use strict";
  const api = factory(typeof module === "object" && module.exports ? require("./username-patterns.js") : root.FischUsernamePatterns);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FischNetworker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (usernamePatterns) {
  "use strict";

  const BODY_TYPES = new Set([17, 18, 27, 28, 29, 30, 31, 79]);
  const ANIMATION_TYPES = new Set([24, 48, 49, 50, 51, 52, 53, 54, 55, 56, 61, 78]);
  const COSMETIC_TYPES = new Set([2, 8, 11, 12, 41, 42, 43, 44, 45, 46, 47, 64, 65, 66, 67, 68, 69, 70, 71, 72, 76, 77]);
  const GROUPS = ["cosmetic", "body", "animation", "other"];
  // RBI's full rule is containment, not whole-avatar equality. Extra equipped items are allowed.
  const RBI_AVATAR_RULES = Object.freeze({
    sourceUrl: "https://github.com/nitwi/Roblox-Bot-Investigator/blob/3b3f4e40a9ce3a258f3dac6584add47959a9a980/RBI_Bot.py",
    commit: "3b3f4e40a9ce3a258f3dac6584add47959a9a980",
    version: "v0.18.1.1-beta",
    presets: Object.freeze([
      Object.freeze({id: "bacon", name: "Bacon", category: "defaultcombos", assetIds: Object.freeze(["144076760", "144076358", "63690008"])}),
      Object.freeze({id: "beanie", name: "Beanie", category: "defaultcombos", assetIds: Object.freeze(["382537569", "4047884939", "1772336109"])}),
      Object.freeze({id: "acorn", name: "Acorn", category: "defaultcombos", assetIds: Object.freeze(["62724852", "144076512", "144076436"])}),
      Object.freeze({id: "john", name: "John", category: "xboxcombos", assetIds: Object.freeze(["301809996", "301811279", "301819845", "301820684"])}),
      Object.freeze({id: "oakley", name: "Oakley", category: "xboxcombos", assetIds: Object.freeze(["301810204", "301811432", "301819935", "301820724"])}),
      Object.freeze({id: "greenbean", name: "GreenBean", category: "freeoutfitcombos", assetIds: Object.freeze(["617605556"])}),
      Object.freeze({id: "claire", name: "Claire", category: "xboxcombos", assetIds: Object.freeze(["301820599", "301819020"])}),
      Object.freeze({id: "casey", name: "Casey", category: "xboxcombos", assetIds: Object.freeze(["301819154", "301820642", "301809497", "301811027"])}),
      Object.freeze({id: "lin", name: "Lin", category: "xboxcombos", assetIds: Object.freeze(["301820310", "301818464", "301806786", "301810423"])}),
      Object.freeze({id: "serena", name: "Serena", category: "xboxcombos", assetIds: Object.freeze(["301818806", "301820523", "301807898", "301810602"])}),
      Object.freeze({id: "junkbot", name: "Junkbot", category: "freeoutfitcombos", assetIds: Object.freeze(["12724232885", "4381832739", "4381828509", "4381823417", "4381821661", "4381819685", "4381817635", "4381815211"])}),
      Object.freeze({id: "knightsofredcliff", name: "Knights of Redcliff", category: "freeoutfitcombos", assetIds: Object.freeze(["2493559059", "2493559856", "2493586650", "2493590711", "2493776828", "2493786076", "137831860413813"])}),
      Object.freeze({id: "dennis", name: "Dennis", category: "freeoutfitcombos", assetIds: Object.freeze(["11822635053", "4637596615", "4637601297", "4637254498"])}),
      Object.freeze({id: "lindsey", name: "Lindsey", category: "freeoutfitcombos", assetIds: Object.freeze(["12945228337", "4637605284", "4637267557", "4637603462"])}),
      Object.freeze({id: "denny", name: "Denny", category: "freeoutfitcombos", assetIds: Object.freeze(["128985581083096", "6445270994", "6445268819", "6445265102", "6445263379", "6445262286", "6445260402"])}),
      Object.freeze({id: "linlin", name: "Linlin", category: "freeoutfitcombos", assetIds: Object.freeze(["85216210917123", "6494077172", "6494056892", "6494055897", "6494055013", "6494053789", "6494051962"])}),
      Object.freeze({id: "kenneth", name: "Kenneth", category: "freeoutfitcombos", assetIds: Object.freeze(["15093144795", "4637618900", "4637617396", "4637431811"])}),
      Object.freeze({id: "oliver", name: "Oliver", category: "freeoutfitcombos", assetIds: Object.freeze(["3963861732", "3963864909", "3963867514", "3963869770", "3963871432", "3963874672", "3670737444", "12778883791"])}),
      Object.freeze({id: "cindy", name: "Cindy", category: "freeoutfitcombos", assetIds: Object.freeze(["13253943097", "4637612548", "4637611578", "4637156063"])}),
      Object.freeze({id: "citylifewoman", name: "City Life Woman", category: "freeoutfitcombos", assetIds: Object.freeze(["15093243863", "2492675286", "2492674027", "2492670347", "2492669375", "2492671662", "2492667589"])}),
      Object.freeze({id: "squadghoulstedd", name: "Squad Ghouls: Drop Dead Tedd", category: "freeoutfitcombos", assetIds: Object.freeze(["2499654059", "112187483939951", "2499646611", "2499646090", "2499645445", "2499644791", "2499643947"])}),
      Object.freeze({id: "summer", name: "Summer", category: "freeoutfitcombos", assetIds: Object.freeze(["3963490791", "3670737444"])})
    ])
  });

  function normalizeId(value) {
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0)) return null;
    if (typeof value !== "number" && typeof value !== "string") return null;
    const id = String(value).trim();
    if (!/^\d{1,20}$/.test(id) || !/[1-9]/.test(id)) return null;
    return id.replace(/^0+/, "");
  }

  function profileUrl(id) {
    const safe = normalizeId(id);
    return safe ? `https://www.roblox.com/users/${safe}/profile` : null;
  }

  function assetUrl(id) {
    const safe = normalizeId(id);
    return safe ? `https://www.roblox.com/catalog/${safe}` : null;
  }

  function thumbnailUrl(value) {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
      return /(^|\.)(rbxcdn\.com|roblox\.com)$/.test(url.hostname) ? url.href : null;
    } catch { return null; }
  }

  function sourceUrl(value) {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
      return /(^|\.)roblox\.com$/.test(url.hostname) ? url.href : null;
    } catch { return null; }
  }

  function assetGroup(asset) {
    const type = Number(asset?.type_id), name = String(asset?.type_name || "").toLowerCase();
    if (ANIMATION_TYPES.has(type) || name.includes("animation")) return "animation";
    if (COSMETIC_TYPES.has(type) || /accessory|t.?shirt|pants|jacket|sweater|shorts|dress|skirt|shoe/.test(name)) return "cosmetic";
    if (BODY_TYPES.has(type) || /^(?:dynamic ?head|head|face|torso|left ?arm|right ?arm|left ?leg|right ?leg|body)$/.test(name)) return "body";
    return "other";
  }

  function assetMap(avatar) {
    if (avatar?.status !== "ok" || !Array.isArray(avatar.assets)) return null;
    const map = new Map();
    for (const asset of avatar.assets) {
      const id = normalizeId(asset?.id);
      if (id && !map.has(id)) map.set(id, {...asset, id, group: assetGroup(asset)});
    }
    return map;
  }

  function overlap(left, right) {
    const sharedIds = [...left].filter(id => right.has(id));
    const unionCount = new Set([...left, ...right]).size;
    return {leftCount: left.size, rightCount: right.size, sharedCount: sharedIds.length, sharedIds,
      unionCount, jaccard: unionCount ? sharedIds.length / unionCount * 100 : null};
  }

  function stableObject(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableObject).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableObject(value[key])}`).join(",")}}`;
  }

  function knownConfiguration(avatar) {
    return typeof avatar?.rig_type === "string" && avatar.rig_type.length > 0 &&
      avatar.body_colors && typeof avatar.body_colors === "object" && Object.keys(avatar.body_colors).length > 0 &&
      avatar.scales && typeof avatar.scales === "object" && Object.keys(avatar.scales).length > 0;
  }

  function compareAvatars(leftAvatar, rightAvatar) {
    const left = assetMap(leftAvatar), right = assetMap(rightAvatar);
    if (!left || !right) return {available: false, groups: {}, sharedAssets: [], exactAssetSet: false, configurationMatch: null};
    const all = overlap(new Set(left.keys()), new Set(right.keys()));
    const groups = Object.fromEntries(GROUPS.map(group => [group, overlap(
      new Set([...left].filter(([, asset]) => asset.group === group).map(([id]) => id)),
      new Set([...right].filter(([, asset]) => asset.group === group).map(([id]) => id))
    )]));
    const configurationMatch = knownConfiguration(leftAvatar) && knownConfiguration(rightAvatar) ?
      stableObject([leftAvatar.body_colors, leftAvatar.scales, leftAvatar.rig_type]) ===
      stableObject([rightAvatar.body_colors, rightAvatar.scales, rightAvatar.rig_type]) : null;
    return {available: true, all, groups, sharedAssets: all.sharedIds.map(id => left.get(id)),
      exactAssetSet: all.leftCount > 0 && all.sharedCount === all.leftCount && all.sharedCount === all.rightCount,
      configurationMatch};
  }

  function reviewAvatar(avatar, rules = RBI_AVATAR_RULES.presets) {
    const equipped = assetMap(avatar);
    if (!equipped) return {available: false, status: "unknown", presets: [], fullMatches: [], partialMatches: [], matchedAssetCount: null};
    const presets = rules.flatMap(preset => {
      const required = [...new Set((preset.assetIds || []).map(normalizeId).filter(Boolean))];
      if (!required.length) return [];
      const matchedIds = required.filter(id => equipped.has(id));
      const missingIds = required.filter(id => !equipped.has(id));
      return [{id: preset.id, name: preset.name, category: preset.category, requiredCount: required.length,
        matchedCount: matchedIds.length, matchedIds, missingIds,
        matchedAssets: matchedIds.map(id => equipped.get(id)),
        status: !matchedIds.length ? "none" : missingIds.length ? "partial" : "full"}];
    });
    const fullMatches = presets.filter(preset => preset.status === "full");
    const partialMatches = presets.filter(preset => preset.status === "partial");
    return {available: true, status: fullMatches.length ? "full" : partialMatches.length ? "partial" : "none",
      presets, fullMatches, partialMatches,
      matchedAssetCount: new Set(presets.flatMap(preset => preset.matchedIds)).size};
  }

  function classifyPresetResemblance(avatar, rules = RBI_AVATAR_RULES.presets) {
    if (!["ok", "partial"].includes(avatar?.status) || !Array.isArray(avatar.assets)) return {status: "unknown", matches: []};
    const result = reviewAvatar({...avatar, status: "ok"}, rules);
    if (result.fullMatches.length) return {status: "full", matches: result.fullMatches};
    // A short/shared item list is not enough to call a near match. Only use a
    // complete scan for a near match or a known non-match.
    if (avatar.status !== "ok") return {status: "unknown", matches: []};
    const near = result.partialMatches.filter(preset =>
      preset.requiredCount >= 3 && preset.matchedCount >= 2 &&
      preset.matchedCount * 5 >= preset.requiredCount * 4);
    return {status: near.length ? "near" : "none", matches: near};
  }

  function relationshipLens(network, targetId, scans = []) {
    const id = normalizeId(targetId);
    const projected = new Map(scans.filter(node => normalizeId(node?.id) && node.avatar).map(node => [normalizeId(node.id), node.avatar]));
    const friends = new Set(), followers = new Set(), following = new Set();
    for (const edge of network?.edges || []) {
      const from = normalizeId(edge.from), to = normalizeId(edge.to);
      if (!id || !from || !to || from === to || (from !== id && to !== id)) continue;
      if (edge.kind === "friend") friends.add(from === id ? to : from);
      else if (edge.kind === "follow") (from === id ? following : followers).add(from === id ? to : from);
    }
    function person(other) {
      return network?.nodes?.get(other) || {id: other};
    }
    const list = values => [...values].map(person).sort((a, b) =>
      String(a.username || a.display_name || a.id).localeCompare(String(b.username || b.display_name || b.id), "en"));
    const directFriends = list(friends);
    const reviewed = directFriends.map(node => {
      const baseline = node.avatar;
      const latest = projected.get(node.id);
      const date = avatar => avatar?.checked_at || avatar?.fetched_at || "";
      const avatar = latest && (!baseline || date(latest) >= date(baseline)) ? latest : baseline;
      return {node, ...classifyPresetResemblance(avatar), observedAt: date(avatar) || null};
    });
    const classifiedCount = reviewed.filter(result => result.status !== "unknown").length;
    const outfitFriends = reviewed.filter(result => result.status === "full" || result.status === "near");
    return {observedFriendCount: directFriends.length, classifiedCount,
      unknownCount: directFriends.length - classifiedCount,
      fullCount: outfitFriends.filter(entry => entry.status === "full").length,
      nearCount: outfitFriends.filter(entry => entry.status === "near").length,
      matchPercent: classifiedCount ? 100 * outfitFriends.length / classifiedCount : null,
      leaderboardFriends: directFriends.filter(node => node.ledger === true),
      outfitFriends, followers: list(followers), following: list(following)};
  }

  function matchesReviewFilter(review, filter = "all") {
    return !["full", "partial", "none", "unknown"].includes(filter) || review.status === filter;
  }

  function usernameSimilarity(first, second) {
    const normalize = value => typeof value === "string" ? value.trim().replace(/^@/, "").toLowerCase() : "";
    const a = normalize(first), b = normalize(second);
    if (!/^[a-z0-9_]{1,64}$/.test(a) || !/^[a-z0-9_]{1,64}$/.test(b)) {
      return {available: false, distance: null, maxLength: null, similarity: null, exact: false};
    }
    let previous = Array.from({length: b.length + 1}, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      const current = [i];
      for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
    const distance = previous[b.length], maxLength = Math.max(a.length, b.length);
    return {available: true, distance, maxLength, similarity: (1 - distance / maxLength) * 100, exact: distance === 0};
  }

  function socialList(account, kind) {
    const record = account?.[kind], ownerId = normalizeId(account?.id);
    const readable = record && (record.status === "complete" || record.status === "partial") && Array.isArray(record.items);
    const items = new Map();
    if (readable) for (const item of record.items) {
      const id = normalizeId(item?.id);
      if (id && id !== ownerId && !items.has(id)) items.set(id, {...item, id});
    }
    return {record, items, readable: Boolean(readable), complete: Boolean(readable && record.status === "complete")};
  }

  function socialEvidence(account, kind, item = null) {
    const record = account?.[kind] || {}, ownerId = normalizeId(account?.id);
    const details = item && Array.isArray(item.evidence) && item.evidence.length ? item.evidence : [item || record];
    const seen = new Set();
    return details.filter(detail => detail && typeof detail === "object").map(detail => {
      const observed = detail.observed_at || item?.observed_at || record.fetched_at || null;
      const method = detail.method || item?.method || record.method || "roblox_api";
      return {ownerId, kind, targetId: normalizeId(item?.id),
        observation_id: detail.observation_id || null,
        observed_at: observed, fetched_at: observed,
        source_url: detail.source_url || item?.source_url || record.source_url || null,
        method,
        source_label: detail.source_label || item?.source_label || record.source_label ||
          (method === "roblox_website" ? "Roblox website observation" : method === "roblox_api" ? "Roblox API" : "Recorded source")};
    }).filter(evidence => {
      const key = JSON.stringify(evidence);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  function relationEvidence(checks) {
    const observed = checks.filter(check => check.list.readable && check.list.items.has(check.id));
    if (observed.length) return {status: "observed", evidence: observed.flatMap(check => socialEvidence(check.account, check.kind, check.list.items.get(check.id)))};
    const complete = checks.filter(check => check.list.complete);
    return {status: complete.length ? "not_observed" : "unknown", evidence: complete.flatMap(check => socialEvidence(check.account, check.kind))};
  }

  function directRelations(target, candidate) {
    const a = normalizeId(target?.id), b = normalizeId(candidate?.id);
    const unknown = () => ({status: "unknown", evidence: []});
    if (!a || !b || a === b) return {friends: unknown(), targetFollowsCandidate: unknown(), candidateFollowsTarget: unknown(), observedCount: 0};
    const check = (account, kind, id) => ({account, kind, id, list: socialList(account, kind)});
    const friends = relationEvidence([check(target, "friends", b), check(candidate, "friends", a)]);
    const targetFollowsCandidate = relationEvidence([check(target, "following", b), check(candidate, "followers", a)]);
    const candidateFollowsTarget = relationEvidence([check(candidate, "following", a), check(target, "followers", b)]);
    return {friends, targetFollowsCandidate, candidateFollowsTarget,
      observedCount: [friends, targetFollowsCandidate, candidateFollowsTarget].filter(relation => relation.status === "observed").length};
  }

  function sharedFriends(target, candidate) {
    const a = socialList(target, "friends"), b = socialList(candidate, "friends");
    if (!a.readable || !b.readable) return {available: false, complete: false, count: null, items: []};
    const ownIds = new Set([normalizeId(target?.id), normalizeId(candidate?.id)]);
    const items = [...a.items].filter(([id]) => b.items.has(id) && !ownIds.has(id)).map(([id, item]) => ({...item,
      username: item.username || b.items.get(id).username || "",
      display_name: item.display_name || b.items.get(id).display_name || "",
      evidence: [...socialEvidence(target, "friends", item), ...socialEvidence(candidate, "friends", b.items.get(id))]}));
    return {available: true, complete: a.complete && b.complete, count: items.length, items};
  }

  function knownEdges(accounts) {
    const valid = new Map(accounts.map(account => [normalizeId(account?.id), account]).filter(([id]) => id));
    const edges = new Map();
    function add(kind, from, to, account, relation, item) {
      if (!from || !to || from === to) return;
      const pair = kind === "friend" ? [from, to].sort() : [from, to];
      const key = `${kind}:${pair.join(":")}`;
      if (!edges.has(key)) edges.set(key, {kind, from: pair[0], to: pair[1], evidence: []});
      edges.get(key).evidence.push(...socialEvidence(account, relation, item));
    }
    for (const [id, account] of valid) for (const kind of ["friends", "followers", "following"]) {
      const list = socialList(account, kind);
      if (!list.readable) continue;
      for (const [otherId, item] of list.items) {
        if (kind === "friends") add("friend", id, otherId, account, kind, item);
        else if (kind === "following") add("follow", id, otherId, account, kind, item);
        else add("follow", otherId, id, account, kind, item);
      }
    }
    return [...edges.values()];
  }

  function socialNetwork(accounts, extraNodes = []) {
    const nodes = new Map(), cachedIds = new Set();
    for (const account of accounts) {
      const id = normalizeId(account?.id);
      if (!id || cachedIds.has(id)) continue;
      cachedIds.add(id);
      nodes.set(id, {...account, id, cached: true, external: false});
    }
    function addExternal(item) {
      const id = normalizeId(item?.id);
      if (!id || cachedIds.has(id)) return;
      const prior = nodes.get(id) || {};
      nodes.set(id, {...prior, ...item, id, username: prior.username || item.username || "",
        display_name: prior.display_name || item.display_name || "", cached: false, external: true, ledger: false});
    }
    for (const item of extraNodes) addExternal(item);
    for (const account of accounts) for (const kind of ["friends", "followers", "following"]) {
      for (const item of socialList(account, kind).items.values()) addExternal(item);
    }
    const edges = knownEdges(accounts), adjacency = new Map(), friendAdjacency = new Map();
    function connect(map, a, b) {
      if (!map.has(a)) map.set(a, new Set());
      map.get(a).add(b);
    }
    for (const edge of edges) {
      connect(adjacency, edge.from, edge.to); connect(adjacency, edge.to, edge.from);
      if (edge.kind === "friend") { connect(friendAdjacency, edge.from, edge.to); connect(friendAdjacency, edge.to, edge.from); }
    }
    return {nodes, edges, cachedIds, adjacency, friendAdjacency};
  }

  function oneHopNetwork(network, targetId, limit = 12) {
    const id = normalizeId(targetId), target = network.nodes.get(id);
    if (!target) return {target: null, nodes: [], edges: [], neighbors: [], friends: [], totalNeighbors: 0, totalEdges: 0, truncated: false};
    const touching = network.edges.filter(edge => edge.from === id || edge.to === id);
    const neighbors = [...(network.adjacency.get(id) || [])].map(otherId => {
      const node = network.nodes.get(otherId);
      const cachedFriendIds = [...(network.friendAdjacency.get(otherId) || [])].filter(friendId => friendId !== id && network.cachedIds.has(friendId));
      const edges = touching.filter(edge => edge.from === otherId || edge.to === otherId);
      return {node, edges, cachedFriendIds, friend: edges.some(edge => edge.kind === "friend")};
    });
    neighbors.sort((a, b) => Number(Boolean(b.node.ledger)) - Number(Boolean(a.node.ledger)) ||
      Number(b.node.cached) - Number(a.node.cached) || b.cachedFriendIds.length - a.cachedFriendIds.length ||
      String(a.node.username || a.node.display_name || a.node.id).localeCompare(String(b.node.username || b.node.display_name || b.node.id), "en", {sensitivity: "base"}) || a.node.id.localeCompare(b.node.id));
    const maxNodes = Number.isFinite(limit) ? Math.max(1, Math.min(24, Math.floor(limit))) : 12;
    const shown = neighbors.slice(0, maxNodes), included = new Set([id, ...shown.map(item => item.node.id)]);
    return {target, nodes: [target, ...shown.map(item => item.node)],
      edges: network.edges.filter(edge => included.has(edge.from) && included.has(edge.to)),
      neighbors, friends: neighbors.filter(item => item.friend), totalNeighbors: neighbors.length,
      totalEdges: touching.length, truncated: shown.length < neighbors.length};
  }

  function compareAccounts(target, candidate) {
    return {account: candidate, avatar: compareAvatars(target?.avatar, candidate?.avatar),
      name: usernameSimilarity(target?.username, candidate?.username),
      namePattern: usernamePatterns.compare(target?.username, candidate?.username),
      social: directRelations(target, candidate), sharedFriends: sharedFriends(target, candidate),
      review: reviewAvatar(candidate?.avatar)};
  }

  function candidates(accounts, target, scope = "latest", sort = "avatar", reviewFilter = "all") {
    const targetId = normalizeId(target?.id), seen = new Set();
    const result = accounts.filter(account => {
      const id = normalizeId(account?.id);
      if (!id || id === targetId || seen.has(id)) return false;
      seen.add(id);
      return scope !== "latest" || (account.ledger && Number.isInteger(account.latest_rank) && account.latest_rank > 0 && account.latest_rank <= 50);
    }).map(account => compareAccounts(target, account)).filter(item => matchesReviewFilter(item.review, reviewFilter));
    const compareNumber = (a, b) => (b ?? -1) - (a ?? -1);
    return result.sort((a, b) => {
      let order;
      if (sort === "review") {
        const rank = {full: 3, partial: 2, none: 1, unknown: 0};
        order = compareNumber(rank[a.review.status], rank[b.review.status]) ||
          compareNumber(a.review.fullMatches.length, b.review.fullMatches.length) ||
          compareNumber(a.review.matchedAssetCount, b.review.matchedAssetCount);
      }
      else if (sort === "name") order = compareNumber(a.namePattern.rank, b.namePattern.rank) || compareNumber(a.namePattern.score, b.namePattern.score);
      else if (sort === "social") order = compareNumber(a.social.observedCount, b.social.observedCount) || compareNumber(a.sharedFriends.count, b.sharedFriends.count);
      else order = compareNumber(a.avatar.groups.cosmetic?.sharedCount, b.avatar.groups.cosmetic?.sharedCount) || compareNumber(a.avatar.groups.cosmetic?.jaccard, b.avatar.groups.cosmetic?.jaccard);
      return order || a.account.username.localeCompare(b.account.username, "en", {sensitivity: "base"}) || String(a.account.id).localeCompare(String(b.account.id));
    });
  }

  return Object.freeze({normalizeId, profileUrl, assetUrl, thumbnailUrl, sourceUrl, assetGroup, compareAvatars,
    RBI_AVATAR_RULES, reviewAvatar, matchesReviewFilter, classifyPresetResemblance, relationshipLens,
    usernameSimilarity, socialList, socialEvidence, directRelations, sharedFriends, knownEdges, socialNetwork,
    oneHopNetwork, compareAccounts, candidates});
});

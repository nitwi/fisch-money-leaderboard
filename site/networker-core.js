(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FischNetworker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
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

  function relationEvidence(checks) {
    const observed = checks.filter(check => check.list.readable && check.list.items.has(check.id));
    if (observed.length) return {status: "observed", evidence: observed.map(check => {
      const item = check.list.items.get(check.id);
      return {ownerId: check.ownerId, kind: check.kind,
        fetched_at: item.observed_at || check.list.record.fetched_at,
        source_url: item.source_url || check.list.record.source_url};
    })};
    const complete = checks.filter(check => check.list.complete);
    return {status: complete.length ? "not_observed" : "unknown", evidence: complete.map(check => ({ownerId: check.ownerId, kind: check.kind, fetched_at: check.list.record.fetched_at, source_url: check.list.record.source_url}))};
  }

  function directRelations(target, candidate) {
    const a = normalizeId(target?.id), b = normalizeId(candidate?.id);
    const unknown = () => ({status: "unknown", evidence: []});
    if (!a || !b || a === b) return {friends: unknown(), targetFollowsCandidate: unknown(), candidateFollowsTarget: unknown(), observedCount: 0};
    const check = (account, kind, id) => ({ownerId: normalizeId(account.id), kind, id, list: socialList(account, kind)});
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
    const items = [...a.items].filter(([id]) => b.items.has(id) && !ownIds.has(id)).map(([, item]) => item);
    return {available: true, complete: a.complete && b.complete, count: items.length, items};
  }

  function knownEdges(accounts) {
    const valid = new Map(accounts.map(account => [normalizeId(account?.id), account]).filter(([id]) => id));
    const edges = new Map();
    function add(kind, from, to, record, item) {
      if (!from || !to || from === to || !valid.has(from) || !valid.has(to)) return;
      const pair = kind === "friend" ? [from, to].sort() : [from, to];
      const key = `${kind}:${pair.join(":")}`;
      if (!edges.has(key)) edges.set(key, {kind, from: pair[0], to: pair[1], evidence: []});
      edges.get(key).evidence.push({fetched_at: item.observed_at || record.fetched_at, source_url: item.source_url || record.source_url});
    }
    for (const [id, account] of valid) for (const kind of ["friends", "followers", "following"]) {
      const list = socialList(account, kind);
      if (!list.readable) continue;
      for (const [otherId, item] of list.items) {
        if (kind === "friends") add("friend", id, otherId, list.record, item);
        else if (kind === "following") add("follow", id, otherId, list.record, item);
        else add("follow", otherId, id, list.record, item);
      }
    }
    return [...edges.values()];
  }

  function compareAccounts(target, candidate) {
    return {account: candidate, avatar: compareAvatars(target?.avatar, candidate?.avatar),
      name: usernameSimilarity(target?.username, candidate?.username),
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
      else if (sort === "name") order = compareNumber(a.name.similarity, b.name.similarity);
      else if (sort === "social") order = compareNumber(a.social.observedCount, b.social.observedCount) || compareNumber(a.sharedFriends.count, b.sharedFriends.count);
      else order = compareNumber(a.avatar.groups.cosmetic?.sharedCount, b.avatar.groups.cosmetic?.sharedCount) || compareNumber(a.avatar.groups.cosmetic?.jaccard, b.avatar.groups.cosmetic?.jaccard);
      return order || a.account.username.localeCompare(b.account.username, "en", {sensitivity: "base"}) || String(a.account.id).localeCompare(String(b.account.id));
    });
  }

  return Object.freeze({normalizeId, profileUrl, assetUrl, thumbnailUrl, sourceUrl, assetGroup, compareAvatars,
    RBI_AVATAR_RULES, reviewAvatar, matchesReviewFilter,
    usernameSimilarity, socialList, directRelations, sharedFriends, knownEdges, compareAccounts, candidates});
});

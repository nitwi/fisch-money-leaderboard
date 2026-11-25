(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FischUsernamePatterns = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // These are explainable naming rules, not an AI model or an ownership score.
  // A name pattern must never establish an identity or a social connection.
  const VERSION = "1.1.0";
  const METHOD = "Deterministic username patterns; scores order results and are not probabilities.";
  const PLACEHOLDERS = new Set(["unavailable", "unknown", "deleted", "deleteduser", "accountdeleted", "null", "undefined", "none"]);
  const COMMON = new Set([
    "a", "an", "the", "i", "im", "iam", "its", "my", "your", "you", "me", "of", "and",
    "x", "xx", "xxx", "xd", "yt", "ttv", "tv", "twitch", "official", "real", "alt", "main", "backup",
    "account", "acc", "player", "user", "roblox", "robloxuser", "blox", "fisch", "fish", "fishing",
    "gamer", "gaming", "game", "games", "plays", "play", "pro", "noob", "king", "queen", "lord", "boy", "girl", "man"
  ]);
  const DECORATIONS = new Set(["x", "xx", "xxx", "xd", "yt", "ttv", "official", "real", "alt", "main", "backup", "the"]);
  const LONG_AFFIXES = ["official", "backup", "gaming", "plays", "main", "real", "alt", "ttv"];
  // Common themes may carry information in a multi-part pattern but not when
  // they are the only shared part.
  const WEAK_EDGE_WORDS = new Set(["awesome", "champion", "darkness", "dragon", "fantasy", "goddess",
    "legend", "legendary", "master", "phantom", "princess", "reaper", "shadow", "silver", "warrior", "youtube"]);
  const COMMON_ENDS = [...COMMON].filter(word => word.length >= 3).sort((a, b) => b.length - a.length || compareText(a, b));
  const LABELS = Object.freeze({strong: "Strong name pattern", possible: "Possible name pattern", none: "No name pattern", unknown: "Username unavailable"});
  const RANKS = Object.freeze({unknown: -1, none: 0, possible: 1, strong: 2});
  const LEET = Object.freeze({"0": ["o"], "1": ["i", "l"], "3": ["e"], "4": ["a"], "5": ["s"], "7": ["t"]});

  function unique(values) { return [...new Set(values)]; }
  function compareText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function stripEdgeNumbers(value) {
    let stem = value;
    const prefixNumber = (stem.match(/^\d+/) || [""])[0];
    stem = stem.slice(prefixNumber.length);
    const suffixNumber = (stem.match(/\d+$/) || [""])[0];
    if (suffixNumber) stem = stem.slice(0, -suffixNumber.length);
    // A trailing v immediately before a number is a version marker only when
    // the remaining name is long enough to carry the pattern on its own.
    const version = Boolean(suffixNumber && /v$/.test(stem) && stem.slice(0, -1).replace(/[^a-z]/g, "").length >= 5);
    if (version) stem = stem.slice(0, -1);
    return {stem, prefixNumber, suffixNumber, version};
  }

  function distinctiveRemainder(value) {
    let rest = value;
    // Ignore concatenations of common account/game words as well as individual
    // common words. A remaining distinctive stem still has to pass length checks.
    for (let i = 0; i < 8 && rest; i += 1) {
      if (COMMON.has(rest)) return "";
      const prefix = COMMON_ENDS.find(word => rest.startsWith(word));
      if (prefix) { rest = rest.slice(prefix.length); continue; }
      const suffix = COMMON_ENDS.find(word => rest.endsWith(word));
      if (suffix) { rest = rest.slice(0, -suffix.length); continue; }
      break;
    }
    return rest;
  }

  function usableStem(value, minimum = 5) {
    if (!/^[a-z]+$/.test(value)) return false;
    const rest = distinctiveRemainder(value);
    if (rest.length < minimum || new Set(rest).size < 3 || !/[aeiouy]/.test(rest)) return false;
    if (/[bcdfghjklmnpqrstvwxz]{6}/.test(rest)) return false;
    return ![...new Set(rest)].some(letter => rest.split(letter).length - 1 > rest.length * 0.65);
  }

  function analyze(value) {
    const original = typeof value === "string" ? value : null;
    const invalid = reason => ({available: false, original, username: null, reason, compact: "", stem: "", tokens: [], numbers: [], cores: []});
    if (typeof value !== "string") return invalid("A username string is required.");
    const username = value.trim().replace(/^@/, "");
    if (!username) return invalid("The username is missing.");
    if (username.length > 100 || !/^[A-Za-z0-9_]+$/.test(username)) {
      return invalid("The value is not a supported Roblox username. Unicode lookalikes, display names, and markup are not folded into another name.");
    }
    const lower = username.toLowerCase();
    const compact = lower.replace(/_/g, "");
    if (PLACEHOLDERS.has(compact)) return invalid("This value is a missing or unavailable username placeholder.");
    if (!compact) return invalid("The username has no letters or numbers.");
    const generated = /^roblox_?user_?\d+$/i.test(lower);
    const parts = username
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
      .replace(/([a-z\d])([A-Z])/g, "$1_$2")
      .toLowerCase().split(/_+/).filter(Boolean);
    const edge = stripEdgeNumbers(compact);
    const cleanParts = parts.map(part => stripEdgeNumbers(part).stem).filter(Boolean);
    // Digits inside a word are not word boundaries: splitting random strings at
    // their digits would manufacture seemingly distinctive shared tokens.
    const tokens = unique(cleanParts.filter(part => /^[a-z]+$/.test(part)));
    const cores = [{value: edge.stem, changes: []}];
    const addCore = (core, change) => {
      if (core.length >= 5 && !cores.some(item => item.value === core)) cores.push({value: core, changes: [change]});
    };
    let trimmed = [...cleanParts];
    const removed = [];
    while (trimmed.length > 1 && DECORATIONS.has(trimmed[0])) removed.push(trimmed.shift());
    while (trimmed.length > 1 && DECORATIONS.has(trimmed[trimmed.length - 1])) removed.push(trimmed.pop());
    if (removed.length) addCore(trimmed.join(""), `decorative token${removed.length > 1 ? "s" : ""}: ${removed.join(", ")}`);
    for (const affix of LONG_AFFIXES) {
      if (edge.stem.startsWith(affix) && edge.stem.length - affix.length >= 6) addCore(edge.stem.slice(affix.length), `prefix: ${affix}`);
      if (edge.stem.endsWith(affix) && edge.stem.length - affix.length >= 6) addCore(edge.stem.slice(0, -affix.length), `suffix: ${affix}`);
    }
    // Fragmented mixed-case strings and long consonant runs are not useful
    // word-family evidence. Exact text can still be reported literally.
    const opaque = cleanParts.length >= 3 && cleanParts.every(part => part.replace(/\d/g, "").length < 5);
    return {available: true, original, username, lower, compact, stem: edge.stem, cleanParts,
      tokens, numbers: lower.match(/\d+/g) || [], prefixNumber: edge.prefixNumber,
      suffixNumber: edge.suffixNumber, version: edge.version, cores, generated, opaque};
  }

  function embeddedSeries(name) {
    // Require a whole numeric run between two recognizable, substantial name
    // parts. An ordinary internal leet digit does not have that boundary.
    const match = name.username.match(/^([A-Za-z]{5,})_?(\d{1,4})(?:_([A-Za-z]{5,})|([A-Z][A-Za-z]{4,}))$/);
    if (!match) return null;
    const first = match[1].toLowerCase(), last = (match[3] || match[4]).toLowerCase();
    if (!usableStem(first) || !usableStem(last) || first === last) return null;
    return {first, last, number: match[2]};
  }

  function flattenedEdgeMatches(left, right) {
    if (left.opaque || right.opaque || !/^[a-z]+$/.test(left.stem) || !/^[a-z]+$/.test(right.stem)) return [];
    const matches = [];
    for (const [marked, flat] of [[left, right], [right, left]]) {
      if (marked.cleanParts.length < 2 || flat.cleanParts.length !== 1) continue;
      for (const [edge, index, method] of [["prefix", 0, "startsWith"], ["suffix", marked.cleanParts.length - 1, "endsWith"]]) {
        const stem = marked.cleanParts[index];
        if (!usableStem(stem, 7) || WEAK_EDGE_WORDS.has(stem) || !marked.stem[method](stem) || !flat.stem[method](stem)) continue;
        if ([marked.stem, flat.stem].every(value => value.length - stem.length >= 3 && stem.length / value.length >= 0.4)) {
          matches.push({edge, stem});
        }
      }
    }
    return matches.sort((a, b) => b.stem.length - a.stem.length || compareText(a.stem, b.stem) || compareText(a.edge, b.edge));
  }

  function foldedVariants(value) {
    const digits = value.match(/\d/g) || [];
    // Keep bounded exact substitutions. Do not turn arbitrary random alphanumeric
    // strings into approximate matches by repeatedly rewriting them.
    if (!digits.length || digits.length > 2 || digits.some(digit => !LEET[digit])) return [];
    if (value.replace(/\d/g, "").length < 5) return [];
    let variants = [{value: "", substitutions: [], ambiguous: false}];
    for (const character of value) {
      if (!LEET[character]) {
        variants = variants.map(item => ({...item, value: item.value + character}));
        continue;
      }
      variants = variants.flatMap(item => LEET[character].map(letter => ({
        value: item.value + letter,
        substitutions: unique([...item.substitutions, `${character} → ${letter}`]),
        ambiguous: item.ambiguous || character === "1"
      })));
    }
    return variants.filter(item => usableStem(item.value));
  }

  function makeResult(left, right, signals, ignored) {
    const available = left.available && right.available;
    signals.sort((a, b) => b.score - a.score || compareText(a.code, b.code) || compareText(a.detail, b.detail));
    const tier = !available ? "unknown" : signals[0]?.tier || "none";
    const reasons = !available ? unique([left.reason, right.reason].filter(Boolean)).sort(compareText) :
      signals.length ? signals.map(signal => signal.detail) : [
        ignored.length ? ignored.join(" ") : "No distinctive naming pattern was found. A few similar letters alone do not establish a name family."
      ];
    return {available, score: signals[0]?.score || 0, rank: RANKS[tier], tier, label: LABELS[tier],
      signals, reasons, normalized: {left, right}, ignored, method: METHOD};
  }

  function compare(a, b) {
    const left = analyze(a), right = analyze(b), signals = [], ignored = [];
    const add = (code, tier, score, title, detail, evidence = {}) => {
      if (!signals.some(signal => signal.code === code)) signals.push({code, tier, score, title, detail, ...evidence});
    };
    const done = () => makeResult(left, right, signals, ignored);
    if (!left.available || !right.available) return done();
    if (left.generated || right.generated) {
      ignored.push("Roblox-generated replacement usernames are excluded from name-family evidence.");
      return done();
    }
    if (!/[a-z]/.test(left.compact) || !/[a-z]/.test(right.compact)) {
      ignored.push("Numbers alone do not provide a distinctive username pattern.");
      return done();
    }
    if (left.lower === right.lower) {
      add("exact_name", "strong", 100, "Same username text", "The username text is identical apart from letter case or a leading @. This describes the text; account IDs still determine identity.", {stem: left.lower});
      return done();
    }
    if (left.compact === right.compact && usableStem(left.stem) && !left.opaque && !right.opaque) {
      add("separator_variant", "strong", 94, "Separator or case variant", `Both names reduce to “${left.compact}” after removing underscores and ignoring case.`, {stem: left.compact});
    }
    if (left.stem === right.stem && usableStem(left.stem) && !left.opaque && !right.opaque &&
        (left.prefixNumber !== right.prefixNumber || left.suffixNumber !== right.suffixNumber || left.version !== right.version)) {
      add("numbered_variant", "strong", 92, "Numbered name variants", `Both names use the distinctive stem “${left.stem}” with different numeric prefixes, suffixes, or version markers. The shared stem supplies the evidence; the numbers alone do not.`, {stem: left.stem});
    }
    const embeddedA = embeddedSeries(left), embeddedB = embeddedSeries(right);
    if (embeddedA && embeddedB && embeddedA.first === embeddedB.first && embeddedA.last === embeddedB.last && embeddedA.number !== embeddedB.number) {
      const tokens = [embeddedA.first, embeddedA.last];
      add("embedded_number_variant", "possible", 68, "Number between shared name parts", `Both names put a different number between “${tokens[0]}” and “${tokens[1]}”. The shared name parts supply the evidence, not the numbers.`, {tokens});
    }

    const sharedCores = [];
    for (const x of left.cores) for (const y of right.cores) {
      if (x.value === y.value && (x.changes.length || y.changes.length) && usableStem(x.value) && !left.opaque && !right.opaque) {
        sharedCores.push({stem: x.value, changes: unique([...x.changes, ...y.changes]).sort(compareText)});
      }
    }
    sharedCores.sort((x, y) => y.stem.length - x.stem.length || compareText(x.stem, y.stem));
    if (sharedCores.length) {
      const best = sharedCores[0];
      add("affix_variant", "strong", 82, "Same stem with account labels", `Both names use “${best.stem}” after recognized account labels are removed (${best.changes.join("; ")}).`, best);
    }

    // A short edge decoration alone is too weak. Require a complete stem already
    // isolated by a recognized decoration on one side before considering one
    // additional edge letter on the other (e.g. xNnoel / Nnoelq).
    if (!signals.length && !left.opaque && !right.opaque) {
      const edgeMatches = [];
      for (const [anchor, other] of [[left, right], [right, left]]) {
        for (const core of anchor.cores) {
          if (!core.changes.length || !usableStem(core.value) || other.stem.length !== core.value.length + 1 || !/^[a-z]+$/.test(other.stem)) continue;
          if (other.stem.startsWith(core.value) || other.stem.endsWith(core.value)) {
            edgeMatches.push({stem: core.value, decoratedStem: other.stem, changes: core.changes});
          }
        }
      }
      edgeMatches.sort((x, y) => y.stem.length - x.stem.length || compareText(x.stem, y.stem));
      if (edgeMatches.length) {
        const match = edgeMatches[0];
        add("edge_decoration", "possible", 48, "Shared stem with edge letters", `The complete stem “${match.stem}” follows a recognized account decoration in one name; “${match.decoratedStem}” adds a single edge letter in the other. This is only a possible naming pattern.`, match);
      }
    }

    const leetMatches = [];
    for (const x of left.cores) for (const y of right.cores) {
      const xs = /^[a-z]+$/.test(x.value) ? [{value: x.value, substitutions: [], ambiguous: false}] : foldedVariants(x.value);
      const ys = /^[a-z]+$/.test(y.value) ? [{value: y.value, substitutions: [], ambiguous: false}] : foldedVariants(y.value);
      for (const xv of xs) for (const yv of ys) {
        if (xv.value !== yv.value || !usableStem(xv.value) || !xv.substitutions.length && !yv.substitutions.length) continue;
        const substitutions = unique([...xv.substitutions, ...yv.substitutions]).sort(compareText);
        const ambiguous = xv.ambiguous || yv.ambiguous;
        leetMatches.push({stem: xv.value, substitutions, ambiguous,
          decorated: Boolean(x.changes.length || y.changes.length)});
      }
    }
    leetMatches.sort((x, y) => Number(x.ambiguous) - Number(y.ambiguous) || Number(x.decorated) - Number(y.decorated) || compareText(x.stem, y.stem));
    if (leetMatches.length) {
      const match = leetMatches[0];
      const weak = match.ambiguous || match.decorated;
      add("digit_substitution", weak ? "possible" : "strong", weak ? 60 : 86,
        "Digit-for-letter pattern", `The stems align as “${match.stem}” using ${match.substitutions.join(", ")}.${match.ambiguous ? " The digit 1 can represent i or l, so this interpretation remains ambiguous." : " Numeric prefixes and suffixes are considered separately."}${match.decorated ? " This also requires removing an account label." : ""}`, match);
    }

    const tokensA = left.tokens.filter(token => usableStem(token, 4)).sort(compareText);
    const tokensB = right.tokens.filter(token => usableStem(token, 4)).sort(compareText);
    const sharedTokens = tokensA.filter(token => tokensB.includes(token));
    const totalSharedLength = sharedTokens.reduce((sum, token) => sum + token.length, 0);
    if (!left.opaque && !right.opaque && sharedTokens.length >= 2 && totalSharedLength >= 10) {
      const sameTokens = tokensA.length === tokensB.length && tokensA.every((token, i) => token === tokensB[i]);
      const sameOrder = left.tokens.filter(token => sharedTokens.includes(token)).join("|") === right.tokens.filter(token => sharedTokens.includes(token)).join("|");
      if (sameTokens && !sameOrder) {
        add("reordered_tokens", "strong", 80, "Reordered name parts", `The same distinctive name parts appear in a different order: ${sharedTokens.map(token => `“${token}”`).join(", ")}.`, {tokens: sharedTokens});
      } else if (!signals.length) {
        add("shared_tokens", "possible", 64, "Several shared name parts", `The names share these complete name parts: ${sharedTokens.map(token => `“${token}”`).join(", ")}. Other parts differ.`, {tokens: sharedTokens});
      }
    } else if (!left.opaque && !right.opaque && !signals.length) {
      const token = [...sharedTokens].filter(token => token.length >= 6 && !WEAK_EDGE_WORDS.has(token)).sort((x, y) => y.length - x.length || compareText(x, y))[0];
      if (token) add("shared_token", "possible", 44, "One shared name part", `The names share the complete part “${token}” at a separator or word boundary. A single shared part is weak evidence and can occur independently.`, {tokens: [token]});
    }

    if (!signals.length && !left.opaque && !right.opaque) {
      const matches = [];
      for (const x of left.cores) for (const y of right.cores) {
        if (!/^[a-z]+$/.test(x.value) || !/^[a-z]+$/.test(y.value) || x.value === y.value) continue;
        const foldA = x.value.replace(/(.)\1+/g, "$1"), foldB = y.value.replace(/(.)\1+/g, "$1");
        const removedA = x.value.length - foldA.length, removedB = y.value.length - foldB.length;
        const changes = unique([...x.changes, ...y.changes]).sort(compareText);
        if (foldA === foldB && usableStem(foldA, changes.length ? 6 : 5) && removedA + removedB <= 3 && Math.abs(removedA - removedB) <= 2) {
          matches.push({stem: foldA, changes, removed: removedA + removedB});
        }
      }
      matches.sort((a, b) => a.changes.length - b.changes.length || a.removed - b.removed || compareText(a.stem, b.stem) || compareText(a.changes.join(), b.changes.join()));
      if (matches.length) {
        const {stem, changes} = matches[0];
        add("repeated_letter", "possible", changes.length ? 50 : 54, "Repeated-letter variant", `The complete stems become “${stem}” when repeated letters are collapsed.${changes.length ? ` This also requires removing account labels (${changes.join("; ")}).` : " This is a possible spelling pattern, not a general edit-distance match."}`, {stem, changes});
      }
    }
    if (!signals.length) {
      const best = flattenedEdgeMatches(left, right)[0];
      if (best) {
        add("shared_edge_stem", "possible", 46, `Distinctive shared ${best.edge}`, `Both names share the ${best.edge} “${best.stem}”. One name marks a word boundary; the other is written as one part. This is only a possible naming pattern.`, best);
      }
    }
    if (!signals.length) {
      if (left.numbers.some(number => right.numbers.includes(number))) ignored.push("Shared numbers were ignored because the names do not share a distinctive stem.");
      if (left.tokens.some(token => COMMON.has(token) && right.tokens.includes(token)) ||
          left.stem === right.stem && !usableStem(left.stem)) ignored.push("Short, common, or opaque name parts were not counted as family evidence.");
      if (left.opaque || right.opaque) ignored.push("Fragmented name strings were not treated as word patterns.");
    }
    return done();
  }

  return Object.freeze({VERSION, METHOD, compare, analyze});
});

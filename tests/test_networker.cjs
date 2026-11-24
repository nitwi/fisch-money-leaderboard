'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const network = require('../site/networker-core.js');
const time = require('../site/time-utils.js');

const CHECKED = '2026-11-24T10:20:30.000Z';
const asset = (id, type_id = 8, type_name = 'Hat') => ({id: String(id), type_id, type_name, name: `Asset ${id}`});
const avatar = assets => ({status: 'ok', assets, fetched_at: CHECKED});
const list = (status = 'unavailable', ids = [], extras = {}) => ({
  status, items: ids.map(id => typeof id === 'object' ? id : {id: String(id), username: `user_${id}`}),
  fetched_at: status === 'unavailable' ? null : CHECKED, attempted: status !== 'unavailable',
  source_url: 'https://friends.roblox.com/v1/users/1/friends', ...extras
});
const account = (id, extra = {}) => ({id: String(id), username: `user_${id}`, ledger: true,
  latest_rank: null, aliases: [], avatar: avatar([]), friends: list(), followers: list(), following: list(), ...extra});

test('stable numeric IDs produce fixed Roblox links and reject executable or imprecise IDs', () => {
  assert.equal(network.normalizeId('00012013950464'), '12013950464');
  assert.equal(network.normalizeId(123), '123');
  for (const bad of [null, {}, [], 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '0', '123/../4', '1?x=2', 'javascript:alert(1)', '<svg onload=alert(1)>']) {
    assert.equal(network.normalizeId(bad), null, String(bad));
    assert.equal(network.profileUrl(bad), null, String(bad));
    assert.equal(network.assetUrl(bad), null, String(bad));
  }
  assert.equal(network.profileUrl('0123'), 'https://www.roblox.com/users/123/profile');
  assert.equal(network.assetUrl('0123'), 'https://www.roblox.com/catalog/123');
});

test('images and sources accept HTTPS Roblox/CDN hosts, never lookalikes or other schemes', () => {
  assert.equal(network.thumbnailUrl('https://tr.rbxcdn.com/abc/420/420/Avatar/Png'), 'https://tr.rbxcdn.com/abc/420/420/Avatar/Png');
  assert.equal(network.sourceUrl('https://avatar.roblox.com/v1/users/1/avatar'), 'https://avatar.roblox.com/v1/users/1/avatar');
  for (const bad of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'http://tr.rbxcdn.com/a', 'https://rbxcdn.com.evil.test/a', 'https://evilroblox.com/a', 'https://user:password@roblox.com/a', 'https://roblox.com:8080/a', '//rbxcdn.com/a']) {
    assert.equal(network.thumbnailUrl(bad), null, bad);
    assert.equal(network.sourceUrl(bad), null, bad);
  }
  assert.equal(network.sourceUrl('https://tr.rbxcdn.com/a'), null);
});

test('asset overlap deduplicates IDs and separates cosmetics from body and animation defaults', () => {
  const a = avatar([asset('1'), asset('2'), asset('2'), asset('10', 17, 'Head'), asset('20', 51, 'IdleAnimation')]);
  const b = avatar([asset('2'), asset('3'), asset('10', 17, 'Head'), asset('20', 51, 'IdleAnimation')]);
  const result = network.compareAvatars(a, b);
  assert.equal(result.available, true);
  assert.deepEqual(result.groups.cosmetic.sharedIds, ['2']);
  assert.equal(result.groups.cosmetic.leftCount, 2);
  assert.equal(result.groups.cosmetic.unionCount, 3);
  assert.ok(Math.abs(result.groups.cosmetic.jaccard - 100 / 3) < 1e-10);
  assert.equal(result.groups.body.sharedCount, 1);
  assert.equal(result.groups.animation.sharedCount, 1);
  assert.equal(result.all.sharedCount, 3);
  assert.equal(result.exactAssetSet, false);
  assert.equal(network.assetGroup({type_id: 79, type_name: 'DynamicHead'}), 'body');
  assert.equal(network.assetGroup({type_id: 999, type_name: 'FutureAnimation'}), 'animation');
});

test('missing or empty avatars cannot become a perfect match', () => {
  const missing = network.compareAvatars({status: 'unavailable', assets: [asset('1')]}, avatar([asset('1')]));
  assert.equal(missing.available, false);
  assert.equal(missing.exactAssetSet, false);
  assert.equal(missing.groups.cosmetic, undefined);
  const empty = network.compareAvatars(avatar([]), avatar([]));
  assert.equal(empty.available, true);
  assert.equal(empty.all.jaccard, null);
  assert.equal(empty.groups.cosmetic.jaccard, null);
  assert.equal(empty.exactAssetSet, false);
  assert.equal(network.compareAvatars(avatar([]), avatar([asset('1')])).all.jaccard, 0);
});

test('matching equipped assets and verified appearance settings are independent facts', () => {
  const a = avatar([asset('1'), asset('2')]);
  const b = avatar([asset('2'), asset('1')]);
  assert.equal(network.compareAvatars(a, b).exactAssetSet, true);
  assert.equal(network.compareAvatars(a, b).configurationMatch, null);
  Object.assign(a, {body_colors: {head: 1, torso: 2}, scales: {height: 1, width: 1}, rig_type: 'R15'});
  Object.assign(b, {body_colors: {torso: 2, head: 1}, scales: {width: 1, height: 1}, rig_type: 'R15'});
  assert.equal(network.compareAvatars(a, b).configurationMatch, true);
  b.scales.height = 0.9;
  assert.equal(network.compareAvatars(a, b).configurationMatch, false);
  assert.equal(network.compareAvatars(a, b).exactAssetSet, true);
});

test('username similarity is explicit case-insensitive edit distance and excludes display names', () => {
  const result = network.usernameSimilarity('kitten', 'sitting');
  assert.equal(result.distance, 3);
  assert.equal(result.maxLength, 7);
  assert.ok(Math.abs(result.similarity - (1 - 3 / 7) * 100) < 1e-10);
  assert.equal(network.usernameSimilarity('@Lunary810', 'lunary810').similarity, 100);
  assert.equal(network.usernameSimilarity('a_b1', 'ab1').distance, 1);
  assert.equal(network.usernameSimilarity('name1', 'name2').distance, 1);
  assert.equal(network.usernameSimilarity('', '').available, false);
  assert.equal(network.usernameSimilarity('<b>name</b>', 'name').available, false);
  const comparison = network.compareAccounts(account('1', {username: 'abc', display_name: 'Same display'}), account('2', {username: 'xyz', display_name: 'Same display'}));
  assert.equal(comparison.name.similarity, 0);
});

test('follows preserve direction and can be evidenced by either side of the same relationship', () => {
  const a = account('1', {following: list('partial', ['2'])});
  const b = account('2');
  let result = network.directRelations(a, b);
  assert.equal(result.targetFollowsCandidate.status, 'observed');
  assert.equal(result.candidateFollowsTarget.status, 'unknown');
  assert.equal(result.friends.status, 'unknown');
  a.following = list(); b.followers = list('complete', ['1']);
  result = network.directRelations(a, b);
  assert.equal(result.targetFollowsCandidate.status, 'observed');
  assert.equal(result.candidateFollowsTarget.status, 'unknown');
  b.following = list('partial', ['1']);
  assert.equal(network.directRelations(a, b).candidateFollowsTarget.status, 'observed');
});

test('partial or unavailable omissions remain unknown; complete-list absence stays scoped', () => {
  const a = account('1', {friends: list('partial', []), following: list('unavailable', ['2'])});
  const b = account('2');
  let result = network.directRelations(a, b);
  assert.equal(result.friends.status, 'unknown');
  assert.equal(result.targetFollowsCandidate.status, 'unknown');
  a.friends = list('complete', []);
  assert.equal(network.directRelations(a, b).friends.status, 'not_observed');
  b.friends = list('partial', ['1']);
  assert.equal(network.directRelations(a, b).friends.status, 'observed');
  assert.equal(network.directRelations(a, a).friends.status, 'unknown');
});

test('social evidence retains the successful page time and endpoint after a later-page failure', () => {
  const pageOne = '2026-11-24T10:20:30.000Z', pageTwo = '2026-11-24T10:21:30.000Z';
  const sourceOne = 'https://friends.roblox.com/v1/users/1/followings?limit=100';
  const sourceTwo = 'https://friends.roblox.com/v1/users/1/followings?limit=100&cursor=second';
  const a = account('1', {following: list('partial', [{id: '2', observed_at: pageOne, source_url: sourceOne}], {
    fetched_at: pageTwo, checked_at: '2026-11-24T10:22:30.000Z', failed_at: '2026-11-24T10:22:30.000Z', source_url: sourceTwo
  })});
  const b = account('2');
  const evidence = network.directRelations(a, b).targetFollowsCandidate.evidence[0];
  assert.equal(evidence.fetched_at, pageOne);
  assert.equal(evidence.source_url, sourceOne);
  assert.equal(network.knownEdges([a, b])[0].evidence[0].fetched_at, pageOne);
  assert.equal(network.knownEdges([a, b])[0].evidence[0].source_url, sourceOne);
  a.following.items = [{id: '2'}];
  assert.equal(network.directRelations(a, b).targetFollowsCandidate.evidence[0].fetched_at, pageTwo);
});

test('shared friends are a partial lower bound, exclude compared IDs, and keep unavailable counts null', () => {
  const a = account('1', {friends: list('partial', ['1', '2', '3', '3', '4'])});
  const b = account('2', {friends: list('complete', ['1', '2', '3', '5'])});
  const shared = network.sharedFriends(a, b);
  assert.equal(shared.available, true);
  assert.equal(shared.complete, false);
  assert.equal(shared.count, 1);
  assert.deepEqual(shared.items.map(item => item.id), ['3']);
  b.friends = list();
  assert.equal(network.sharedFriends(a, b).count, null);
  a.friends = list('complete', []); b.friends = list('complete', []);
  assert.deepEqual(network.sharedFriends(a, b), {available: true, complete: true, count: 0, items: []});
});

test('graph edges deduplicate friendships and retain separate follow directions without invented edges', () => {
  const a = account('1', {friends: list('complete', ['1', '2']), following: list('partial', ['2'])});
  const b = account('2', {friends: list('partial', ['1']), followers: list('complete', ['1']), following: list('partial', ['1'])});
  const c = account('3', {friends: list('unavailable', ['1']), avatar: a.avatar, username: a.username});
  const edges = network.knownEdges([a, b, c]);
  assert.deepEqual(edges.map(edge => `${edge.kind}:${edge.from}:${edge.to}`).sort(), ['follow:1:2', 'follow:2:1', 'friend:1:2']);
  assert.equal(edges.find(edge => edge.kind === 'friend').evidence.length, 2);
  assert.equal(edges.find(edge => edge.kind === 'follow' && edge.from === '1').evidence.length, 2);
});

test('candidate scope excludes own stable ID and duplicates and sorts cosmetics independently of body defaults', () => {
  const target = account('1', {username: 'reference', latest_rank: 1, avatar: avatar([asset('10', 17, 'Head'), asset('11', 18, 'Face'), asset('20')])});
  const defaults = account('2', {latest_rank: 2, avatar: avatar([asset('10', 17, 'Head'), asset('11', 18, 'Face')])});
  const clothing = account('3', {latest_rank: 3, avatar: avatar([asset('20')])});
  const history = account('4');
  const reference = account('5', {ledger: false});
  const accounts = [target, {...target, id: '0001', username: 'renamed_reference'}, defaults, clothing, {...clothing}, history, reference];
  assert.deepEqual(network.candidates(accounts, target).map(item => item.account.id), ['3', '2']);
  assert.equal(network.candidates(accounts, target, 'all').length, 4);
  assert.equal(network.candidates(accounts, target, 'all').some(item => network.normalizeId(item.account.id) === target.id), false);
});

// A minimal DOM fixture exercises real page rendering without a browser or external libraries.
// It throws if production code attempts HTML insertion instead of building text nodes.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {};
    this.hidden = false; this.disabled = false; this.value = ''; this.className = '';
    this.classList = {toggle: () => {}};
  }
  set textContent(value) { this.children = [String(value)]; }
  get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
  set innerHTML(value) { throw new Error(`Unsafe HTML insertion: ${value}`); }
  append(...values) { this.children.push(...values.map(value => typeof value === 'string' ? value : value)); }
  replaceChildren(...values) { this.children = []; this.append(...values); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  scrollIntoView() {}
  replaceWith() {}
}
function descendants(element) { return [element, ...element.children.filter(child => child instanceof Element).flatMap(descendants)]; }
async function renderSnapshot(accounts, query = '', snapshotFields = {}) {
  const elements = new Map();
  const document = {getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
    createElement(tag) { return new Element(tag); }, createElementNS(_namespace, tag) { return new Element(tag); }};
  const location = {href: `https://example.test/ledger/networker.html${query}`, search: query};
  const snapshot = {schema_version: 1, generated_at: CHECKED, ledger_latest_checkpoint: {day_key: '2026-11-23'}, accounts,
    capabilities: {friends: {status: 'unavailable', reason: 'Unauthenticated request denied', checked_at: CHECKED}}, notes: [], ...snapshotFields};
  const window = {FischNetworker: network, FischTime: time, innerWidth: 1200};
  const context = {window, document, location, history: {replaceState(_state, _unused, url) { location.href = String(url); location.search = new URL(url).search; }},
    URL, URLSearchParams, Intl, Date, Map, Set, console, navigator: {clipboard: {writeText: async () => {}}},
    fetch: async () => ({ok: true, json: async () => snapshot})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../site/networker.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return {elements, location, snapshot};
}

test('page defaults to the neutral reference, exposes real shared assets, and renders unknown social coverage', async () => {
  const target = account('12013950464', {username: 'Lunary810', ledger: false, avatar: avatar([asset('500')]),
    avatar_thumbnail: 'https://tr.rbxcdn.com/current-avatar.png', headshot: 'https://tr.rbxcdn.com/old-headshot.png'});
  const candidate = account('2', {username: 'Candidate', latest_rank: 1, avatar: avatar([asset('500')])});
  const {elements, location} = await renderSnapshot([candidate, target]);
  assert.equal(elements.get('networker-app').hidden, false);
  assert.match(elements.get('reference-summary').textContent, /@Lunary810/);
  assert.equal(descendants(elements.get('reference-summary')).find(element => element.tagName === 'img').src, target.avatar_thumbnail);
  assert.match(elements.get('comparison-content').textContent, /Matching equipped assets/);
  assert.match(elements.get('comparison-content').textContent, /Shared friends: unknown/);
  assert.match(elements.get('comparison-content').textContent, /ID 500/);
  assert.equal(elements.get('social-coverage').textContent, 'Unavailable');
  assert.equal(elements.get('social-graph').children.length, 0);
  assert.match(elements.get('candidate-list').textContent, /Social links unknown/);
  assert.equal(new URL(location.href).searchParams.get('target'), '12013950464');
  const links = descendants(elements.get('comparison-content')).filter(element => element.tagName === 'a');
  assert.ok(links.some(link => link.href === 'https://www.roblox.com/catalog/500'));
  const dates = descendants(elements.get('comparison-content')).filter(element => element.tagName === 'time');
  assert.ok(dates.length > 0);
  assert.ok(dates.every(element => element.title.includes(CHECKED)));
});

test('missing target deep links show a clear empty state without substituting or rewriting the target', async () => {
  const target = account('12013950464', {username: 'Lunary810', ledger: false});
  const {elements, location} = await renderSnapshot([target, account('2', {latest_rank: 1})], '?target=999&compare=2');
  assert.match(elements.get('network-status').textContent, /ID 999 is not in this snapshot/);
  assert.match(elements.get('candidate-list').textContent, /No comparison has been calculated/);
  assert.doesNotMatch(elements.get('reference-summary').textContent, /Lunary810/);
  assert.equal(elements.get('share-comparison').disabled, true);
  assert.equal(new URL(location.href).searchParams.get('target'), '999');
  elements.get('target-input').value = 'Lunary810';
  elements.get('target-form').listeners.submit[0]({preventDefault() {}});
  assert.match(elements.get('reference-summary').textContent, /Lunary810/);
  assert.equal(elements.get('network-status').hidden, true);
  assert.equal(new URL(location.href).searchParams.get('target'), '12013950464');
});

test('query comparison can select historical accounts and malformed data stays inert text', async () => {
  const target = account('1', {username: 'Reference', avatar: avatar([{...asset('500'), name: '<img src=x onerror=alert(1)>'}])});
  const candidate = account('2', {username: '<script>bad</script>', headshot: 'javascript:alert(1)', avatar: avatar([asset('500')])});
  const {elements, location} = await renderSnapshot([target, candidate, account('3', {latest_rank: 1})], '?target=1&compare=2');
  assert.equal(elements.get('networker-app').hidden, false);
  assert.equal(elements.get('candidate-scope').value, 'all');
  assert.equal(new URL(location.href).searchParams.get('compare'), '2');
  assert.match(elements.get('comparison-content').textContent, /<script>bad<\/script>/);
  assert.match(elements.get('comparison-content').textContent, /<img src=x onerror=alert\(1\)>/);
  const nodes = descendants(elements.get('comparison-content'));
  assert.equal(nodes.some(element => element.tagName === 'script'), false);
  assert.equal(nodes.some(element => element.tagName === 'img' && element.src === 'javascript:alert(1)'), false);
});

test('committed public snapshot renders real cached accounts and the expected latest-board candidate scope', async () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../site/network-data.json'), 'utf8'));
  const {elements} = await renderSnapshot(snapshot.accounts, '', snapshot);
  assert.equal(elements.get('networker-app').hidden, false, elements.get('network-status').textContent);
  assert.equal(elements.get('network-status').hidden, true);
  assert.equal(elements.get('cache-coverage').textContent, `${snapshot.accounts.length} accounts · ${snapshot.accounts.filter(item => item.avatar?.status === 'ok').length} readable avatars`);
  const reference = snapshot.accounts.find(item => item.id === '12013950464') || snapshot.accounts[0];
  assert.match(elements.get('reference-summary').textContent, new RegExp(reference.id));
  const expected = network.candidates(snapshot.accounts, reference);
  assert.equal(elements.get('candidate-count').textContent, `${expected.length} / ${expected.length}`);
  assert.ok(expected.length > 0);
  assert.ok(expected.every(item => item.account.id !== reference.id));
  assert.ok(expected.every(item => item.account.latest_rank >= 1 && item.account.latest_rank <= 50));
  assert.match(elements.get('comparison-content').textContent, /Cosmetic asset overlap/);
});

test('RBI rules preserve all 22 audited release sets, three categories, and exact provenance', () => {
  const {createHash} = require('node:crypto');
  const rules = network.RBI_AVATAR_RULES;
  assert.equal(rules.presets.length, 22);
  assert.deepEqual(Object.fromEntries(['defaultcombos', 'xboxcombos', 'freeoutfitcombos'].map(category => [category, rules.presets.filter(preset => preset.category === category).length])), {defaultcombos: 3, xboxcombos: 6, freeoutfitcombos: 13});
  assert.equal(rules.commit, '3b3f4e40a9ce3a258f3dac6584add47959a9a980');
  assert.equal(rules.sourceUrl, `https://github.com/nitwi/Roblox-Bot-Investigator/blob/${rules.commit}/RBI_Bot.py`);
  const canonical = rules.presets.map(preset => ({id: preset.id, category: preset.category, assetIds: [...preset.assetIds].sort()})).sort((a, b) => a.id.localeCompare(b.id));
  const digest = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  assert.equal(digest, 'abb730a1bdaeb82b31bee699ed81cf27ebb93469908a93d1741e93d3b7f3de87');
});

test('every audited preset uses full containment with extras; duplicate equipped IDs do not inflate matches', () => {
  for (const preset of network.RBI_AVATAR_RULES.presets) {
    const equipped = [...preset.assetIds, preset.assetIds[0], '999999999'].map(id => asset(id));
    const review = network.reviewAvatar(avatar(equipped));
    const matched = review.presets.find(item => item.id === preset.id);
    assert.equal(matched.status, 'full', preset.id);
    assert.equal(matched.matchedCount, preset.assetIds.length, preset.id);
    assert.equal(matched.requiredCount, preset.assetIds.length, preset.id);
    assert.deepEqual(matched.missingIds, [], preset.id);
  }
});

test('preset sizes remain generic: GreenBean is full at 1/1, while Summer and Oliver share independent partials', () => {
  const green = network.reviewAvatar(avatar([asset('617605556')]));
  assert.equal(green.status, 'full');
  assert.equal(green.fullMatches[0].id, 'greenbean');
  assert.equal(green.fullMatches[0].requiredCount, 1);
  assert.equal(green.partialMatches.length, 0);
  const partial = network.reviewAvatar(avatar([asset('3670737444'), asset('3670737444')]));
  assert.equal(partial.status, 'partial');
  assert.equal(partial.matchedAssetCount, 1);
  assert.deepEqual(partial.partialMatches.map(item => [item.id, item.matchedCount, item.requiredCount]), [['oliver', 1, 8], ['summer', 1, 2]]);
  assert.equal(partial.partialMatches[0].missingIds.length, 7);
  assert.equal(partial.partialMatches[1].missingIds.length, 1);
  const synthetic = network.reviewAvatar(avatar([asset('1')]), [{id: 'empty', assetIds: []}, {id: 'invalid', assetIds: ['javascript:bad']}, {id: 'duplicate', name: 'Duplicate', assetIds: ['01', '1', '2']}]);
  assert.equal(synthetic.presets.length, 1);
  assert.equal(synthetic.presets[0].requiredCount, 2);
  assert.equal(synthetic.presets[0].matchedCount, 1);
  assert.equal(synthetic.status, 'partial');
});

test('readable empty avatars have no preset overlap; unavailable and malformed records remain unknown', () => {
  assert.equal(network.reviewAvatar(avatar([])).status, 'none');
  assert.equal(network.reviewAvatar(avatar([asset('999999999')])).status, 'none');
  for (const value of [null, {}, {status: 'ok'}, {status: 'unavailable', assets: [asset('617605556')]}]) {
    const review = network.reviewAvatar(value);
    assert.equal(review.available, false);
    assert.equal(review.status, 'unknown');
    assert.equal(review.matchedAssetCount, null);
  }
  const target = account('1', {username: 'same', display_name: 'same', friends: list('unavailable')});
  const candidate = account('2', {username: 'same', display_name: 'same', avatar: avatar([asset('617605556')])});
  assert.equal(network.compareAccounts(target, candidate).review.status, 'full');
  candidate.username = 'completelydifferent'; candidate.friends = list('complete', ['1']);
  assert.equal(network.compareAccounts(target, candidate).review.status, 'full');
});

test('avatar review queue filters exact states and orders full matches before partial overlap without a probability score', () => {
  const target = account('1', {latest_rank: 1});
  const full = account('2', {latest_rank: 2, avatar: avatar([asset('617605556')])});
  const partialTwo = account('3', {latest_rank: 3, avatar: avatar([asset('144076760'), asset('63690008')])});
  const partialOne = account('4', {latest_rank: 4, avatar: avatar([asset('63690008')])});
  const none = account('5', {latest_rank: 5});
  const unknown = account('6', {latest_rank: 6, avatar: {status: 'unavailable'}});
  const accounts = [unknown, none, partialOne, target, full, partialTwo];
  assert.deepEqual(network.candidates(accounts, target, 'latest', 'review').map(item => item.account.id), ['2', '3', '4', '5', '6']);
  for (const [filter, ids] of [['full', ['2']], ['partial', ['3', '4']], ['none', ['5']], ['unknown', ['6']]]) {
    assert.deepEqual(network.candidates(accounts, target, 'latest', 'review', filter).map(item => item.account.id), ids);
  }
});

test('review UI exposes the complete library, present/missing IDs, filter controls and independent comparison metrics', async () => {
  const target = account('1', {username: 'Reference', avatar: avatar([asset('63690008')])});
  const full = account('2', {username: 'FullPreset', latest_rank: 1, avatar: avatar([asset('617605556')])});
  const partial = account('3', {username: 'PartialPreset', latest_rank: 2, avatar: avatar([asset('3670737444')])});
  const {elements, location} = await renderSnapshot([target, full, partial], '?target=1');
  assert.equal(elements.get('networker-app').hidden, false, elements.get('network-status').textContent);
  assert.equal(elements.get('candidate-sort').value, 'review');
  assert.equal(elements.get('review-rule-count').textContent, '22 verified presets');
  assert.match(elements.get('review-presets').textContent, /Default outfits · 3/);
  assert.match(elements.get('review-presets').textContent, /Xbox outfits · 6/);
  assert.match(elements.get('review-presets').textContent, /Other outfit presets · 13/);
  assert.match(elements.get('comparison-content').textContent, /Full GreenBean preset \(1\/1\)/);
  assert.match(elements.get('comparison-content').textContent, /Missing/);
  assert.match(elements.get('comparison-content').textContent, /ID 144076760/);
  assert.match(elements.get('comparison-content').textContent, /Cosmetic asset overlap/);
  assert.match(elements.get('comparison-content').textContent, /Username text similarity/);
  elements.get('candidate-review-filter').listeners.change[0]({target: {value: 'partial'}});
  assert.equal(elements.get('candidate-count').textContent, '1 / 2');
  assert.match(elements.get('candidate-list').textContent, /Partial Oliver \(1\/8\)/);
  assert.doesNotMatch(elements.get('candidate-list').textContent, /FullPreset/);
  assert.equal(new URL(location.href).searchParams.get('review'), 'partial');
  assert.equal(new URL(location.href).searchParams.get('compare'), '3');
});

test('published avatar observations reproduce independently audited all-history and latest-board review counts', t => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../site/network-data.json'), 'utf8'));
  // Lock the verified result only for this evidence snapshot; later refreshes legitimately change outfits.
  if (snapshot.generated_at !== '2026-11-24T08:41:51Z') return t.skip('Avatar snapshot was refreshed; historical count fixture no longer applies.');
  const summarize = accounts => accounts.reduce((counts, item) => {
    counts[network.reviewAvatar(item.avatar).status] += 1; return counts;
  }, {full: 0, partial: 0, none: 0, unknown: 0});
  assert.deepEqual(summarize(snapshot.accounts), {full: 1, partial: 6, none: 63, unknown: 0});
  const latest = snapshot.accounts.filter(item => item.ledger && item.latest_rank >= 1 && item.latest_rank <= 50);
  assert.deepEqual(summarize(latest), {full: 1, partial: 3, none: 46, unknown: 0});
  const full = snapshot.accounts.find(item => network.reviewAvatar(item.avatar).status === 'full');
  assert.equal(full.username, 'BloxHeroj8');
  assert.equal(network.reviewAvatar(full.avatar).fullMatches[0].id, 'beanie');
});

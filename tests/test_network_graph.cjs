'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const graph = require('../site/network-graph.js');
const core = require('../site/networker-core.js');

const CHECKED = '2026-11-24T10:20:30.000Z';
const avatar = ids => ({status: 'ok', assets: ids.map(id => ({id})), fetched_at: CHECKED,
  source_url: 'https://avatar.roblox.com/v1/users/1/avatar'});
const full = () => avatar(core.RBI_AVATAR_RULES.presets[0].assetIds);
const partial = () => avatar(core.RBI_AVATAR_RULES.presets[0].assetIds.slice(0, 1));
const evidence = () => [{method: 'roblox_website', source_label: 'Roblox website observation',
  source_url: 'https://www.roblox.com/users/1/friends#!/friends', observed_at: CHECKED}];
const edge = (from, to, kind = 'friend') => ({kind, from: String(from), to: String(to), evidence: evidence()});
const account = (id, extra = {}) => ({id: String(id), username: `player${id}`, ledger: true, ...extra});
function makeNetwork(nodes, edges) { return {nodes: new Map(nodes.map(node => [node.id, node])), edges}; }
function build(nodes, edges, extra = {}) { return graph.buildBranches({core, network: makeNetwork(nodes, edges), focusId: '1', ...extra}); }
const ids = model => model.nodes.map(node => node.id);

test('eligibility distinguishes historical ledger, full presets, partial presets and unchecked avatars', () => {
  assert.equal(graph.eligibility(account(1), core).eligible, true);
  assert.equal(graph.eligibility(account(1), core).label, 'Leaderboard history');
  assert.equal(graph.eligibility(account(1, {latest_rank: 4}), core).label, 'Leaderboard #4');
  const external = account(2, {ledger: false, avatar: full()});
  assert.equal(graph.eligibility(external, core).category, 'full');
  assert.equal(graph.eligibility(external, core).eligible, true);
  const incomplete = account(3, {ledger: false, avatar: partial()});
  assert.equal(graph.eligibility(incomplete, core).category, 'partial');
  assert.equal(graph.eligibility(incomplete, core).eligible, false);
  assert.equal(graph.eligibility(incomplete, core, true).eligible, false);
  for (const value of [undefined, {status: 'unavailable', assets: full().assets}]) {
    const unchecked = graph.eligibility(account(4, {ledger: false, avatar: value}), core, true);
    assert.equal(unchecked.category, 'unknown'); assert.equal(unchecked.eligible, false);
  }
  assert.equal(graph.eligibility(account(5, {ledger: false, avatar: avatar([])}), core).category, 'none');
});

test('branches use observed connections, and do not connect matching names or matching avatars by themselves', () => {
  const nodes = [account(1, {avatar: full()}), account(2), account(3, {ledger: false, avatar: full()}),
    account(4, {ledger: false}), account(5, {ledger: false, avatar: partial()}), account(6, {ledger: false, avatar: avatar([])}),
    account(7, {username: 'player1', avatar: full()})];
  const edges = [edge(1, 2), edge(1, 3), edge(1, 4), edge(1, 5), edge(1, 6)];
  const model = build(nodes, edges);
  assert.deepEqual(ids(model), ['1', '2', '3']);
  assert.deepEqual(model.hidden, {unchecked: 1, partial: 1, noMatch: 1});
  assert.equal(model.directStats.total, 5); assert.equal(model.directStats.eligible, 2);
  assert.deepEqual(ids(build(nodes, edges, {includePartial: true})), ['1', '2', '3']);
  assert.deepEqual(ids(build(nodes, [])), ['1']);
});

test('shared external connector appears only from two distinct observed ledger edges', () => {
  const nodes = [account(1), account(2), account(3), account(4, {ledger:false, avatar:{status:'unavailable'}}),
    account(5, {ledger:false}), account(6, {ledger:false})];
  const edges = [edge(1,4), edge(2,4), edge(1,5), edge(1,6),
    {kind:'name', from:'1',to:'5',evidence:evidence()}];
  const basic = build(nodes, edges);
  assert.deepEqual(ids(basic), ['1']);
  const graph = build(nodes, edges, {includeConnectors:true});
  assert.equal(graph.eligibility.get('4').category, 'connector');
  assert.equal(graph.eligibility.get('4').ledgerConnections, 2);
  assert.equal(graph.eligibility.get('5').eligible, false);
  assert.deepEqual(ids(graph), ['1','4']);
  const expanded = build(nodes, edges, {includeConnectors:true,expandedIds:['4']});
  assert.equal(expanded.nodes.some(node => node.id === '2'),true);
  assert.equal(expanded.edges.length,2);
  const external = build(nodes,edges,{includeExternal:true});
  assert.equal(external.nodes.length,4);
  assert.equal(external.eligibility.get('5').category,'external');
});

test('every one of the 22 verified RBI presets can qualify a connected external account', () => {
  const nodes = [account(1), ...core.RBI_AVATAR_RULES.presets.map((preset, index) => account(index + 2, {ledger: false, avatar: avatar(preset.assetIds)}))];
  const model = build(nodes, nodes.slice(1).map(node => edge(1, node.id)));
  assert.equal(model.nodes.length, 23);
  for (const node of model.nodes.slice(1)) assert.equal(model.eligibility.get(node.id).category, 'full');
});

test('an unqualified main account is retained and all eligible direct neighbors open initially', () => {
  const model = build([account(1, {ledger: false}), ...Array.from({length: 25}, (_, i) => account(i + 2))],
    Array.from({length: 25}, (_, i) => edge(1, i + 2)));
  assert.equal(model.nodes.length, 26); assert.equal(model.eligibility.get('1').eligible, false);
  assert.equal(model.focusId, '1'); assert.equal(model.parents.size, 25);
});

test('positive counterpart observations remain visible even when main account has no readable lists', () => {
  const a = account(1, {friends: {status: 'unavailable', items: []}});
  const b = account(2, {friends: {status: 'partial', items: [{id: '1'}], fetched_at: CHECKED}});
  const model = graph.buildBranches({core, accounts: [a, b], network: core.socialNetwork([a, b]), focusId: '1'});
  assert.deepEqual(ids(model), ['1', '2']); assert.equal(model.edges.length, 1);
  assert.equal(model.edges[0].evidence[0].ownerId, '2');
});

test('same-root expansion reveals connected eligible descendants, collapse removes only unreachable branches', () => {
  const nodes = Array.from({length: 6}, (_, i) => account(i + 1));
  const edges = [edge(1, 2), edge(2, 3), edge(3, 4), edge(1, 5), edge(5, 3), edge(3, 6)];
  assert.deepEqual(ids(build(nodes, edges)), ['1', '2', '5']);
  assert.deepEqual(new Set(ids(build(nodes, edges, {expandedIds: ['2']}))), new Set(['1', '2', '5', '3']));
  const expanded = build(nodes, edges, {expandedIds: ['2', '3']});
  assert.equal(expanded.nodes.length, 6); assert.equal(expanded.focusId, '1');
  assert.equal(expanded.edges.length, 6, 'cross-links between visible nodes are preserved');
  assert.deepEqual(ids(build(nodes, edges, {expandedIds: ['3']})), ['1', '2', '5'], 'disconnected expansion does not introduce nodes');
  assert.equal(build(nodes, edges, {expandedIds: ['5', '3']}).nodes.length, 6, 'second expanded path keeps shared branch reachable');
});

test('followers retain arrow direction and deduplicated friendship edges retain provenance', () => {
  const sourceEdges = [edge(2, 1, 'follow'), edge(1, 2, 'follow'), edge(1, 2), edge(2, 1),
    {kind: 'avatar', from: '1', to: '3', evidence: evidence()}, {kind: 'friend', from: '1', to: '3', evidence: []}];
  const model = build([account(1), account(2), account(3)], sourceEdges);
  assert.deepEqual(ids(model), ['1', '2']); assert.equal(model.edges.length, 3);
  assert.ok(model.edges.some(value => value.kind === 'follow' && value.from === '2' && value.to === '1'));
  assert.ok(model.edges.some(value => value.kind === 'follow' && value.from === '1' && value.to === '2'));
  assert.equal(model.edges.find(value => value.kind === 'friend').evidence.length, 2);
});

test('malformed IDs, self-links and missing endpoint metadata cannot become branch nodes', () => {
  const nodes = [account(1), account(2), account('javascript:alert(1)')];
  const model = build(nodes, [edge(1, 1), edge(1, 9), edge(1, 'javascript:alert(1)'), edge(1, 2)], {focusId: '001'});
  assert.deepEqual(ids(model), ['1', '2']);
  const missing = build(nodes, [edge(1, 2)], {focusId: '999'});
  assert.equal(missing.root, null); assert.deepEqual(missing.nodes, []); assert.equal(graph.layout(missing).size, 0);
});

test('accounts supplement network metadata without losing an external node avatar observation', () => {
  const nodes = [account(1), account(2, {ledger: false, avatar: full()}), account(3, {ledger: false, avatar: full()})];
  const model = build(nodes, [edge(1, 2), edge(1, 3)], {accounts: [account(2, {ledger: true, latest_rank: 7})]});
  assert.equal(model.nodesById.get('2').avatar.status, 'ok');
  assert.equal(model.eligibility.get('2').label, 'Leaderboard #7');
  assert.equal(model.eligibility.get('3').category, 'full');
});

test('visible nodes are bounded with honest eligible omission counts, never an arbitrary twelve-node cap', () => {
  const nodes = Array.from({length: 160}, (_, i) => account(i + 1));
  const edges = nodes.slice(1).map(node => edge(1, node.id));
  const bounded = build(nodes, edges);
  assert.equal(bounded.nodes.length, 120); assert.equal(bounded.omittedEligibleIds.length, 40);
  assert.equal(bounded.directStats.eligible, 159); assert.equal(bounded.edges.length, 119);
  assert.equal(build(nodes, edges, {maxNodes: 8}).nodes.length, 8);
  assert.equal(build(nodes, edges, {maxNodes: Infinity}).nodes.length, 120);
});

test('hidden counts deduplicate unchecked neighbors shared by multiple open branches', () => {
  const nodes = [account(1), account(2), account(3, {ledger: false})];
  const model = build(nodes, [edge(1, 2), edge(1, 3), edge(2, 3)], {expandedIds: ['2']});
  assert.equal(model.hidden.unchecked, 1); assert.equal(graph.neighborStats('2', model).unchecked, 1);
});

test('tree layout holds the main account fixed and produces distinct coordinates for each visible node', () => {
  const model = build([account(1), account(2), account(3), account(4)], [edge(1, 2), edge(1, 3), edge(2, 4)], {expandedIds: ['2']});
  const positions = graph.layout(model);
  assert.deepEqual(positions.get('1'), {x: 0, y: 0});
  assert.equal(new Set([...positions.values()].map(p => `${p.x},${p.y}`)).size, 4);
  assert.ok(positions.get('4').x > positions.get('2').x);
  const arranged = graph.layout(model, new Map([['1', {x: 100, y: 100}], ['2', {x: 444, y: 125}]]));
  assert.deepEqual(arranged.get('1'), {x: 0, y: 0});
  assert.deepEqual(arranged.get('2'), {x: 444, y: 125});
});

test('fit and zoom preserve finite coordinates and zoom around the chosen canvas point', () => {
  const positions = graph.layout(build([account(1), account(2)], [edge(1, 2)]));
  const initial = graph.fitTransform(positions, 800, 500), anchor = {x: 211, y: 182};
  const next = graph.zoomTransform(initial, 1.25, anchor);
  assert.ok(next.scale > initial.scale);
  assert.ok(Math.abs((anchor.x - initial.x) / initial.scale - (anchor.x - next.x) / next.scale) < 1e-8);
  assert.ok(Math.abs((anchor.y - initial.y) / initial.scale - (anchor.y - next.y) / next.scale) < 1e-8);
  for (const value of Object.values(graph.fitTransform(new Map(), 0, 0))) assert.ok(Number.isFinite(value));
});

test('same-column cross-links bypass intervening cards and keep friend and reciprocal follow lanes distinct', () => {
  const positions = new Map([['1', {x: 0, y: 0}], ['2', {x: 306, y: -94}], ['3', {x: 306, y: 0}], ['4', {x: 306, y: 94}]]);
  const routes = [edge(2, 4), edge(2, 4, 'follow'), edge(4, 2, 'follow')].map(item => graph.edgeGeometry(item, positions));
  assert.equal(new Set(routes.map(route => route.path)).size, 3);
  for (const route of routes) {
    const coordinates = route.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
    for (let i = 0; i < coordinates.length; i += 2) assert.ok(coordinates[i] > 306 + 112, 'entire route is outside the right card edge');
    assert.ok(route.path.includes(' L ')); assert.ok(route.path.includes(' Q '), 'side lane has rounded bends');
  }
  const fit = graph.fitTransform(positions, 420, 320, routes.flatMap(route => route.points));
  for (const route of routes) for (const point of route.points) {
    assert.ok(point.x * fit.scale + fit.x >= 0 && point.x * fit.scale + fit.x <= 420, 'Fit includes route horizontal bounds');
    assert.ok(point.y * fit.scale + fit.y >= 0 && point.y * fit.scale + fit.y <= 320, 'Fit includes route vertical bounds');
  }
});

test('saved real snapshot excludes unchecked external accounts while preserving ledger connections', () => {
  const file = path.join(__dirname, '../site/network-data.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const network = core.socialNetwork(data.accounts, data.network_nodes);
  const main = graph.buildBranches({network, accounts: data.accounts, core, focusId: '1316700350'});
  assert.equal(main.directStats.eligible, 6);
  assert.deepEqual(new Set(main.nodes.slice(1).map(node => node.username)), new Set(['untoldmemoria', 'n6sy', 'Erutobi', 'Canizan', 'zerealali', 'NoRoblox_Support']));
  assert.equal(main.hidden.unchecked, main.directStats.total - 6);
  const reference = graph.buildBranches({network, accounts: data.accounts, core, focusId: '12013950464'});
  assert.equal(reference.nodes.length, 1); assert.equal(reference.hidden.unchecked, 1);
  assert.equal(reference.hidden.noMatch, 0);
});

// Small DOM fixture: exercises component actions and pointer state without a network/browser.
class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.parentNode = null;
    this.attributes = new Map(); this.listeners = new Map(); this._text = ''; this.className = '';
    this.classList = {toggle: (token, force) => {
      const values = new Set(this.className.split(/\s+/).filter(Boolean));
      const add = force === undefined ? !values.has(token) : force;
      if (add) values.add(token); else values.delete(token); this.className = [...values].join(' '); return add;
    }};
  }
  set textContent(value) { this._text = String(value); this.replaceChildren(); }
  get textContent() { return this._text + this.children.map(item => item.textContent).join(''); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); if (key === 'class') this.className = String(value); }
  getAttribute(key) { return key === 'class' ? this.className : this.attributes.get(key) ?? null; }
  append(...children) { for (const child of children) { child.remove(); this.children.push(child); child.parentNode = this; } }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(item => item !== this); this.parentNode = null; } }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  getBoundingClientRect() { return {left: 0, top: 0, width: 900, height: 500}; }
  setPointerCapture() {}
  releasePointerCapture() {}
  dispatch(type, props = {}) {
    const event = {type, target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...props};
    for (const callback of this.listeners.get(type) || []) callback(event);
    return event;
  }
  click() { if (!this.disabled) this.dispatch('click'); }
}
function descendants(root) { return [root, ...root.children.flatMap(descendants)]; }
function fixture(extra = {}) {
  const observers = [];
  const doc = {defaultView: {ResizeObserver: class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {} disconnect() { this.disconnected = true; }
  }}};
  doc.createElement = tag => new Element(tag, doc); doc.createElementNS = (_, tag) => new Element(tag, doc);
  const container = new Element('div', doc);
  const nodes = [account(1), account(2), account(3), account(4, {ledger: false, avatar: partial()})];
  const network = makeNetwork(nodes, [edge(1, 2), edge(2, 3), edge(1, 4)]);
  const comparisons = [], references = [];
  const api = graph.mount(container, {network, accounts: nodes.slice(0, 3), focusId: '1', core,
    onCompare: id => comparisons.push(id), onReference: id => references.push(id), ...extra});
  const find = predicate => descendants(container).find(predicate);
  const node = id => find(item => item.getAttribute('data-node-id') === id);
  const button = starts => find(item => item.tagName === 'BUTTON' && item.textContent.startsWith(starts));
  const main = () => find(item => item.className === 'fng-main-name').textContent;
  return {api, container, nodes, network, observers, comparisons, references, find, node, button, main};
}

test('select, compare and expand leave the main account fixed; same-root update preserves expanded branches', () => {
  const f = fixture(); assert.equal(f.main(), '@player1'); assert.ok(f.node('2')); assert.equal(f.node('3'), undefined);
  f.node('2').click(); assert.equal(f.main(), '@player1');
  f.button('Compare with main').click(); assert.deepEqual(f.comparisons, ['2']); assert.equal(f.main(), '@player1');
  f.button('Expand saved').click(); assert.ok(f.node('3')); assert.equal(f.main(), '@player1');
  f.api.update({focusId: '1'}); assert.ok(f.node('3')); assert.equal(f.node('2').getAttribute('aria-pressed'), 'true');
  f.button('Collapse this branch').click(); assert.equal(f.node('3'), undefined);
  f.button('Use as main account').click(); assert.equal(f.main(), '@player2'); assert.deepEqual(f.references, ['2']);
  f.api.destroy();
});

test('a partial-only neighbor is ineligible, and selection has a keyboard alternative', () => {
  const f = fixture(); assert.equal(f.node('4'), undefined);
  assert.equal(f.find(item => item.tagName === 'INPUT'), undefined);
  f.node('2').dispatch('keydown', {key: 'Enter'});
  assert.equal(f.node('2').getAttribute('aria-pressed'), 'true'); assert.equal(f.main(), '@player1');
  const picker = f.find(item => item.tagName === 'SELECT'); picker.value = '2'; picker.dispatch('change');
  assert.equal(f.node('2').getAttribute('aria-pressed'), 'true');
  f.api.destroy();
});

test('node dragging is retained across same-root updates, while dragging the main account cannot move it', () => {
  const f = fixture(), svg = f.find(item => item.tagName === 'SVG');
  const originalMain = f.node('1').getAttribute('transform'), originalChild = f.node('2').getAttribute('transform');
  svg.dispatch('pointerdown', {pointerId: 1, clientX: 100, clientY: 100, target: f.node('2')});
  svg.dispatch('pointermove', {pointerId: 1, clientX: 150, clientY: 120});
  svg.dispatch('pointerup', {pointerId: 1, clientX: 150, clientY: 120});
  const dragged = f.node('2').getAttribute('transform'); assert.notEqual(dragged, originalChild);
  f.api.update({focusId: '1'}); assert.equal(f.node('2').getAttribute('transform'), dragged);
  svg.dispatch('pointerdown', {pointerId: 2, clientX: 100, clientY: 100, target: f.node('1')});
  svg.dispatch('pointermove', {pointerId: 2, clientX: 200, clientY: 300});
  svg.dispatch('pointerup', {pointerId: 2, clientX: 200, clientY: 300});
  assert.equal(f.node('1').getAttribute('transform'), originalMain);
  f.api.destroy();
});

test('touch pinch zooms the viewport and can continue panning after a finger lifts without moving nodes', () => {
  const f = fixture(), svg = f.find(item => item.tagName === 'SVG');
  const world = svg.children.find(item => item.tagName === 'G'), initial = world.getAttribute('transform');
  const mainPosition = f.node('1').getAttribute('transform');
  svg.dispatch('pointerdown', {pointerId: 1, clientX: 100, clientY: 100});
  svg.dispatch('pointerdown', {pointerId: 2, clientX: 200, clientY: 100});
  svg.dispatch('pointermove', {pointerId: 2, clientX: 300, clientY: 100});
  const pinched = world.getAttribute('transform'); assert.notEqual(pinched, initial);
  svg.dispatch('pointerup', {pointerId: 2, clientX: 300, clientY: 100});
  svg.dispatch('pointermove', {pointerId: 1, clientX: 120, clientY: 140});
  assert.notEqual(world.getAttribute('transform'), pinched);
  svg.dispatch('pointercancel', {pointerId: 1}); assert.equal(f.node('1').getAttribute('transform'), mainPosition);
  f.api.destroy();
});

test('ordinary wheel preserves page scrolling, Ctrl + wheel zooms, and Fit restores a bounded view', () => {
  const f = fixture(), svg = f.find(item => item.tagName === 'SVG');
  const world = svg.children.find(item => item.tagName === 'G'), initial = world.getAttribute('transform');
  assert.equal(svg.dispatch('wheel', {deltaY: 100}).defaultPrevented, undefined);
  assert.equal(world.getAttribute('transform'), initial);
  assert.equal(svg.dispatch('wheel', {ctrlKey: true, deltaY: -50, clientX: 100, clientY: 100}).defaultPrevented, true);
  assert.notEqual(world.getAttribute('transform'), initial);
  f.button('Fit').click(); assert.equal(world.getAttribute('transform'), initial);
  f.api.destroy();
});

test('inspector shows exact ID, honest coverage and source timestamps; untrusted links never become links', () => {
  const nodes = [account(1), account(2, {username: '<img src=x>', friends: {status: 'partial', items: [{id: '1'}], fetched_at: CHECKED, source_url: 'javascript:alert(1)'}})];
  const source = edge(1, 2); source.evidence.push({source_url: 'javascript:alert(1)', observed_at: CHECKED, source_label: '<script>alert(1)</script>'});
  const f = fixture({network: makeNetwork(nodes, [source]), accounts: nodes});
  f.node('2').click();
  const inspector = f.find(item => item.tagName === 'ASIDE');
  assert.ok(inspector.textContent.includes('Roblox ID2'));
  assert.ok(inspector.textContent.includes('1 saved · partial'));
  assert.ok(inspector.textContent.includes('No readable list saved'));
  assert.ok(inspector.textContent.includes('<img src=x>'));
  assert.equal(descendants(f.container).some(item => item.tagName === 'IMG' || item.tagName === 'SCRIPT'), false);
  assert.equal(descendants(f.container).some(item => item.href?.startsWith('javascript:')), false);
  assert.ok(descendants(inspector).some(item => item.tagName === 'TIME' && item.title === CHECKED));
  f.api.destroy();
});

test('update to a different main resets expansions, while destroy disconnects observation and event listeners', () => {
  const f = fixture(), svg = f.find(item => item.tagName === 'SVG');
  f.node('2').click(); f.button('Expand saved').click(); assert.ok(f.node('3'));
  f.api.update({focusId: '3'}); assert.equal(f.main(), '@player3'); assert.ok(f.node('2')); assert.equal(f.node('1'), undefined);
  assert.equal(f.node('3').getAttribute('aria-pressed'), 'true');
  f.api.destroy(); assert.equal(f.container.children.length, 0);
  assert.ok(f.observers.every(observer => observer.disconnected));
  assert.equal([...svg.listeners.values()].reduce((total, set) => total + set.size, 0), 0);
  f.api.update({focusId: '1'}); assert.equal(f.container.children.length, 0); f.api.destroy();
});

test('parallel friendship and reciprocal follows render three separate curves with correct arrow counts', () => {
  const f = fixture({network: makeNetwork([account(1), account(2)], [edge(1, 2), edge(1, 2, 'follow'), edge(2, 1, 'follow')])});
  const edges = descendants(f.container).filter(item => item.tagName === 'PATH' && item.className.includes('fng-edge'));
  assert.equal(edges.length, 3); assert.equal(new Set(edges.map(item => item.getAttribute('d'))).size, 3);
  assert.equal(edges.filter(item => item.getAttribute('marker-end')).length, 2);
  f.api.destroy();
});

test('expansion counts only eligible neighbors that are not already visible', () => {
  const f = fixture(); f.node('2').click();
  assert.equal(f.button('Expand saved').textContent, 'Expand saved neighbors (1)');
  f.button('Expand saved').click(); f.node('3').click();
  assert.equal(f.button('Expand saved').textContent, 'Expand saved neighbors (0)');
  assert.equal(f.button('Expand saved').disabled, true);
  f.api.destroy();
});

test('explained username patterns appear only as inspector clues and cannot introduce a branch', () => {
  const nodes = [account(1), account(2), account(3)];
  const calls = [];
  const f = fixture({accounts: nodes, network: makeNetwork(nodes, [edge(1, 2)]), usernamePatterns: {
    compare(a, b) { calls.push([a, b]); return {available: true, tier: 'strong', label: 'Strong name pattern', reasons: ['Same distinctive stem with different numeric suffixes.']}; }
  }});
  assert.equal(f.node('3'), undefined); f.node('2').click();
  const inspector = f.find(item => item.tagName === 'ASIDE');
  assert.ok(inspector.textContent.includes('USERNAME PATTERN WITH MAIN'));
  assert.ok(inspector.textContent.includes('Same distinctive stem with different numeric suffixes.'));
  assert.deepEqual(calls.at(-1), ['player1', 'player2']);
  assert.equal(f.node('3'), undefined); assert.equal(f.main(), '@player1');
  f.api.update({usernamePatterns: {compare() { return {available: true, tier: 'none', reasons: []}; }}});
  assert.ok(!inspector.textContent.includes('USERNAME PATTERN WITH MAIN'));
  f.api.destroy();
});

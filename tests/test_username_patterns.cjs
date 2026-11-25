'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const patterns = require('../site/username-patterns.js');

const has = (result, code) => result.signals.some(signal => signal.code === code);

test('browser global and CommonJS expose the same standalone API', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../site/username-patterns.js'), 'utf8'), context);
  assert.equal(typeof context.FischUsernamePatterns.compare, 'function');
  assert.equal(context.FischUsernamePatterns.VERSION, patterns.VERSION);
  assert.equal(context.FischUsernamePatterns.compare('Lunary810', 'Lunary811').tier, 'strong');
});

test('scores and reasons describe rules rather than identity probabilities', () => {
  const result = patterns.compare('Lunary810', 'Lunary811');
  assert.equal(result.available, true);
  assert.equal(result.tier, 'strong');
  assert.equal(result.rank, 2);
  assert.ok(Number.isFinite(result.score));
  assert.ok(has(result, 'numbered_variant'));
  assert.match(result.reasons.join(' '), /lunary/);
  assert.match(result.method, /not probabilities/);
  assert.equal(result.normalized.left.original, 'Lunary810');
  assert.equal(result.normalized.left.stem, 'lunary');
  assert.equal('sameOwner' in result, false);
  assert.equal('edges' in result, false);
});

test('exact names ignore a leading @ and casing without merging identities', () => {
  const result = patterns.compare(' @Lunary810 ', 'lunary810');
  assert.ok(has(result, 'exact_name'));
  assert.match(result.reasons[0], /account IDs still determine identity/);
});

test('repeated underscores and case changes form a formatting pattern', () => {
  const result = patterns.compare('Cerulean__Flare2', 'cerulean_flare2');
  assert.equal(result.tier, 'strong');
  assert.ok(has(result, 'separator_variant'));
  assert.equal(result.normalized.left.compact, 'ceruleanflare2');
});

test('numeric prefixes, suffixes and versions preserve a distinctive whole stem', () => {
  for (const [left, right] of [
    ['Nexvolt00', 'Nexvolt12'], ['1234mysterio', 'mysterio56'],
    ['Lunary', 'Lunary_v2'], ['CeruleanFlarev2', 'CeruleanFlarev3'],
    ['BloxHeroj8', 'BloxHeroj9']
  ]) {
    const result = patterns.compare(left, right);
    assert.ok(has(result, 'numbered_variant'), `${left} / ${right}`);
    assert.equal(result.tier, 'strong');
  }
});

test('common names and account/game affixes do not supply series evidence', () => {
  for (const [left, right] of [
    ['Player123', 'Player124'], ['RobloxUser100', 'RobloxUser200'],
    ['FischGamer01', 'FischGamer02'], ['blox123', 'blox124'],
    ['King01', 'King02'], ['John01', 'John02'], ['xx1', 'xx2'],
    ['RobloxGamer_1', 'RobloxGamer_2'], ['Fish_1234', 'Fish_9876']
  ]) assert.equal(patterns.compare(left, right).tier, 'none', `${left} / ${right}`);
});

test('same digit suffix, digit count or shape alone has no name evidence', () => {
  for (const [left, right] of [
    ['ShadowFox123', 'CopperRaven123'], ['Lunary810', 'minkib766'],
    ['qz9x8v7b01', 'ab2m3k4t01'], ['123456', '123456'], ['123456', '123457']
  ]) assert.equal(patterns.compare(left, right).tier, 'none', `${left} / ${right}`);
});

test('generated replacement names never become a family, even when repeated', () => {
  for (const pair of [
    ['roblox_user_5080826450', 'roblox_user_1234567890'],
    ['roblox_user_5080826450', 'roblox_user_5080826450'],
    ['RobloxUser5080826450', 'RobloxUser1234567890']
  ]) {
    const result = patterns.compare(...pair);
    assert.equal(result.tier, 'none');
    assert.match(result.reasons.join(' '), /replacement usernames/);
  }
});

test('missing placeholders remain unknown, including repeated placeholders', () => {
  for (const value of ['', ' ', null, undefined, 123, 'Unavailable', 'unknown', 'Deleted', '__Unavailable__']) {
    const result = patterns.compare(value, value);
    assert.equal(result.tier, 'unknown', String(value));
    assert.equal(result.available, false);
    assert.equal(result.score, 0);
    assert.equal(result.rank, -1);
  }
});

test('Unicode lookalikes and display names are not folded into account identities', () => {
  for (const value of ['Lunаry810', 'Ｌｕｎａｒｙ810', 'Luna\u200bry810', 'Lunáry810', 'Lunary 810', '@@Lunary810', '<script>', 'a'.repeat(101)]) {
    assert.equal(patterns.compare(value, 'Lunary810').tier, 'unknown', value);
  }
});

test('common unambiguous digit substitutions preserve whole-name evidence', () => {
  for (const [left, right] of [['ShadowFox12', 'Shad0wF0x34'], ['CeruleanFlare', 'Cerul3anFlare'], ['CopperRaven', 'C0pperRaven']]) {
    const result = patterns.compare(left, right);
    assert.equal(result.tier, 'strong', `${left} / ${right}`);
    assert.ok(has(result, 'digit_substitution'));
    assert.ok(result.signals.find(signal => signal.code === 'digit_substitution').substitutions.length > 0);
  }
});

test('ambiguous 1 substitutions are possible patterns and explicitly qualified', () => {
  for (const [left, right] of [['SilverFox', 'S1lverFox'], ['SllverFox', 'S1lverFox'], ['S1lverFox12', 'SilverFox34']]) {
    const result = patterns.compare(left, right);
    assert.equal(result.tier, 'possible');
    assert.ok(has(result, 'digit_substitution'));
    assert.match(result.reasons.join(' '), /1 can represent i or l/);
  }
});

test('l and i are not automatically interchangeable and weak leet strings are suppressed', () => {
  for (const [left, right] of [['Lunary', 'Iunary'], ['Llllll', 'Iiiiii'], ['N0va12', 'Nova34'], ['qx0z3', 'qxoze'], ['Sh4d0wF0x', 'ShadowFox']]) {
    assert.equal(patterns.compare(left, right).tier, 'none', `${left} / ${right}`);
  }
});

test('recognized account prefixes/suffixes give an explained common-stem pattern', () => {
  for (const [left, right] of [['The_Lunary', 'Lunary'], ['OfficialShadowFox', 'ShadowFox_Alt'], ['ceruleanflarebackup', 'ceruleanflare'], ['xx_Nexvolt_yt', 'Nexvolt']]) {
    const result = patterns.compare(left, right);
    assert.equal(result.tier, 'strong', `${left} / ${right}`);
    assert.ok(has(result, 'affix_variant'));
    assert.match(result.reasons.join(' '), /account labels/);
  }
});

test('complete distinctive tokens can be recognized in a different order', () => {
  const result = patterns.compare('SilverDragon77', 'Dragon_Silver88');
  assert.equal(result.tier, 'strong');
  assert.ok(has(result, 'reordered_tokens'));
  assert.deepEqual(result.signals.find(signal => signal.code === 'reordered_tokens').tokens, ['dragon', 'silver']);
});

test('an observed complete stem with a recognized decoration can support a weak edge-letter hint', () => {
  const result = patterns.compare('xNnoel', 'Nnoelq');
  assert.equal(result.tier, 'possible');
  assert.ok(has(result, 'edge_decoration'));
  assert.match(result.reasons[0], /nnoel/);
  assert.equal(patterns.compare('Nnoel', 'Nnoelq').tier, 'none');
  assert.equal(patterns.compare('Force_oNature', 'ForcePush_Sith').tier, 'none');
});

test('a common game token and a short token are insufficient for reordering', () => {
  for (const pair of [['FischPro1', 'ProFisch2'], ['BlueFox12', 'FoxBlue34'], ['RobloxThePlayer', 'PlayerTheRoblox']]) {
    assert.equal(patterns.compare(...pair).tier, 'none', pair.join(' / '));
  }
});

test('one complete long token yields only a weak, explained pattern', () => {
  const result = patterns.compare('CeruleanFlare', 'CeruleanStone');
  assert.equal(result.tier, 'possible');
  assert.ok(has(result, 'shared_token'));
  assert.match(result.reasons.join(' '), /weak evidence/);
});

test('multiple complete tokens with different remaining parts are possible', () => {
  const result = patterns.compare('SilverDragonNorth', 'SilverDragonSouth');
  assert.equal(result.tier, 'possible');
  assert.ok(has(result, 'shared_tokens'));
});

test('embedded numeric series require the same whole name parts around clearly separated digits', () => {
  for (const [left, right] of [['Cerulean12Beacon', 'Cerulean34Beacon'], ['cerulean_12_beacon', 'cerulean_34_beacon']]) {
    const result = patterns.compare(left, right);
    assert.equal(result.tier, 'possible');
    assert.ok(has(result, 'embedded_number_variant'));
    assert.deepEqual(result.signals[0].tokens, ['cerulean', 'beacon']);
    assert.match(result.reasons[0], /different number between/);
    assert.deepEqual(result.signals, patterns.compare(right, left).signals);
  }
  for (const pair of [['Fisch12Gamer', 'Fisch34Gamer'], ['Cerulean12Beacon', 'Copper12Beacon'], ['Cerul3anflare', 'Cerul4anflare']]) {
    assert.equal(has(patterns.compare(...pair), 'embedded_number_variant'), false, pair.join(' / '));
  }
});

test('a distinctive prefix or suffix can pair a marked edge with a flattened name', () => {
  for (const [left, right, edge] of [['Cerulean_Flare', 'ceruleanstone', 'prefix'], ['Stone_Cerulean', 'flarecerulean', 'suffix']]) {
    const result = patterns.compare(left, right);
    assert.equal(result.tier, 'possible');
    assert.ok(has(result, 'shared_edge_stem'));
    assert.equal(result.signals[0].edge, edge);
    assert.match(result.reasons[0], new RegExp(`${edge}.*cerulean`));
    assert.deepEqual(result.signals, patterns.compare(right, left).signals);
  }
  for (const pair of [['Official_Flare', 'officialstone'], ['Princess_Flare', 'princessstone'], ['Princess_Flare', 'Princess_Stone'], ['CeruleanFlare', 'CeruleanizationFox'], ['RedFlare', 'redstone'], ['CeruleanStone', 'myceruleanflare']]) {
    assert.equal(patterns.compare(...pair).tier, 'none', pair.join(' / '));
  }
});

test('small repeated-letter changes have their own qualified pattern', () => {
  const result = patterns.compare('tatsukii12', 'tatsuki45');
  assert.equal(result.tier, 'possible');
  assert.ok(has(result, 'repeated_letter'));
  assert.match(result.reasons[0], /repeated letters/);
});

test('a repeated-letter match with a recognized label is explained and ranked lower', () => {
  const result = patterns.compare('Official_Tatsukii', 'Tatsuki_Alt');
  assert.equal(result.tier, 'possible');
  assert.ok(has(result, 'repeated_letter'));
  assert.deepEqual(result.signals, patterns.compare('Tatsuki_Alt', 'Official_Tatsukii').signals);
  assert.match(result.reasons[0], /repeated letters.*removing account labels/);
  assert.ok(result.score < patterns.compare('Tatsukii', 'Tatsuki').score);
  assert.equal(patterns.compare('Official_Playerrr', 'Player_Alt').tier, 'none');
});

test('arbitrary low edit distance and partial internal substrings are not patterns', () => {
  for (const [left, right] of [
    ['LightMage', 'NightMage'], ['n6sy', 'n6xy'], ['Ceruleanflare', 'Ceruleanflore'],
    ['abcdefg', 'abcxefg'], ['Lunary810', 'Lumary810'], ['knightmare', 'nightmare'],
    ['imliteralltcheating', 'imliterallycheating']
  ]) assert.equal(patterns.compare(left, right).tier, 'none', `${left} / ${right}`);
});

test('opaque and repetitive strings do not create numbered families', () => {
  for (const pair of [['YptSehjZiEs01', 'YptSehjZiEs02'], ['qzvwxtr01', 'qzvwxtr02'], ['hc2khunowpng43ntk1', 'hc2khunowpng43ntk2'], ['aaaaaa1', 'aaaaaa2'], ['zazaza1', 'zazaza2']]) {
    assert.equal(patterns.compare(...pair).tier, 'none', pair.join(' / '));
  }
});

test('scores are deterministic, symmetric and rank strong patterns above possible ones', () => {
  const names = ['Lunary810', 'Lunary811', 'Lunary', 'The_Lunary', 'SilverFox', 'S1lverFox', 'CeruleanFlare', 'CeruleanStone', 'Player1', 'Unavailable', '', 'roblox_user_12345', 'xNnoel', 'Nnoelq'];
  for (const a of names) for (const b of names) {
    const forward = patterns.compare(a, b), backward = patterns.compare(b, a);
    assert.deepEqual(patterns.compare(a, b), forward);
    assert.equal(forward.tier, backward.tier, `${a} / ${b}`);
    assert.equal(forward.rank, backward.rank);
    assert.equal(forward.score, backward.score);
    assert.deepEqual(forward.signals, backward.signals);
    assert.deepEqual(forward.reasons, backward.reasons);
  }
  const strong = patterns.compare('Lunary810', 'Lunary811');
  const possible = patterns.compare('CeruleanFlare', 'CeruleanStone');
  const none = patterns.compare('Player1', 'Player2');
  assert.ok(strong.rank > possible.rank && possible.rank > none.rank);
  assert.ok(strong.score > possible.score && possible.score > none.score);
});

test('metadata exposes normalization without mutating inputs or global state', () => {
  const result = patterns.compare('Nexvolt00', 'Nexvolt01');
  result.normalized.left.tokens.push('tampered');
  result.signals[0].detail = 'tampered';
  const next = patterns.compare('Nexvolt00', 'Nexvolt01');
  assert.equal(next.normalized.left.tokens.includes('tampered'), false);
  assert.notEqual(next.signals[0].detail, 'tampered');
  assert.deepEqual(patterns.analyze('Nexvolt00').numbers, ['00']);
});

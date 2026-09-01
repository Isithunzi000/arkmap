// Transports: schema validation, tuple normalization, per-line integrity
// (checksums.transports permutations) and routing-edge construction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../src/graph.js';
import {
  validateTransports, normalizeTransports, addTransportChecksums,
  verifyTransportChecksums, buildTransportEdges,
  TRANSPORT_BOARDING_PENALTY, TRANSPORT_TIME_RATIO, TRANSPORT_DEFAULT_TIME,
  TRANSPORTS_FORMAT, TRANSPORTS_VERSION,
} from '../src/transports.js';

function doc(lines) {
  return { format: 'arkmap-transports', version: 1, lines };
}
function lineDef(name, legs, over = {}) {
  return { name, board: ['wsiadz'], exit: 'zejdz', legs, ...over };
}
function mkMap(ids) {
  return { areas: [{ id: 1, name: 'A1',
    rooms: ids.map((id, i) => ({ id, x: i, y: 0, z: 0, exits: {} })) }] };
}

// --- validation ---

test('validate: good document passes', () => {
  const d = doc([lineDef('ferry', [{ from: 1, to: 2, time: 10, label: 'B' }])]);
  assert.deepEqual(validateTransports(d), { ok: true, errors: [] });
});

test('validate: rejects non-object, wrong format/version, missing lines', () => {
  assert.equal(validateTransports(null).ok, false);
  assert.equal(validateTransports([1, 2]).ok, false);
  const bad = validateTransports({ format: 'x', version: 2 });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => e.path === 'transports.format'));
  assert.ok(bad.errors.some(e => e.path === 'transports.version'));
  assert.ok(bad.errors.some(e => e.path === 'transports.lines'));
});

test('validate: line-level errors with exact paths', () => {
  const d = doc([
    { name: '', board: [], exit: '', legs: [] },                          // everything wrong
    lineDef('dup', [{ from: 1, to: 2 }]),
    lineDef('dup', [{ from: 2, to: 1 }]),                                 // duplicate name
    lineDef('badlegs', [{ from: 0, to: -1, time: -5, label: 7 }, null]),  // bad leg fields
  ]);
  const v = validateTransports(d);
  assert.equal(v.ok, false);
  const paths = v.errors.map(e => e.path);
  assert.ok(paths.includes('transports.lines[0].name'));
  assert.ok(paths.includes('transports.lines[0].board'));
  assert.ok(paths.includes('transports.lines[0].exit'));
  assert.ok(paths.includes('transports.lines[0].legs'));
  assert.ok(paths.includes('transports.lines[2].name'));   // duplicate
  assert.ok(paths.includes('transports.lines[3].legs[0].from'));
  assert.ok(paths.includes('transports.lines[3].legs[0].to'));
  assert.ok(paths.includes('transports.lines[3].legs[0].time'));
  assert.ok(paths.includes('transports.lines[3].legs[0].label'));
  assert.ok(paths.includes('transports.lines[3].legs[1]'));
});

test('validate: time/label null or omitted is fine', () => {
  const d = doc([lineDef('ferry', [{ from: 1, to: 2 }, { from: 2, to: 3, time: null, label: null }])]);
  assert.equal(validateTransports(d).ok, true);
});

// --- normalization (Arkadia community tuple format) ---

test('normalizeTransports: tuples -> standard doc', () => {
  const raw = [
    ['Ferry', ['wsiadz na prom', 'wejdz na prom'], 'zejdz', [[10, 20, 30, 'Przystan B'], [20, 10, 30, 'Przystan A']]],
    ['Coach', ['wsiadz'], 'wysiadz', [[5, 6]]],
  ];
  const d = normalizeTransports(raw);
  assert.equal(d.format, TRANSPORTS_FORMAT);
  assert.equal(d.version, TRANSPORTS_VERSION);
  assert.equal(d.lines.length, 2);
  assert.deepEqual(d.lines[0], {
    name: 'Ferry', board: ['wsiadz na prom', 'wejdz na prom'], exit: 'zejdz',
    legs: [{ from: 10, to: 20, time: 30, label: 'Przystan B' },
           { from: 20, to: 10, time: 30, label: 'Przystan A' }],
  });
  assert.deepEqual(d.lines[1].legs, [{ from: 5, to: 6 }]);   // no time/label keys
  assert.equal(validateTransports(d).ok, true);
});

test('normalizeTransports: empty/garbage input -> empty doc', () => {
  assert.deepEqual(normalizeTransports(null).lines, []);
  assert.deepEqual(normalizeTransports([]).lines, []);
  assert.equal(validateTransports(normalizeTransports(null)).ok, true);
});

// --- integrity permutations ---

const TWO = doc([
  lineDef('beta', [{ from: 1, to: 2, time: 10 }]),
  lineDef('alfa', [{ from: 3, to: 4, time: 20, label: 'X' }]),
]);

test('checksums: sign then verify -> ok, hashOk, no diffs', () => {
  const map = { ...mkMap([1, 2, 3, 4]), transports: TWO };
  addTransportChecksums(map);
  assert.ok(map.checksums.transports.hash);
  assert.deepEqual(Object.keys(map.checksums.transports.lines).sort(), ['alfa', 'beta']);
  const v = verifyTransportChecksums(map);
  assert.equal(v.present, true);
  assert.equal(v.ok, true);
  assert.equal(v.hashOk, true);
  assert.deepEqual(v.badLines, []);
  assert.deepEqual(v.missingLines, []);
  assert.deepEqual(v.extraLines, []);
});

test('checksums: modified line content -> badLines names the line', () => {
  const map = { ...mkMap([1, 2, 3, 4]), transports: structuredClone(TWO) };
  addTransportChecksums(map);
  map.transports.lines[0].legs[0].time = 99;               // beta changed
  const v = verifyTransportChecksums(map);
  assert.equal(v.ok, false);
  assert.equal(v.hashOk, false);
  assert.deepEqual(v.badLines, ['beta']);
  assert.deepEqual(v.missingLines, []);
  assert.deepEqual(v.extraLines, []);
});

test('checksums: line added after signing -> missingLines (unsigned content)', () => {
  const map = { ...mkMap([1, 2, 3, 4, 5]), transports: structuredClone(TWO) };
  addTransportChecksums(map);
  map.transports.lines.push(lineDef('gamma', [{ from: 4, to: 5 }]));
  const v = verifyTransportChecksums(map);
  assert.equal(v.ok, false);
  assert.deepEqual(v.missingLines, ['gamma']);
  assert.deepEqual(v.badLines, []);
});

test('checksums: line removed after signing -> extraLines (orphan signature)', () => {
  const map = { ...mkMap([1, 2, 3, 4]), transports: structuredClone(TWO) };
  addTransportChecksums(map);
  map.transports.lines = map.transports.lines.filter(l => l.name !== 'alfa');
  const v = verifyTransportChecksums(map);
  assert.equal(v.ok, false);
  assert.deepEqual(v.extraLines, ['alfa']);
  assert.deepEqual(v.badLines, []);
});

test('checksums: transports removed entirely -> every stored line is extra', () => {
  const map = { ...mkMap([1, 2, 3, 4]), transports: structuredClone(TWO) };
  addTransportChecksums(map);
  delete map.transports;
  const v = verifyTransportChecksums(map);
  assert.equal(v.present, true);
  assert.equal(v.ok, false);
  assert.equal(v.hashOk, false);
  assert.deepEqual(v.extraLines, ['alfa', 'beta']);
});

test('checksums: no transports and no sums -> present:false, ok', () => {
  const v = verifyTransportChecksums(mkMap([1, 2]));
  assert.equal(v.present, false);
  assert.equal(v.ok, true);
});

test('checksums: transports without sums -> unsigned (ok, not an error)', () => {
  const map = { ...mkMap([1, 2]), transports: TWO };
  const v = verifyTransportChecksums(map);
  assert.equal(v.present, false);
  assert.equal(v.ok, true);
  assert.equal(v.unsigned, true);
  assert.equal(v.lineCount, 2);
});

test('checksums: line array order is not semantic; leg order is', () => {
  const map = { ...mkMap([1, 2, 3, 4]), transports: structuredClone(TWO) };
  addTransportChecksums(map);
  // reorder lines -> still ok
  map.transports.lines.reverse();
  assert.equal(verifyTransportChecksums(map).ok, true);
  // reorder legs inside a line -> bad
  map.transports.lines[0].legs.reverse();
  map.transports.lines[1].legs.reverse();
  // (single-leg lines: reverse is a no-op, so craft a two-leg line instead)
  const map2 = { ...mkMap([1, 2, 3]),
    transports: doc([lineDef('multi', [{ from: 1, to: 2, time: 5 }, { from: 2, to: 3, time: 6 }])]) };
  addTransportChecksums(map2);
  map2.transports.lines[0].legs.reverse();
  const v2 = verifyTransportChecksums(map2);
  assert.equal(v2.ok, false);
  assert.deepEqual(v2.badLines, ['multi']);
});

test('checksums: re-sign after transports removal clears orphan sums', () => {
  const map = { ...mkMap([1, 2, 3, 4]), transports: structuredClone(TWO) };
  addTransportChecksums(map);
  delete map.transports;
  addTransportChecksums(map);
  assert.equal(map.checksums.transports, undefined);
  assert.equal(verifyTransportChecksums(map).ok, true);
});

test('checksums: never throws on garbage', () => {
  assert.doesNotThrow(() => verifyTransportChecksums(null));
  assert.doesNotThrow(() => verifyTransportChecksums({}));
  assert.doesNotThrow(() => verifyTransportChecksums({ checksums: { transports: { hash: 'x' } } }));
  assert.doesNotThrow(() => verifyTransportChecksums({ transports: 'junk' }));
  const v = verifyTransportChecksums({ checksums: { transports: { hash: 'x', lines: {} } }, transports: 'junk' });
  assert.equal(v.present, true);
  assert.equal(v.ok, false);
});

test('checksums: envelope created when missing, alg preserved when present', () => {
  const map = { ...mkMap([1, 2]), transports: TWO };
  delete map.checksums;
  addTransportChecksums(map);
  assert.equal(map.checksums.alg, 'v4');
  const map2 = { ...mkMap([1, 2]), checksums: { alg: 'v4', meta: 'abc' }, transports: TWO };
  addTransportChecksums(map2);
  assert.equal(map2.checksums.meta, 'abc');   // untouched
});

// --- routing edges ---

test('buildTransportEdges: cost model and multi-stop chains', () => {
  const idx = buildIndex(mkMap([1, 2, 3]));
  const d = doc([lineDef('coach', [
    { from: 1, to: 2, time: 10, label: 'mid' },
    { from: 2, to: 3, time: 20, label: 'end' },
  ])]);
  const edges = buildTransportEdges(d, idx, { mode: 'normal' });
  const from1 = edges.get(1);
  // direct leg 1->2: 10*0.5 + 30 = 35; chained 1->3: (10+20)*0.5 + 30 = 45
  assert.deepEqual(from1.map(e => [e.to, e.cost]), [[2, 35], [3, 45]]);
  assert.deepEqual(from1[1].hop.via, ['mid']);
  assert.equal(from1[1].hop.time, 30);
  const from2 = edges.get(2);
  assert.deepEqual(from2.map(e => e.to), [3]);
});

test('buildTransportEdges: default time when missing, aggressive mode cheaper', () => {
  const idx = buildIndex(mkMap([1, 2]));
  const d = doc([lineDef('ferry', [{ from: 1, to: 2 }])]);   // no time -> 60
  const n = buildTransportEdges(d, idx, { mode: 'normal' }).get(1)[0].cost;
  assert.equal(n, TRANSPORT_DEFAULT_TIME * TRANSPORT_TIME_RATIO.normal + TRANSPORT_BOARDING_PENALTY.normal);
  const a = buildTransportEdges(d, idx, { mode: 'aggressive' }).get(1)[0].cost;
  assert.equal(a, TRANSPORT_DEFAULT_TIME * TRANSPORT_TIME_RATIO.aggressive + TRANSPORT_BOARDING_PENALTY.aggressive);
});

test('buildTransportEdges: unknown mode -> no edges (fail-closed)', () => {
  const idx = buildIndex(mkMap([1, 2]));
  const d = doc([lineDef('ferry', [{ from: 1, to: 2 }])]);
  assert.equal(buildTransportEdges(d, idx, { mode: 'weird' }).size, 0);
  assert.equal(buildTransportEdges(d, idx).size, 1);   // default = normal
});

test('buildTransportEdges: loops and foreign rooms terminate the chain', () => {
  const idx = buildIndex(mkMap([1, 2]));
  const d = doc([lineDef('ring', [
    { from: 1, to: 2, time: 10 },
    { from: 2, to: 1, time: 10 },   // back to start
    { from: 1, to: 99, time: 10 },  // foreign room
  ])]);
  const edges = buildTransportEdges(d, idx, { mode: 'normal' });
  // from 1: direct to 2; chain stops (next leg would return to 1)
  assert.deepEqual(edges.get(1).map(e => e.to), [2]);
  // from 2: leg to 1 exists, but the loop guard blocks the return-to-start edge?
  // from=2: leg (2->1) gives edge to 1; chain continues to (1->99) — 99 foreign, stops
  assert.deepEqual(edges.get(2).map(e => e.to), [1]);
  // garbage docs never throw
  assert.equal(buildTransportEdges(null, idx, {}).size, 0);
  assert.equal(buildTransportEdges({}, idx, {}).size, 0);
});

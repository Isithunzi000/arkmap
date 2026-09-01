// Graph module: buildIndex / neighborsOf / findPath / searchRooms.
// Fixture facts (golden_fixture.arkmap), verified against the file:
//   area 1 "Obszar Testowy ąę": rooms 1..6
//     room 2: exits { n:1 (w1), se:3 (w12), bogusdir:99 }, special { 'wejdź do piwnicy':5, 'uciekaj':1 }
//     room 3: exits { nw:2 (w3) }   room 4: exits { e:1 }   rooms 1,5: no exits   room 6: exits {}, name ''
//   area -5 "Ujemny obszar": rooms 101..106
//     102: { down:103 }   103: { down:101 } + special { z:101, ą:102, a:5 }   104: { up:103 }   101,105,106: no exits
// Tie alert: 3 -> 1 has two equal-cost paths (via n w1, via special 'uciekaj' w1, both cost 4).
// Property-based assertions there — never an exact id sequence where a tie exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildIndex, neighborsOf, findPath, searchRooms } from '../src/graph.js';
import * as root from '../src/index.js';

const FIXTURE = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'golden_fixture.arkmap'), 'utf8'));
const IDX = buildIndex(FIXTURE);

// every step of a path must be a real edge of the previous room
function assertContinuous(path) {
  for (let i = 0; i + 1 < path.length; i++) {
    const targets = neighborsOf(IDX.get(path[i]).room).map(([t]) => t);
    assert.ok(targets.includes(path[i + 1]), `step ${path[i]} -> ${path[i + 1]} is a real exit`);
  }
}

// --- buildIndex ---

test('buildIndex indexes all rooms with areaId and areaName', () => {
  assert.equal(IDX.size, 12);
  assert.equal(IDX.get(2).areaId, 1);
  assert.equal(IDX.get(2).areaName, 'Obszar Testowy ąę');
  assert.equal(IDX.get(104).areaId, -5);
  assert.equal(IDX.get(104).areaName, 'Ujemny obszar');
});

test('buildIndex: duplicate room id — last occurrence wins (documented)', () => {
  const map = { areas: [
    { id: 1, rooms: [{ id: 7, name: 'first' }] },
    { id: 2, rooms: [{ id: 7, name: 'second' }] },
  ] };
  assert.equal(buildIndex(map).get(7).room.name, 'second');
});

test('buildIndex: empty/garbage map yields empty index', () => {
  assert.equal(buildIndex(null).size, 0);
  assert.equal(buildIndex({}).size, 0);
});

// --- neighborsOf ---

test('neighborsOf: exits then special exits, weights applied', () => {
  const n = neighborsOf(IDX.get(2).room);
  assert.deepEqual(n.slice(0, 3), [[1, 1], [3, 12], [99, 1]]);   // bogusdir kept here
  assert.deepEqual(n.slice(3), [[5, 1], [1, 1]]);                  // special exits, default w=1
});

test('neighborsOf: invalid weights (negative, NaN, Infinity) fall back to 1', () => {
  const room = { exits: { n: 2, s: 3, e: 4 }, exit_weights: { n: -5, s: NaN, e: Infinity } };
  assert.deepEqual(neighborsOf(room), [[2, 1], [3, 1], [4, 1]]);
});

test('neighborsOf: weight 0 is legal', () => {
  const room = { exits: { n: 2 }, exit_weights: { n: 0 } };
  assert.deepEqual(neighborsOf(room), [[2, 0]]);
});

test('neighborsOf: room without exits yields empty list', () => {
  assert.deepEqual(neighborsOf({}), []);
  assert.deepEqual(neighborsOf(IDX.get(6).room), []);   // exits: {} + special_exits: {}
});

// --- findPath ---

test('findPath: direct special exit (unique path, exact assertion)', () => {
  assert.deepEqual(findPath(2, 5, IDX), [2, 5]);
});

test('findPath: cross-area via special exit (unique path, exact assertion)', () => {
  const p = findPath(102, 5, IDX);
  assert.deepEqual(p, [102, 103, 5]);   // down, then special 'a' into area 1
  assertContinuous(p);
});

test('findPath: tie between equal-cost paths — assert properties, not sequence', () => {
  const p = findPath(3, 1, IDX);
  assert.ok(p, 'path exists');
  assert.equal(p.length, 3);            // cost 4 either way: nw(w3) then n/uciekaj(w1)
  assert.equal(p[0], 3);
  assert.equal(p[2], 1);
  assertContinuous(p);
});

test('findPath: heavy exit avoided when a cheaper route exists', () => {
  // 2 -> 3 direct costs 12 (exit_weights.se); 2 -> 1 ... no. 3 reachable only via se from 2.
  // Use synthetic: a->c direct w10 vs a->b->c w1+w1.
  const map = { areas: [{ id: 1, rooms: [
    { id: 1, exits: { e: 2, n: 3 }, exit_weights: { n: 10, e: 1 } },
    { id: 2, exits: { n: 3 }, exit_weights: { n: 1 } },
    { id: 3, exits: {} },
  ] }] };
  assert.deepEqual(findPath(1, 3, buildIndex(map)), [1, 2, 3]);
});

test('findPath: same room yields [id]', () => {
  assert.deepEqual(findPath(2, 2, IDX), [2]);
});

test('findPath: unknown ids yield null', () => {
  assert.equal(findPath(999999, 2, IDX), null);
  assert.equal(findPath(2, 999999, IDX), null);
});

test('findPath: dangling exit target (bogusdir -> 99) is skipped, no throw', () => {
  // 99 is a target of room 2 but has no room; paths must not go through it.
  assert.equal(findPath(2, 99, IDX), null);
  assert.ok(findPath(3, 5, IDX), 'path 3 -> 5 works despite dangling exit nearby');
});

test('findPath: unreachable rooms yield null', () => {
  assert.equal(findPath(4, 3, IDX), null);    // 4 -> 1, room 1 is a dead end
  assert.equal(findPath(105, 106, IDX), null); // both isolated
  assert.equal(findPath(5, 2, IDX), null);     // direction matters
});

// --- searchRooms ---

test('searchRooms: substring on name, case-insensitive, with area info', () => {
  const hits = searchRooms('smokiem', FIXTURE);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].room.id, 2);
  assert.equal(hits[0].areaId, 1);
  assert.equal(hits[0].areaName, 'Obszar Testowy ąę');
  assert.equal(searchRooms('KARCZMA', FIXTURE).length, 1);   // case-insensitive
});

test('searchRooms: digit query (with or without #) matches id exactly, not name substrings', () => {
  for (const q of ['2', '#2']) {
    const hits = searchRooms(q, FIXTURE);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].room.id, 2);
  }
});

test('searchRooms: empty/no-hit queries yield []', () => {
  assert.deepEqual(searchRooms('', FIXTURE), []);
  assert.deepEqual(searchRooms('   ', FIXTURE), []);
  assert.deepEqual(searchRooms('no such room', FIXTURE), []);
  assert.deepEqual(searchRooms('#999999', FIXTURE), []);
});

test('searchRooms: limit cuts results', () => {
  const map = { areas: [{ id: 1, name: 'a', rooms: Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: 'same' })) }] };
  assert.equal(searchRooms('same', map).length, 25);
  assert.equal(searchRooms('same', map, 3).length, 3);
});

test('searchRooms: area without name falls back to String(area.id)', () => {
  const map = { areas: [{ id: 7, rooms: [{ id: 1, name: 'x room' }] }] };
  assert.equal(searchRooms('x room', map)[0].areaName, '7');
});

test('searchRooms: garbage map yields []', () => {
  assert.deepEqual(searchRooms('x', null), []);
  assert.deepEqual(searchRooms('x', {}), []);
});

// --- root re-export ---

test('graph functions are re-exported from the package root', () => {
  for (const fn of ['buildIndex', 'neighborsOf', 'findPath', 'searchRooms']) {
    assert.equal(typeof root[fn], 'function', fn);
  }
});

// Full router: dirMode filters, locked handling, A* vs Dijkstra, transports,
// extraEdges, planRoute, countSpecialSteps. Synthetic maps — deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, findRoute, planRoute, countSpecialSteps } from '../src/graph.js';
import { buildTransportEdges } from '../src/transports.js';

function mkMap(rooms, areaId = 1) {
  return { areas: [{ id: areaId, name: 'A' + areaId, rooms }] };
}
function idxOf(...maps) {
  const idx = new Map();
  for (const m of maps) for (const [k, v] of buildIndex(m)) idx.set(k, v);
  return idx;
}
const costOf = (path, idx) => {
  // recompute path cost with router weights
  let c = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const room = idx.get(path[i]).room;
    const dir = Object.entries(room.exits || {}).find(([, v]) => v === path[i + 1])?.[0]
      ?? Object.entries(room.special_exits || {}).find(([, v]) => v === path[i + 1])?.[0];
    if (dir === undefined) return null;   // virtual edge
    const ew = room.exit_weights?.[dir];
    c += (typeof ew === 'number' && ew > 0) ? ew : Math.max(idx.get(path[i + 1]).room.weight ?? 1, 1);
  }
  return c;
};

// line of rooms 1-2-3-4 connected e/w on a grid row
function line(n) {
  const rooms = [];
  for (let i = 1; i <= n; i++) {
    rooms.push({ id: i, x: i, y: 0, z: 0,
      exits: { ...(i > 1 ? { w: i - 1 } : {}), ...(i < n ? { e: i + 1 } : {}) } });
  }
  return rooms;
}

// --- dirMode ---

test('dirMode: cardinal blocks vertical and special exits', () => {
  const map = mkMap([
    { id: 1, x: 0, y: 0, z: 0, exits: { e: 2, up: 3 }, special_exits: { 'wskocz': 4 } },
    { id: 2, x: 1, y: 0, z: 0, exits: { w: 1, up: 3 } },
    { id: 3, x: 2, y: 0, z: 1, exits: { down: 2 }, special_exits: { 'skocz': 4 } },
    { id: 4, x: 3, y: 0, z: 0, exits: {} },
  ]);
  const idx = buildIndex(map);
  // 1 -> 4: only via special exits exists
  assert.equal(findRoute(1, 4, idx, { dirMode: 'cardinal' }).path, null);
  assert.equal(findRoute(1, 4, idx, { dirMode: 'vertical' }).path, null);
  assert.deepEqual(findRoute(1, 4, idx, { dirMode: 'all' }).path, [1, 4]);
  // 1 -> 3: direct up (vertical) vs detour via 2
  assert.deepEqual(findRoute(1, 3, idx, { dirMode: 'vertical' }).path, [1, 3]);
  const card = findRoute(1, 3, idx, { dirMode: 'cardinal' }).path;
  assert.deepEqual(card, null);   // 'up'/'down' blocked; no cardinal route to z=1 room
});

// --- locked ---

test('locked exits are always skipped, locked rooms only when avoidLocked', () => {
  const map = mkMap([
    { id: 1, x: 0, y: 0, z: 0, exits: { e: 2, n: 3 }, exit_locks: ['e'] },
    { id: 2, x: 1, y: 0, z: 0, exits: { w: 1, e: 4 }, locked: true },
    { id: 3, x: 0, y: 1, z: 0, exits: { s: 1, e: 4 } },
    { id: 4, x: 1, y: 1, z: 0, exits: { w: 3 } },
  ]);
  const idx = buildIndex(map);
  // exit lock on 1->e is unconditional: even permissive mode must go via 3
  assert.deepEqual(findRoute(1, 4, idx, { avoidLocked: false }).path, [1, 3, 4]);
  // locked room 2: with avoidLocked the router must not pass through it either
  assert.deepEqual(findRoute(1, 4, idx, { avoidLocked: true }).path, [1, 3, 4]);
});

test('locked room as START may still exit (reference parity)', () => {
  const map = mkMap([
    { id: 1, x: 0, y: 0, z: 0, exits: { e: 2 }, locked: true },
    { id: 2, x: 1, y: 0, z: 0, exits: { w: 1 } },
  ]);
  assert.deepEqual(findRoute(1, 2, buildIndex(map), { avoidLocked: true }).path, [1, 2]);
});

// --- A* vs Dijkstra ---

test('A* and Dijkstra return equal-cost paths on a weighted grid', () => {
  // 4x4 grid, some heavy rooms
  const rooms = [];
  const N = 4;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const id = y * N + x + 1;
    const exits = {};
    if (x > 0) exits.w = id - 1;
    if (x < N - 1) exits.e = id + 1;
    if (y > 0) exits.s = id - N;
    if (y < N - 1) exits.n = id + N;
    rooms.push({ id, x, y, z: 0, exits, weight: (id === 7 || id === 10) ? 9 : 1 });
  }
  const idx = buildIndex(mkMap(rooms));
  for (const [a, b] of [[1, 16], [4, 13], [6, 11], [1, 4]]) {
    const d = findRoute(a, b, idx, { algorithm: 'dijkstra' }).path;
    const s = findRoute(a, b, idx, { algorithm: 'astar' }).path;
    assert.ok(d && s, `${a}->${b} both found`);
    assert.equal(costOf(s, idx), costOf(d, idx), `${a}->${b} equal cost`);
  }
});

test('A* cross-area: works when areas connect, null when area graph disconnected', () => {
  const a1 = mkMap([{ id: 1, x: 0, y: 0, z: 0, exits: { e: 2 } }, { id: 2, x: 1, y: 0, z: 0, exits: { w: 1, e: 10 } }], 1);
  const a2 = mkMap([{ id: 10, x: 2, y: 0, z: 0, exits: { w: 2 } }], 2);
  const a3 = mkMap([{ id: 20, x: 9, y: 9, z: 0, exits: {} }], 3);   // island
  const idx = idxOf(a1, a2, a3);
  assert.deepEqual(findRoute(1, 10, idx, { algorithm: 'astar' }).path, [1, 2, 10]);
  assert.equal(findRoute(1, 20, idx, { algorithm: 'astar' }).path, null);
});

// --- transports ---

const SHIP = {
  format: 'arkmap-transports', version: 1,
  lines: [{ name: 'A-B ferry', board: ['wsiadz'], exit: 'zejdz',
    legs: [{ from: 1, to: 50, time: 10, label: 'B' }, { from: 50, to: 1, time: 10, label: 'A' }] }],
};

test('transports: hop beats a long walk, carries metadata, respects mode', () => {
  const walk = line(50);   // 1..50 walking chain, 49 steps
  const idx = buildIndex(mkMap(walk));
  const walkOnly = findRoute(1, 50, idx, {}).path;
  assert.equal(walkOnly.length, 50);
  const { path, hops } = findRoute(1, 50, idx, { transportMode: 'normal', transports: SHIP });
  assert.deepEqual(path, [1, 50]);                    // one hop beats 49 steps
  assert.equal(hops.length, 1);
  assert.equal(hops[0].name, 'A-B ferry');
  assert.deepEqual(hops[0].board, ['wsiadz']);
  assert.equal(hops[0].time, 10);
  // aggressive is cheaper than normal
  const eN = buildTransportEdges(SHIP, idx, { mode: 'normal' }).get(1)[0].cost;
  const eA = buildTransportEdges(SHIP, idx, { mode: 'aggressive' }).get(1)[0].cost;
  assert.ok(eA < eN, `${eA} < ${eN}`);
});

test('transports: boarding penalty makes a short walk win over a hop', () => {
  const rooms = [
    { id: 1, x: 0, y: 0, z: 0, exits: { e: 2 } },
    { id: 2, x: 1, y: 0, z: 0, exits: { w: 1 } },
  ];
  const ship = { format: 'arkmap-transports', version: 1,
    lines: [{ name: 'slow boat', board: ['wsiadz'], exit: 'zejdz',
      legs: [{ from: 1, to: 2, time: 500, label: 'B' }] }] };
  const idx = buildIndex(mkMap(rooms));
  const { path, hops } = findRoute(1, 2, idx, { transportMode: 'normal', transports: ship });
  assert.deepEqual(path, [1, 2]);
  assert.deepEqual(hops, [null]);                     // walking step — no hop
});

test('transports: chain stops at rooms missing from the map', () => {
  const idx = buildIndex(mkMap([{ id: 1, x: 0, y: 0, z: 0, exits: {} }]));
  const edges = buildTransportEdges(SHIP, idx, { mode: 'normal' });
  assert.equal(edges.size, 0);   // room 10 is foreign — no edge
});

test('transports force Dijkstra even when algorithm=astar (reference parity)', () => {
  const idx = buildIndex(mkMap(line(50)));
  const a = findRoute(1, 50, idx, { algorithm: 'astar', transportMode: 'normal', transports: SHIP });
  const d = findRoute(1, 50, idx, { algorithm: 'dijkstra', transportMode: 'normal', transports: SHIP });
  assert.deepEqual(a.path, d.path);
  assert.deepEqual(a.hops.map(h => h?.name ?? null), d.hops.map(h => h?.name ?? null));
});

// --- extraEdges ---

test('extraEdges: ad-hoc virtual edge works, invalid entries skipped', () => {
  const idx = buildIndex(mkMap(line(5)));
  const { path, hops } = findRoute(1, 5, idx, { extraEdges: [
    { from: 1, to: 5, cost: 1, hop: { name: 'portal', from: 1, to: 5 } },
    { from: 1, to: 99, cost: 1 },        // unknown target — skipped
    { from: 2, to: 5, cost: -3 },        // negative cost — skipped
  ] });
  assert.deepEqual(path, [1, 5]);
  assert.equal(hops[0].name, 'portal');
});

// --- planRoute / countSpecialSteps ---

test('planRoute: legs per consecutive waypoints, null waypoint yields null leg', () => {
  const idx = buildIndex(mkMap(line(5)));
  const r = planRoute([1, 3, null, 5], idx, {});
  assert.equal(r.legs.length, 3);
  assert.deepEqual(r.legs[0].path, [1, 2, 3]);
  assert.equal(r.legs[1], null);
  assert.deepEqual(r.legs[2], null);       // leg null->5 has no endpoints pair? 3->null? no: [3,null] and [null,5]
  assert.equal(r.totalSteps, 2);
  assert.equal(r.complete, true);
});

test('planRoute: complete=false when a leg has no path', () => {
  const idx = buildIndex(mkMap([
    { id: 1, x: 0, y: 0, z: 0, exits: { e: 2 } },
    { id: 2, x: 1, y: 0, z: 0, exits: { w: 1 } },
    { id: 3, x: 9, y: 9, z: 0, exits: {} },
  ]));
  const r = planRoute([1, 2, 3], idx, {});
  assert.equal(r.complete, false);
  assert.equal(r.legs[1].path, null);
});

test('countSpecialSteps counts special-only steps', () => {
  const map = mkMap([
    { id: 1, x: 0, y: 0, z: 0, exits: { e: 2 }, special_exits: { 'brama': 3 } },
    { id: 2, x: 1, y: 0, z: 0, exits: { w: 1 } },
    { id: 3, x: 2, y: 0, z: 0, exits: { e: 4 } },
    { id: 4, x: 3, y: 0, z: 0, exits: {} },
  ]);
  const idx = buildIndex(map);
  assert.equal(countSpecialSteps([1, 3, 4], idx), 1);
  assert.equal(countSpecialSteps([1, 2], idx), 0);
  assert.equal(countSpecialSteps(null, idx), 0);
});

test('findRoute: unknown ids and same id', () => {
  const idx = buildIndex(mkMap(line(3)));
  assert.equal(findRoute(1, 99, idx, {}).path, null);
  assert.deepEqual(findRoute(2, 2, idx, {}).path, [2]);
});

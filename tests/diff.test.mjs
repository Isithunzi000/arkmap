// diff.js: universal map diff (arkdelta-op vocabulary). Self-contained —
// behavior pinned by direct assertions (op-for-op parity with ArkMap Studio's
// diffMaps verified externally during development).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffMaps } from '../src/diff.js';
import { stableStringify } from '../src/stable-stringify.js';

function mkRoom(id, over = {}) {
  return { id, x: id, y: 0, z: 0, name: 'R' + id, exits: {}, ...over };
}
function mkMap(rooms, over = {}) {
  return { areas: [{ id: 1, name: 'A1', rooms }], ...over };
}
const clone = (o) => JSON.parse(JSON.stringify(o));

test('identity: empty diff, overlap 1', () => {
  const m = mkMap([mkRoom(1, { exits: { e: 2 } }), mkRoom(2, { exits: { w: 1 } })]);
  const d = diffMaps(m, clone(m));
  assert.deepEqual(d.entries, []);
  assert.equal(d.overlap, 1);
  assert.equal(d.srcRooms, 2);
  assert.equal(d.dstRooms, 2);
  assert.ok(Object.values(d.stats).every(v => v === 0));
});

test('areas: add / delete / edit', () => {
  const base = { areas: [{ id: 1, name: 'A', rooms: [mkRoom(1)] }] };
  const plus = { areas: [...clone(base.areas), { id: 2, name: 'B', rooms: [] }] };
  let d = diffMaps(base, plus);
  assert.equal(d.entries.length, 1);
  assert.equal(d.entries[0].type, 'ADD_AREA');
  assert.equal(d.entries[0].areaId, 2);
  assert.equal(d.stats.addArea, 1);

  d = diffMaps(plus, base);
  assert.deepEqual(d.entries.map(e => e.type), ['DELETE_AREA']);
  assert.equal(d.stats.delArea, 1);

  d = diffMaps(base, { areas: [{ id: 1, name: 'A2', rooms: [mkRoom(1)] }] });
  assert.deepEqual(d.entries.map(e => e.type), ['EDIT_AREA']);
  assert.deepEqual(d.entries[0].before, { name: 'A', user_data: {} });
  assert.deepEqual(d.entries[0].after, { name: 'A2', user_data: {} });
});

test('rooms: add / delete, topological op order', () => {
  const m1 = mkMap([mkRoom(1, { exits: { e: 2 } }), mkRoom(2, { exits: { w: 1 } })]);
  const m2 = mkMap([mkRoom(1, { exits: { e: 2 } }), mkRoom(2, { exits: { w: 1 } }), mkRoom(4, { name: 'New' })]);
  let d = diffMaps(m1, m2);
  assert.deepEqual(d.entries.map(e => e.type), ['ADD_ROOM']);
  assert.equal(d.entries[0].roomId, 4);

  d = diffMaps(m2, m1);
  assert.deepEqual(d.entries.map(e => e.type), ['DELETE_ROOM']);
  assert.equal(d.entries[0].roomId, 4);
  assert.equal(d.entries[0].snapshot.name, 'New');

  // deleting a room trims exits pointing at it — no separate DELETE_EXIT ops
  d = diffMaps(m1, mkMap([mkRoom(1)]));
  assert.deepEqual(d.entries.map(e => e.type), ['DELETE_ROOM']);
});

test('exits: granular add/delete vs mixed-family EDIT_EXIT', () => {
  const a = mkMap([mkRoom(1, { exits: { e: 2 } }), mkRoom(2, { exits: { w: 1 } })]);
  // new exit on a dir that did not exist -> ADD_EXIT only (no delete)
  const b = mkMap([mkRoom(1, { exits: { e: 2 } }), mkRoom(2, { exits: { w: 1, e: 9 } })]);
  let d = diffMaps(a, b);
  assert.deepEqual(d.entries.map(e => e.type), ['ADD_EXIT']);
  assert.equal(d.entries[0].dir, 'e');
  assert.equal(d.entries[0].targetId, 9);

  // retarget on an existing dir -> DELETE with snapshot, then ADD
  const c = mkMap([mkRoom(1, { exits: { e: 5 } }), mkRoom(2)]);
  const c2 = mkMap([mkRoom(1, { exits: { e: 6 } }), mkRoom(2)]);
  d = diffMaps(c, c2);
  assert.deepEqual(d.entries.map(e => e.type), ['DELETE_EXIT', 'ADD_EXIT']);
  assert.equal(d.entries[0].snap.exitId, 5);

  // exits + weights changed -> single EDIT_EXIT (full snapshots)
  const e1 = mkMap([mkRoom(1, { exits: { e: 2 }, exit_weights: { e: 5 } }), mkRoom(2, { exits: { w: 1 } })]);
  const e2 = mkMap([mkRoom(1, { exits: { e: 2 } }), mkRoom(2, { exits: { w: 1 } })]);
  d = diffMaps(e1, e2);
  assert.deepEqual(d.entries.map(e => e.type), ['EDIT_EXIT']);
  assert.equal(d.entries[0].before.exit_weights.e, 5);
  assert.equal(d.entries[0].after.exit_weights, undefined);
});

test('residual field change -> single full-state EDIT_ROOM', () => {
  const d = diffMaps(mkMap([mkRoom(1, { name: 'A' })]), mkMap([mkRoom(1, { name: 'B' })]));
  assert.deepEqual(d.entries.map(e => e.type), ['EDIT_ROOM']);
  assert.equal(d.entries[0].before.name, 'A');
  assert.equal(d.entries[0].after.name, 'B');
});

test('moves: free order, collision cycle falls back to EDIT_ROOM', () => {
  const a = mkMap([mkRoom(1, { x: 0, y: 0 }), mkRoom(2, { x: 5, y: 0 })]);
  const b = mkMap([mkRoom(1, { x: 9, y: 9 }), mkRoom(2, { x: 5, y: 0 })]);
  let d = diffMaps(a, b);
  assert.deepEqual(d.entries.map(e => e.type), ['MOVE_ROOM']);
  assert.equal(d.entries[0].roomId, 1);
  assert.equal(d.entries[0].toX, 9);

  // swap positions — the cycle must break via one EDIT_ROOM + one MOVE_ROOM
  const s = mkMap([mkRoom(1, { x: 5, y: 0 }), mkRoom(2, { x: 0, y: 0 })]);
  d = diffMaps(a, s);
  assert.deepEqual(d.entries.map(e => e.type).sort(), ['EDIT_ROOM', 'MOVE_ROOM']);
  assert.equal(d.stats.moveRoom, 2);
});

test('paint: identical env/symbol changes group into one PAINT_BATCH', () => {
  const a = mkMap([mkRoom(1), mkRoom(2), mkRoom(3, { env: 7 })]);
  const b = mkMap([mkRoom(1, { env: 3, symbol: 'X' }), mkRoom(2, { env: 3, symbol: 'X' }), mkRoom(3, { env: 7 })]);
  const d = diffMaps(a, b);
  assert.deepEqual(d.entries.map(e => e.type), ['PAINT_BATCH']);
  assert.equal(d.entries[0].changes.length, 2);
  assert.equal(d.stats.paintRooms, 2);
  assert.equal(d.stats.paintBatches, 1);
});

test('custom lines: add / delete / edit incl. suppressor labels', () => {
  const cl = { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], color: [1, 2, 3] };
  const supp = { points: [], color: [0, 0, 0] };
  const withExit = (extra) => mkMap([mkRoom(1, { exits: { e: 2 }, ...extra }), mkRoom(2, { exits: { w: 1 } })]);

  let d = diffMaps(withExit({}), withExit({ custom_lines: { e: cl } }), { locale: 'pl' });
  assert.deepEqual(d.entries.map(e => e.type), ['ADD_CL']);
  assert.match(d.entries[0].label, /Dodano CL/);

  d = diffMaps(withExit({ custom_lines: { e: supp } }), withExit({}), { locale: 'pl' });
  assert.deepEqual(d.entries.map(e => e.type), ['DELETE_CL']);
  assert.match(d.entries[0].label, /pustej custom line/);

  d = diffMaps(withExit({ custom_lines: { e: cl } }),
               withExit({ custom_lines: { e: { points: [{ x: 9, y: 9 }], color: [1, 2, 3] } } }));
  assert.deepEqual(d.entries.map(e => e.type), ['EDIT_CL']);
});

test('i18n: labels default to English, locale pl switches catalog', () => {
  const cl = { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], color: [1, 2, 3] };
  const withExit = (extra) => mkMap([mkRoom(1, { exits: { e: 2 }, ...extra }), mkRoom(2, { exits: { w: 1 } })]);
  const mk = () => diffMaps(withExit({}), withExit({ custom_lines: { e: cl } }));

  // default (no opts, and opts without locale) -> English
  assert.match(mk().entries[0].label, /^Add CL dir=e in room "R1" \(#1\)$/);
  assert.match(diffMaps(withExit({}), withExit({ custom_lines: { e: cl } }), {}).entries[0].label, /^Add CL/);
  assert.match(diffMaps(withExit({}), withExit({ custom_lines: { e: cl } }), { locale: 'en' }).entries[0].label, /^Add CL/);

  // explicit Polish -> Studio-pinned wording
  assert.match(diffMaps(withExit({}), withExit({ custom_lines: { e: cl } }), { locale: 'pl' }).entries[0].label, /^Dodano CL/);

  // unknown locale falls back to English
  assert.match(diffMaps(withExit({}), withExit({ custom_lines: { e: cl } }), { locale: 'de' }).entries[0].label, /^Add CL/);

  // plural rendering follows the locale (PL 2-4 uses "pokoje", EN always "rooms" here)
  const pa = mkMap([mkRoom(1), mkRoom(2)]);
  const pb = mkMap([mkRoom(1, { env: 3 }), mkRoom(2, { env: 3 })]);
  assert.match(diffMaps(pa, pb).entries[0].label, /^Recolor — 2 rooms$/);
  assert.match(diffMaps(pa, pb, { locale: 'pl' }).entries[0].label, /^Malowanie — 2 pokoje$/);
});

test('labels: add / delete / move / resize / edit', () => {
  const lab = { id: 1, x: 1, y: 2, width: 10, height: 5, text: 'L' };
  const m = (labels) => ({ areas: [{ id: 1, name: 'A', rooms: [mkRoom(1)], labels }] });
  assert.deepEqual(diffMaps(m([]), m([lab])).entries.map(e => e.type), ['ADD_LABEL']);
  assert.deepEqual(diffMaps(m([lab]), m([])).entries.map(e => e.type), ['DELETE_LABEL']);
  assert.deepEqual(diffMaps(m([lab]), m([{ ...lab, x: 9 }])).entries.map(e => e.type), ['MOVE_LABEL']);
  assert.deepEqual(diffMaps(m([lab]), m([{ ...lab, width: 20 }])).entries.map(e => e.type), ['RESIZE_LABEL']);
  assert.deepEqual(diffMaps(m([lab]), m([{ ...lab, text: 'L2' }])).entries.map(e => e.type), ['EDIT_LABEL']);
});

test('env colors: EDIT_ENV_COLOR per changed env', () => {
  const a = { areas: [], colors: { custom_env_colors: { 3: [1, 2, 3] } } };
  const b = { areas: [], colors: { custom_env_colors: { 3: [9, 9, 9], 5: [0, 0, 0] } } };
  const d = diffMaps(a, b);
  assert.deepEqual(d.entries.map(e => e.type), ['EDIT_ENV_COLOR', 'EDIT_ENV_COLOR']);
  assert.deepEqual(d.entries[0].oldColor, [1, 2, 3]);
  assert.deepEqual(d.entries[0].newColor, [9, 9, 9]);
  assert.deepEqual(d.entries[1].oldColor, null);
});

test('room moved to another area -> MOVE_ROOM_TO_AREA', () => {
  const a = { areas: [{ id: 1, name: 'A', rooms: [mkRoom(1)] }, { id: 2, name: 'B', rooms: [] }] };
  const b = { areas: [{ id: 1, name: 'A', rooms: [] }, { id: 2, name: 'B', rooms: [mkRoom(1)] }] };
  const d = diffMaps(a, b);
  assert.deepEqual(d.entries.map(e => e.type), ['MOVE_ROOM_TO_AREA']);
  assert.equal(d.entries[0].fromAreaId, 1);
  assert.equal(d.entries[0].toAreaId, 2);
});

test('kinship guard: overlap ratio reflects shared room ids', () => {
  const a = mkMap([mkRoom(1), mkRoom(2), mkRoom(3), mkRoom(4)]);
  const b = mkMap([mkRoom(1), mkRoom(2), mkRoom(9), mkRoom(10)]);
  const d = diffMaps(a, b);
  assert.equal(d.overlap, 0.5);
});

test('deterministic: same input -> byte-identical output', () => {
  const a = mkMap([mkRoom(1, { exits: { e: 2 } }), mkRoom(2)]);
  const b = mkMap([mkRoom(1, { exits: { e: 2 }, custom_lines: { e: { points: [] } } }), mkRoom(2), mkRoom(7)]);
  assert.equal(stableStringify(diffMaps(a, b)), stableStringify(diffMaps(clone(a), clone(b))));
});

test('canon equivalence: defaults, z=0 and unsorted arrays produce no diff', () => {
  // same room expressed with defaults stripped vs explicit — .dat/.arkmap parity rule
  const a = mkMap([mkRoom(1, { exits: { e: 2 } })]);
  const b = mkMap([mkRoom(1, { exits: { e: 2 }, z: 0, weight: 1, stubs: [] })]);
  assert.deepEqual(diffMaps(a, b).entries, []);
});

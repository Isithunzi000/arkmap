// delta-apply: pure in-place .arkdelta application — op semantics, cascades,
// per-op skip isolation with stable codes + EN/PL reasons, overrides/onlySeq/
// seedSids, delta immutability, determinism (H3). Cross-checked byte-for-byte
// against the Studio original in ../work (verify_delta_apply_crosscheck.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDelta } from '../src/delta-apply.js';
import { stableStringify } from '../src/stable-stringify.js';

const room = (id, x, y, z, extra) => Object.assign({ id, x, y, z, exits: {} }, extra);

function baseMap() {
  const m = { format: 'arkmap', format_version: 2, meta: { map_name: 'T' },
    colors: { custom_env_colors: { '3': [1, 2, 3] } },
    areas: [
      { id: 1, name: 'A1', labels: [{ id: 1, text: 'L1', x: 0, y: 0, width: 5, height: 2 }], rooms: [
        { id: 1, x: 0, y: 0, z: 0, exits: { e: 2 }, exit_weights: { e: 1 }, doors: { e: 2 }, custom_lines: { e: { points: [[1, 1]] } }, env: 3 },
        { id: 2, x: 1, y: 0, z: 0, exits: { w: 1 }, special_exits: { cmd1: 1 }, special_exit_locks: ['cmd1'], custom_lines: { cmd1: { points: [] } }, exit_locks: ['w'] },
        { id: 3, x: 2, y: 0, z: 0, exits: { n: 4 } },
      ] },
      { id: 2, name: 'A2', rooms: [
        { id: 4, x: 2, y: -1, z: 0, exits: { s: 3 } },
      ] },
    ] };
  for (const a of m.areas) for (const r of a.rooms) r.area = a.id; // loader backlinks
  return m;
}
const mk = ops => JSON.parse(JSON.stringify({ ops }));
const run = (ops, opts) => { const m = baseMap(); const r = applyDelta(m, mk(ops), opts); return { m, r }; };
const roomOf = (m, id) => { for (const a of m.areas) { const r = a.rooms.find(r => r.id === id); if (r) return r; } };
const codes = r => r.skipped.map(s => s.code);

test('ADD_AREA + ADD_ROOM + ADD_EXIT sid chain: fresh ids, bidirectional, backlinks', () => {
  const { m, r } = run([
    { seq: 1, type: 'ADD_AREA', target: { areaId: 'd:1' }, payload: { area: { id: 'd:1', name: 'Nowa', user_data: {} } } },
    { seq: 2, type: 'ADD_ROOM', target: { roomId: 'd:2', areaId: 'd:1' }, payload: { room: room('d:2', 9, 9, 0) } },
    { seq: 3, type: 'ADD_EXIT', target: { sourceId: 'd:2', dir: 'w' }, payload: { targetId: 3, bidirectional: true } },
  ]);
  assert.deepEqual(r, { applied: 3, appliedSeqs: [1, 2, 3], skipped: [] });
  const area = m.areas.find(a => a.name === 'Nowa');
  const nr = area.rooms[0];
  assert.equal(typeof nr.id, 'number');
  assert.equal(nr.area, area.id);
  assert.equal(nr.exits.w, 3);
  assert.equal(roomOf(m, 3).exits.e, nr.id); // reverse of the bidirectional add
});

test('EDIT_ROOM replaces data, keeps area backlink; PAINT_BATCH paints env/symbol', () => {
  const { m, r } = run([
    { seq: 1, type: 'EDIT_ROOM', target: { roomId: 1 }, payload: { before: room(1, 0, 0, 0), after: room(1, 0, 0, 0, { env: 9, name: 'X' }) } },
    { seq: 2, type: 'PAINT_BATCH', target: {}, payload: { changes: [{ roomId: 1, afterEnv: 5, afterSymbol: 'X' }, { roomId: 2, afterEnv: 6 }] } },
  ]);
  assert.deepEqual(r.skipped, []);
  assert.equal(roomOf(m, 1).name, 'X');
  assert.equal(roomOf(m, 1).env, 5);
  assert.equal(roomOf(m, 1).symbol, 'X');
  assert.equal(roomOf(m, 1).area, 1);
  assert.equal(roomOf(m, 2).env, 6);
});

test('MOVE_ROOM: free target applies, occupied skips CELL_OCCUPIED, same spot ALREADY_THERE', () => {
  const { m, r } = run([
    { seq: 1, type: 'MOVE_ROOM', target: { roomId: 3 }, payload: { fromX: 2, fromY: 0, fromZ: 0, toX: 5, toY: 5, toZ: 0 } },
    { seq: 2, type: 'MOVE_ROOM', target: { roomId: 1 }, payload: { toX: 1, toY: 0, toZ: 0 } },
    { seq: 3, type: 'MOVE_ROOM', target: { roomId: 1 }, payload: { toX: 0, toY: 0, toZ: 0 } },
  ]);
  assert.equal(roomOf(m, 3).x, 5);
  assert.equal(roomOf(m, 1).x, 0);
  assert.deepEqual(codes(r), ['CELL_OCCUPIED', 'ALREADY_THERE']);
  assert.deepEqual(r.skipped.map(s => s.seq), [2, 3]);
});

test('MOVE_ROOM_TO_AREA: moves room + backlink; guards TARGET_AREA_MISSING / ALREADY_IN_AREA', () => {
  const { m, r } = run([
    { seq: 1, type: 'MOVE_ROOM_TO_AREA', target: { roomId: 3 }, payload: { fromAreaId: 1, toAreaId: 2 } },
    { seq: 2, type: 'MOVE_ROOM_TO_AREA', target: { roomId: 1 }, payload: { toAreaId: 99 } },
    { seq: 3, type: 'MOVE_ROOM_TO_AREA', target: { roomId: 1 }, payload: { toAreaId: 1 } },
  ]);
  assert.equal(roomOf(m, 3).area, 2);
  assert.ok(m.areas[1].rooms.some(x => x.id === 3));
  assert.ok(!m.areas[0].rooms.some(x => x.id === 3));
  assert.deepEqual(codes(r), ['TARGET_AREA_MISSING', 'ALREADY_IN_AREA']);
});

test('ADD_EXIT: guard DIR_OCCUPIED refuses without mutation; door/weight/CL stored', () => {
  const { m, r } = run([
    { seq: 1, type: 'ADD_EXIT', target: { sourceId: 1, dir: 'e' }, payload: { targetId: 3 } }, // e already leads to 2 -> guard
    { seq: 2, type: 'ADD_EXIT', target: { sourceId: 1, dir: 'e' }, payload: { targetId: 2 } }, // identical exit: no-op apply
    { seq: 3, type: 'ADD_EXIT', target: { sourceId: 3, dir: 'w' }, payload: { targetId: 2, bidirectional: true, door: 1, weight: 2 } },
  ]);
  assert.deepEqual(codes(r), ['DIR_OCCUPIED']);
  assert.equal(roomOf(m, 1).exits.e, 2); // unchanged by the refused op
  assert.equal(roomOf(m, 3).exits.w, 2);
  assert.equal(roomOf(m, 2).exits.e, 3); // bidirectional reverse
});

test('DELETE_EXIT removes both directions; DELETE_SPECIAL_EXIT cleans cmd + lock + CL', () => {
  const { m, r } = run([
    { seq: 1, type: 'DELETE_EXIT', target: { roomId: 3, dir: 'n' }, payload: {} },
    { seq: 2, type: 'DELETE_SPECIAL_EXIT', target: { roomId: 2 }, payload: { cmd: 'cmd1' } },
  ]);
  assert.deepEqual(r.skipped, []);
  assert.equal(roomOf(m, 3).exits.n, undefined); // forward removed
  assert.equal(roomOf(m, 4).exits.s, 3); // reverse survives (Studio commitDeleteExit semantics)
  const r2 = roomOf(m, 2);
  assert.equal(r2.special_exits, undefined);
  assert.equal(r2.special_exit_locks, undefined);
  assert.equal((r2.custom_lines || {}).cmd1, undefined);
});

test('EDIT_EXIT replaces exit data of a room', () => {
  const { m, r } = run([
    { seq: 1, type: 'EDIT_EXIT', target: { roomId: 2 }, payload: { before: { id: 2 }, after: { id: 2, exits: { w: 1, e: 3 } } } },
  ]);
  assert.deepEqual(r.skipped, []);
  assert.equal(roomOf(m, 2).exits.e, 3);
});

test('custom lines: ADD_CL / EDIT_CL / DELETE_CL + CL_MISSING guard', () => {
  const { m, r } = run([
    { seq: 1, type: 'ADD_CL', target: { roomId: 1, dir: 'n' }, payload: { cl: { points: [[0, 0], [1, 1]], color: [9, 9, 9], style: 'solid' } } },
    { seq: 2, type: 'EDIT_CL', target: { roomId: 1, dir: 'e' }, payload: { before: { points: [[1, 1]] }, after: { points: [[2, 2]] } } },
    { seq: 3, type: 'DELETE_CL', target: { roomId: 1, dir: 'n' }, payload: {} },
    { seq: 4, type: 'DELETE_CL', target: { roomId: 1, dir: 'n' }, payload: {} },
  ]);
  assert.deepEqual(codes(r), ['CL_MISSING']);
  assert.deepEqual(roomOf(m, 1).custom_lines, { e: { points: [[2, 2]] } });
});

test('suppressors: ADD_SUPPRESSOR / DELETE_SUPPRESSOR / AUTO_FIX_SUPPRESSORS', () => {
  const { m, r } = run([
    { seq: 1, type: 'ADD_SUPPRESSOR', target: { roomId: 3, dir: 'e' }, payload: {} },
    { seq: 2, type: 'DELETE_SUPPRESSOR', target: { roomId: 3, dir: 'e' }, payload: {} },
    { seq: 3, type: 'AUTO_FIX_SUPPRESSORS', target: {}, payload: { added: [{ roomId: 2, dir: 's', cl: { points: [], color: [255, 0, 0] } }], removed: [] } },
  ]);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(roomOf(m, 3).custom_lines, {}); // container kept, entry removed
  assert.deepEqual(roomOf(m, 2).custom_lines.s, { points: [], color: [255, 0, 0] });
});

test('labels: ADD/EDIT/MOVE/RESIZE/DELETE + LABEL_MISSING guard', () => {
  const { m, r } = run([
    { seq: 1, type: 'ADD_LABEL', target: { areaId: 1 }, payload: { label: { id: 'd:1', text: 'nowa', x: 1, y: 1, width: 2, height: 1 } } },
    { seq: 2, type: 'EDIT_LABEL', target: { areaId: 1, labelId: 1 }, payload: { before: { id: 1, text: 'L1' }, after: { id: 1, text: 'L1*' } } },
    { seq: 3, type: 'MOVE_LABEL', target: { areaId: 1, labelId: 1 }, payload: { toX: 3, toY: 4 } },
    { seq: 4, type: 'RESIZE_LABEL', target: { areaId: 1, labelId: 1 }, payload: { toX: 3, toY: 4, toW: 8, toH: 6 } },
    { seq: 5, type: 'DELETE_LABEL', target: { areaId: 1, labelId: 'd:1' }, payload: { label: { id: 'd:1', text: 'nowa' } } },
    { seq: 6, type: 'EDIT_LABEL', target: { areaId: 1, labelId: 99 }, payload: { before: {}, after: {} } },
  ]);
  assert.deepEqual(codes(r), ['LABEL_MISSING']);
  const labels = m.areas[0].labels;
  assert.equal(labels.length, 1);
  assert.deepEqual(labels[0], { id: 1, text: 'L1*', x: 3, y: 4, width: 8, height: 6 });
});

test('EDIT_AREA renames + user_data; EDIT_ENV_COLOR sets and resets colors', () => {
  const { m, r } = run([
    { seq: 1, type: 'EDIT_AREA', target: { areaId: 1 }, payload: { name: 'A1x', user_data: { k: 'v' } } },
    { seq: 2, type: 'EDIT_ENV_COLOR', target: { envId: 3 }, payload: { oldColor: [1, 2, 3], newColor: [7, 8, 9] } },
    { seq: 3, type: 'EDIT_ENV_COLOR', target: { envId: 3 }, payload: { oldColor: [7, 8, 9], newColor: null } },
  ]);
  assert.deepEqual(r.skipped, []);
  assert.equal(m.areas[0].name, 'A1x');
  assert.deepEqual(m.areas[0].user_data, { k: 'v' });
  assert.equal(m.colors.custom_env_colors['3'], undefined);
});

test('cascade DELETE_ROOM: incoming exits, special exits and door stubs cleaned', () => {
  const { m, r } = run([
    { seq: 1, type: 'DELETE_ROOM', target: { roomId: 1, areaId: 1 }, payload: { room: room(1, 0, 0, 0) } },
  ]);
  assert.deepEqual(r.skipped, []);
  assert.equal(roomOf(m, 1), undefined);
  assert.equal((roomOf(m, 2).exits || {}).w, undefined);
  assert.equal(roomOf(m, 2).special_exits, undefined);
});

test('cascade DELETE_AREA: cross-area exits cleaned, empty containers pruned', () => {
  const { m, r } = run([
    { seq: 1, type: 'DELETE_AREA', target: { areaId: 2 }, payload: { name: 'A2' } },
  ]);
  assert.deepEqual(r.skipped, []);
  assert.equal(m.areas.length, 1);
  assert.equal((roomOf(m, 3).exits || {}).n, undefined); // cross exit to deleted area
});

test('default area guard: DELETE_AREA on area id <= 0 skips DEFAULT_AREA', () => {
  const ops = [{ seq: 1, type: 'DELETE_AREA', target: { areaId: 0 }, payload: {} }];
  const mkZero = () => { const m = baseMap(); m.areas.unshift({ id: 0, name: 'default', rooms: [] }); return m; };
  const m1 = mkZero();
  const en = applyDelta(m1, mk(ops));
  assert.deepEqual(codes(en), ['DEFAULT_AREA']);
  assert.equal(en.skipped[0].reason, 'default area — deletion forbidden');
  assert.equal(m1.areas.length, 3); // nothing touched
  const m2 = mkZero();
  const pl = applyDelta(m2, mk(ops), { locale: 'pl' });
  assert.equal(pl.skipped[0].reason, 'obszar domyślny — usuwanie zabronione');
});

test('skip isolation: missing room/area/exit/label, unknown type — rest still applies', () => {
  const { m, r } = run([
    { seq: 1, type: 'EDIT_ROOM', target: { roomId: 999 }, payload: { before: {}, after: {} } },
    { seq: 2, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 99 }, payload: { room: room('d:1', 9, 9, 0) } },
    { seq: 3, type: 'DELETE_EXIT', target: { roomId: 1, dir: 'q' }, payload: {} },
    { seq: 4, type: 'DELETE_SPECIAL_EXIT', target: { roomId: 1 }, payload: { cmd: 'nope' } },
    { seq: 5, type: 'DELETE_AREA', target: { areaId: 99 }, payload: {} },
    { seq: 6, type: 'BOGUS', target: {}, payload: {} },
    { seq: 7, type: 'EDIT_ROOM', target: { roomId: 1 }, payload: { before: room(1, 0, 0, 0), after: room(1, 0, 0, 0, { env: 9 }) } },
  ]);
  assert.equal(r.applied, 1);
  assert.deepEqual(r.appliedSeqs, [7]);
  assert.deepEqual(codes(r), ['ROOM_MISSING', 'AREA_MISSING', 'EXIT_MISSING', 'SPECIAL_EXIT_MISSING', 'AREA_MISSING', 'UNKNOWN_TYPE']);
  assert.equal(roomOf(m, 1).env, 9);
});

test('reasons: EN default, PL byte-pinned to Studio; code stays stable', () => {
  const en = run([{ seq: 1, type: 'EDIT_ROOM', target: { roomId: 999 }, payload: { before: {}, after: {} } }]).r;
  assert.equal(en.skipped[0].reason, 'room does not exist');
  assert.equal(en.skipped[0].code, 'ROOM_MISSING');
  const pl = run([{ seq: 1, type: 'EDIT_ROOM', target: { roomId: 999 }, payload: { before: {}, after: {} } }], { locale: 'pl' }).r;
  assert.equal(pl.skipped[0].reason, 'pokój nie istnieje');
  assert.equal(pl.skipped[0].code, 'ROOM_MISSING');
  const sid = run([{ seq: 1, type: 'ADD_EXIT', target: { sourceId: 'd:9', dir: 'e' }, payload: { targetId: 2 } }], { locale: 'pl' }).r;
  assert.equal(sid.skipped[0].code, 'SID_LEFTOVER');
  assert.equal(sid.skipped[0].reason, 'odwołanie do obiektu kalki, który nie istnieje (d:9)');
});

test('overrides: free fallback applies, occupied override skips OVERRIDE_OCCUPIED', () => {
  const { m, r } = run([
    { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: room('d:1', 0, 0, 0) } },
    { seq: 2, type: 'MOVE_ROOM', target: { roomId: 3 }, payload: { toX: 7, toY: 7, toZ: 0 } },
  ], { overrides: { 1: { x: 8, y: 8 }, 2: { x: 0, y: 0 } } });
  assert.equal(roomOf(m, 3).x, 2); // unchanged
  const added = m.areas[0].rooms.find(x => x.x === 8 && x.y === 8);
  assert.ok(added);
  assert.deepEqual(codes(r), ['OVERRIDE_OCCUPIED']);
});

test('onlySeq: only selected ops apply, the rest are skipped silently', () => {
  const { m, r } = run([
    { seq: 1, type: 'EDIT_ROOM', target: { roomId: 1 }, payload: { before: room(1, 0, 0, 0), after: room(1, 0, 0, 0, { env: 9 }) } },
    { seq: 2, type: 'EDIT_ROOM', target: { roomId: 2 }, payload: { before: { id: 2 }, after: { id: 2, env: 8 } } },
  ], { onlySeq: [2] });
  assert.deepEqual(r, { applied: 1, appliedSeqs: [2], skipped: [] });
  assert.equal(roomOf(m, 1).env, 3);
  assert.equal(roomOf(m, 2).env, 8);
});

test('seedSids: pre-resolved sid; executed ADD overrides the seed', () => {
  const { m, r } = run([
    { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: room('d:1', 9, 9, 0) } },
    { seq: 2, type: 'ADD_EXIT', target: { sourceId: 'd:1', dir: 'w' }, payload: { targetId: 1 } },
  ], { seedSids: [['d:1', 2]] });
  assert.deepEqual(r.skipped, []);
  const added = m.areas[0].rooms.find(x => x.x === 9);
  assert.equal(added.exits.w, 1);
  assert.equal(roomOf(m, 2).exits.e, undefined); // seed did NOT redirect the exit to room 2
});

test('delta is never mutated; result is deterministic', () => {
  const ops = [
    { seq: 1, type: 'ADD_ROOM', target: { roomId: 'd:1', areaId: 1 }, payload: { room: room('d:1', 9, 9, 0) } },
    { seq: 2, type: 'ADD_EXIT', target: { sourceId: 'd:1', dir: 'w' }, payload: { targetId: 1, bidirectional: true } },
  ];
  const d = mk(ops);
  const before = stableStringify(d);
  const m1 = baseMap(), m2 = baseMap();
  const r1 = applyDelta(m1, d);
  const r2 = applyDelta(m2, mk(ops));
  assert.equal(stableStringify(d), before);
  assert.equal(stableStringify(m1), stableStringify(m2));
  assert.deepEqual(r1, r2);
});

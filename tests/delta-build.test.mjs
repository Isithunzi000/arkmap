// delta-build: .arkdelta writer — buildDelta, compaction rules, serializeDeltaOps,
// determinism, round-trip through the validator (H2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDelta, serializeDeltaOps, DELTA_EXPORTABLE, _compactDeltaOps } from '../src/delta-build.js';
import { validateDeltaText, computeBaseInfo, deltaChecksums, ARKDELTA_FORMAT, ARKDELTA_FORMAT_VERSION } from '../src/delta-validate.js';
import { stableStringify } from '../src/stable-stringify.js';
import { diffMaps } from '../src/diff.js';

const base = { crc: 'abc123', areas: { '1': 'ff00' } };
const room = (id, x, env) => ({ id, x, y: 0, z: 0, exits: {}, env });
const edit = (id, envB, envA, label) => ({ type: 'EDIT_ROOM', roomId: id, before: room(id, 1, envB), after: room(id, 1, envA), label });
const opsOf = text => JSON.parse(text).ops;

test('envelope v3 + checksums + ops_count + base in meta', () => {
  const text = buildDelta([edit(5, 1, 2, 'e1')], base, { appVersion: '1.0.0' });
  const d = JSON.parse(text);
  assert.equal(d.format, ARKDELTA_FORMAT);
  assert.equal(d.format_version, ARKDELTA_FORMAT_VERSION);
  assert.equal(d.meta.ops_count, d.ops.length);
  assert.deepEqual(d.meta.base, base);
  assert.equal(d.meta.app_version, '1.0.0');
  assert.deepEqual(d.checksums, deltaChecksums(d.meta, d.ops));
});

test('no appVersion → field omitted; opts do not leak into meta', () => {
  const d = JSON.parse(buildDelta([edit(5, 1, 2)], base));
  assert.equal('app_version' in d.meta, false);
});

test('deterministic: same log + base → byte-identical text', () => {
  const log = [edit(5, 1, 2, 'a'), edit(5, 2, 3, 'b'), { type: 'ADD_ROOM', roomId: 9, areaId: 1, roomData: room(9, 3), label: 'c' }];
  assert.equal(buildDelta(log, base), buildDelta(log, base));
});

test('round trip: buildDelta output always validates', () => {
  const log = [
    { type: 'ADD_ROOM', roomId: 501, areaId: 1, roomData: room(501, 10), label: 'a' },
    { type: 'EDIT_ROOM', roomId: 501, before: room(501, 10), after: { ...room(501, 10), env: 9 }, label: 'b' },
    { type: 'ADD_EXIT', sourceId: 501, dir: 'w', targetId: 7, bidirectional: true, label: 'c' },
    { type: 'PAINT_BATCH', changes: [{ roomId: 501, beforeEnv: 9, afterEnv: 3 }], label: 'd' },
  ];
  const r = validateDeltaText(buildDelta(log, computeBaseInfo(null) || base));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('rule 1: edit chain — first before, last after; equal states vanish', () => {
  const ops = opsOf(buildDelta([edit(5, 1, 2, 'a'), edit(5, 2, 3, 'b'), edit(5, 3, 1, 'c')], base));
  assert.equal(ops.length, 0); // 1→2→3→1 folds to before==after → vanish
  const ops2 = opsOf(buildDelta([edit(5, 1, 2, 'a'), edit(5, 2, 3, 'b')], base));
  assert.equal(ops2.length, 1);
  // note: buildDelta strips empty containers (exits: {} etc.) from room payloads
  assert.deepEqual(ops2[0].payload.before, { id: 5, x: 1, y: 0, z: 0, env: 1 });
  assert.deepEqual(ops2[0].payload.after, { id: 5, x: 1, y: 0, z: 0, env: 3 });
  assert.equal(ops2[0].label, 'b'); // label of the last component
  assert.equal(ops2[0].seq, 1);
});

test('different rooms → no folding', () => {
  const ops = opsOf(buildDelta([edit(5, 1, 2), edit(6, 1, 2)], base));
  assert.equal(ops.length, 2);
});

test('rule 2: ADD_ROOM + EDIT + MOVE → single ADD with final state', () => {
  const log = [
    { type: 'ADD_ROOM', roomId: 9, areaId: 1, roomData: room(9, 3, 1), label: 'a' },
    edit(9, 1, 7, 'b'),
    { type: 'MOVE_ROOM', roomId: 9, fromX: 3, fromY: 0, fromZ: 0, toX: 8, toY: 0, toZ: 0, label: 'c' },
  ];
  const ops = opsOf(buildDelta(log, base));
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, 'ADD_ROOM');
  assert.equal(ops[0].payload.room.env, 7);
  assert.equal(ops[0].payload.room.x, 8);
  assert.equal(ops[0].payload.room.id, 'd:1'); // sid allocated in log order
});

test('rule 5: ADD + DELETE pair vanishes, seq renumbered', () => {
  const log = [
    { type: 'ADD_ROOM', roomId: 9, areaId: 1, roomData: room(9, 3), label: 'a' },
    { type: 'DELETE_ROOM', roomId: 9, areaId: 1, snapshot: room(9, 3), label: 'b' },
    edit(5, 1, 2, 'c'),
  ];
  const ops = opsOf(buildDelta(log, base));
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, 'EDIT_ROOM');
  assert.equal(ops[0].seq, 1);
});

test('rule 6: paint batches merge with per-room collapse (first before, last after)', () => {
  const log = [
    { type: 'PAINT_BATCH', changes: [{ roomId: 5, beforeEnv: 1, afterEnv: 2 }, { roomId: 6, beforeEnv: 3, afterEnv: 4 }], label: 'a' },
    { type: 'PAINT_BATCH', changes: [{ roomId: 5, beforeEnv: 2, afterEnv: 9 }], label: 'b' },
  ];
  const ops = opsOf(buildDelta(log, base));
  assert.equal(ops.length, 1);
  assert.equal(ops[0].payload.changes.length, 2);
  const ch5 = ops[0].payload.changes.find(c => c.roomId === 5);
  assert.equal(ch5.beforeEnv, 1);
  assert.equal(ch5.afterEnv, 9);
  assert.equal(ops[0].label, 'b');
});

test('intervening reference blocks the chain (graph, not adjacency)', () => {
  // ADD_CL on room 10, then an op whose room exits point at 10, then EDIT_CL on 10
  // — the exit op closes the cl chain, so no folding across it.
  const log = [
    { type: 'ADD_CL', roomId: 10, dir: 'e', snapshot: { points: [[0, 0]] }, label: 'a' },
    { type: 'EDIT_ROOM', roomId: 7, before: room(7, 1), after: { ...room(7, 1), exits: { e: 10 } }, label: 'x' },
    { type: 'EDIT_CL', roomId: 10, dir: 'e', before: { points: [[0, 0]] }, after: { points: [[1, 1]] }, label: 'b' },
  ];
  const ops = opsOf(buildDelta(log, base));
  assert.equal(ops.length, 3);
});

test('sid: ADD assigns d:N in order, references translated, sid dies at DELETE', () => {
  const log = [
    { type: 'ADD_ROOM', roomId: 100, areaId: 1, roomData: { ...room(100, 1), exits: { e: 7 } }, label: 'a' },
    { type: 'ADD_ROOM', roomId: 200, areaId: 1, roomData: { ...room(200, 2), exits: { w: 100 } }, label: 'b' },
    { type: 'DELETE_ROOM', roomId: 100, areaId: 1, snapshot: room(100, 1), label: 'c' },
  ];
  const ops = opsOf(buildDelta(log, base));
  // ADD d:1 (room 100), ADD d:2 (room 200, exit w → d:1), DELETE d:1
  assert.equal(ops[0].target.roomId, 'd:1');
  assert.equal(ops[1].target.roomId, 'd:2');
  assert.equal(ops[1].payload.room.exits.w, 'd:1');
  assert.equal(ops[2].target.roomId, 'd:1');
});

test('unknown entry types are skipped; DELTA_EXPORTABLE mirrors the switch', () => {
  const ops = opsOf(buildDelta([{ type: 'ACCEPT_DIR_ISSUES', roomId: 1 }, edit(5, 1, 2)], base));
  assert.equal(ops.length, 1);
  assert.equal(DELTA_EXPORTABLE.size, 25);
  assert.ok(DELTA_EXPORTABLE.has('EDIT_ENV_COLOR') && DELTA_EXPORTABLE.has('AUTO_FIX_SUPPRESSORS'));
});

test('serializeDeltaOps: compaction + seq 1..N + fresh checksums, input untouched', () => {
  const ops = [
    { seq: 9, type: 'EDIT_ROOM', target: { roomId: 5 }, payload: { before: room(5, 1, 1), after: room(5, 1, 2) }, label: 'a' },
    { seq: 7, type: 'EDIT_ROOM', target: { roomId: 5 }, payload: { before: room(5, 1, 2), after: room(5, 1, 3) }, label: 'b' },
  ];
  const frozen = stableStringify(ops);
  const text = serializeDeltaOps(ops, base);
  assert.equal(stableStringify(ops), frozen); // originals not modified
  const d = JSON.parse(text);
  assert.equal(d.ops.length, 1); // folded
  assert.equal(d.ops[0].seq, 1);
  assert.equal(d.meta.ops_count, 1);
  assert.deepEqual(d.checksums, deltaChecksums(d.meta, d.ops));
  assert.equal(validateDeltaText(text).ok, true);
});

test('diffMaps → buildDelta: generated delta validates (EN + PL labels)', () => {
  const mk = () => ({ format: 'arkmap', format_version: 2, meta: { map_name: 'T' }, colors: {},
    areas: [{ id: 1, name: 'A', rooms: [{ id: 1, x: 0, y: 0, z: 0, exits: { e: 2 } }, { id: 2, x: 1, y: 0, z: 0, exits: { w: 1 } }] }] });
  const a = mk(), b = mk();
  b.areas[0].rooms[0].env = 5;
  b.areas[0].rooms.push({ id: 3, x: 2, y: 0, z: 0, exits: {} });
  for (const loc of [undefined, 'pl']) {
    const { entries } = diffMaps(a, b, loc ? { locale: loc } : undefined);
    const r = validateDeltaText(buildDelta(entries, base));
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  }
});

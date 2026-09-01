// delta-build.js — .arkdelta writer: buildDelta (op-log → delta file text),
// deterministic log compaction, op serialization.
//
// .arkdelta is the edit-delta format of ArkMap Studio: an ordered op log
// (25 op types) over a base map, with canonical XXH3-64 checksums.
// Reader side lives in delta-validate.js. Spec: docs/arkdelta_spec.html
// (Studio repo).
//
// Origin: ArkMap Studio @ 24bd902 (pinned extract source), ARKDELTA block:
// _deltaStripRoom, _deltaOpRefs, _deltaChainKey, _deltaTryFold,
// _compactDeltaOps, buildDelta, _DELTA_EXPORTABLE, _deltaSerializeOps.
// Maintained module — tracked in EXTRACT_MANIFEST.json.
//
// Divergences from the Studio source:
// - log and base are explicit parameters (Studio falls back to global state)
// - meta.app_version comes from opts.appVersion (Studio reads its global
//   APP_VERSION); when omitted, the field is not written
// - file-save glue, suggested names and signing stay in Studio (npm verifies
//   signatures, it does not create them — see delta-validate.js)
//
// Determinism: same (log, base, opts) → byte-identical file text
// (stableStringify canonical form, sid allocation in log order, deterministic
// compaction). Op labels are copied from the log entries verbatim — localize
// them at production time (diffMaps accepts opts.locale).

import { stableStringify } from './stable-stringify.js';
import { _stripRoomDefaults } from './checksum.js';
import {
  ARKDELTA_FORMAT, ARKDELTA_FORMAT_VERSION, deltaChecksums,
} from './delta-validate.js';

// Spec-clean room clone: no internal `area` field, no empty containers.
// Collective-field order canonicalized (serialization guard, NOT an engine
// change): the .dat loader keeps file order, the .arkmap loader sorts —
// without the sort, delta bytes would depend on the load path.
function _deltaStripRoom(room) {
  const c = JSON.parse(JSON.stringify(room));
  delete c.area;
  _stripRoomDefaults(c);
  if (c.stubs) c.stubs.sort();
  if (c.exit_locks) c.exit_locks.sort();
  if (c.special_exit_locks) c.special_exit_locks.sort();
  return c;
}

// Reference set of an op — room:/area:/label:/env: tokens used by the
// compactor to close chains that a later op could invalidate.
function _deltaOpRefs(op) {
  const refs = new Set();
  const room = id => { if (id !== undefined && id !== null) refs.add('room:' + id); };
  const area = id => { if (id !== undefined && id !== null) refs.add('area:' + id); };
  const roomObj = r => {
    if (!r || typeof r !== 'object') return;
    room(r.id);
    if (r.exits)         for (const k of Object.keys(r.exits))         room(r.exits[k]);
    if (r.special_exits) for (const k of Object.keys(r.special_exits)) room(r.special_exits[k]);
  };
  const T = op.target || {}, P = op.payload || {};
  switch (op.type) {
    case 'ADD_ROOM': case 'DELETE_ROOM': room(T.roomId); area(T.areaId); roomObj(P.room); break;
    case 'EDIT_ROOM': case 'EDIT_EXIT':  room(T.roomId); roomObj(P.before); roomObj(P.after); break;
    case 'MOVE_ROOM': room(T.roomId); break;
    case 'MOVE_ROOM_TO_AREA': room(T.roomId); area(P.fromAreaId); area(P.toAreaId); break;
    case 'ADD_EXIT': room(T.sourceId); room(P.targetId); break;
    case 'DELETE_EXIT': room(T.roomId); room(P.exitId); break;
    case 'DELETE_SPECIAL_EXIT': room(T.roomId); room(P.targetId); break;
    case 'ADD_AREA': case 'DELETE_AREA': case 'EDIT_AREA': area(T.areaId); break;
    case 'ADD_CL': case 'EDIT_CL': case 'DELETE_CL':
    case 'ADD_SUPPRESSOR': case 'DELETE_SUPPRESSOR': room(T.roomId); break;
    case 'AUTO_FIX_SUPPRESSORS':
      (P.added || []).forEach(x => room(x.roomId));
      (P.removed || []).forEach(x => room(x.roomId)); break;
    case 'PAINT_BATCH': (P.changes || []).forEach(ch => room(ch.roomId)); break;
    case 'ADD_LABEL': case 'DELETE_LABEL':
      area(T.areaId);
      if (P.label && P.label.id !== undefined) refs.add('label:' + T.areaId + ':' + P.label.id);
      break;
    case 'EDIT_LABEL': case 'MOVE_LABEL': case 'RESIZE_LABEL':
      area(T.areaId);
      if (T.labelId !== undefined) refs.add('label:' + T.areaId + ':' + T.labelId);
      break;
    case 'EDIT_ENV_COLOR': refs.add('env:' + T.envId); break;
  }
  return refs;
}

// Chain key — ops with the same key are fold candidates (see _deltaTryFold).
function _deltaChainKey(op) {
  const T = op.target || {};
  switch (op.type) {
    case 'ADD_ROOM': case 'DELETE_ROOM': case 'EDIT_ROOM': case 'EDIT_EXIT': case 'MOVE_ROOM':
      return T.roomId !== undefined ? 'room:' + T.roomId : null;
    case 'ADD_AREA': case 'DELETE_AREA': case 'EDIT_AREA':
      return T.areaId !== undefined ? 'area:' + T.areaId : null;
    case 'ADD_LABEL': {
      const id = op.payload && op.payload.label ? op.payload.label.id : undefined;
      return id !== undefined ? 'label:' + T.areaId + ':' + id : null;
    }
    case 'DELETE_LABEL': case 'EDIT_LABEL': case 'MOVE_LABEL': case 'RESIZE_LABEL':
      return T.labelId !== undefined ? 'label:' + T.areaId + ':' + T.labelId : null;
    case 'ADD_CL': case 'EDIT_CL': case 'DELETE_CL':
      return 'cl:' + T.roomId + ':' + T.dir;
    case 'ADD_SUPPRESSOR': case 'DELETE_SUPPRESSOR':
      return 'sup:' + T.roomId + ':' + T.dir;
    case 'EDIT_ENV_COLOR': return 'env:' + T.envId;
    case 'PAINT_BATCH': return 'paint';
  }
  return null;
}

// Attempt to absorb op into the chain head (mutates head). Returns:
// 'folded' (absorbed), 'vanish' (the pair cancels out — remove the head),
// or null (not foldable).
function _deltaTryFold(head, op) {
  const eq = (a, b) => stableStringify(a) === stableStringify(b);
  switch (head.type + '|' + op.type) {
    // Rule 1: EDIT_ROOM/EDIT_EXIT chain — first before, last after; vanishes when equal.
    case 'EDIT_ROOM|EDIT_ROOM': case 'EDIT_ROOM|EDIT_EXIT':
    case 'EDIT_EXIT|EDIT_ROOM': case 'EDIT_EXIT|EDIT_EXIT':
      head.payload.after = op.payload.after; head.label = op.label;
      return eq(head.payload.before, head.payload.after) ? 'vanish' : 'folded';
    // Rule 2: ADD + later edits/moves of that sid → a single ADD with the final state.
    case 'ADD_ROOM|EDIT_ROOM': case 'ADD_ROOM|EDIT_EXIT':
      head.payload.room = op.payload.after; head.label = op.label; return 'folded';
    case 'ADD_ROOM|MOVE_ROOM':
      head.payload.room.x = op.payload.toX; head.payload.room.y = op.payload.toY; head.payload.room.z = op.payload.toZ;
      head.label = op.label; return 'folded';
    case 'ADD_ROOM|MOVE_ROOM_TO_AREA':
      head.target.areaId = op.payload.toAreaId; head.label = op.label; return 'folded';
    case 'ADD_AREA|EDIT_AREA':
      head.payload.area.name = op.payload.name;
      head.payload.area.user_data = op.payload.user_data;
      head.label = op.label; return 'folded';
    case 'ADD_LABEL|EDIT_LABEL':
      head.payload.label = op.payload.after; head.label = op.label; return 'folded';
    case 'ADD_LABEL|MOVE_LABEL':
      head.payload.label.x = op.payload.toX; head.payload.label.y = op.payload.toY;
      head.label = op.label; return 'folded';
    case 'ADD_LABEL|RESIZE_LABEL':
      head.payload.label.x = op.payload.toX; head.payload.label.y = op.payload.toY;
      head.payload.label.width = op.payload.toW; head.payload.label.height = op.payload.toH;
      head.label = op.label; return 'folded';
    case 'ADD_CL|EDIT_CL':
      head.payload.cl = op.payload.after; head.label = op.label; return 'folded';
    // Rule 3: MOVE_ROOM chain — first from*, last to*.
    case 'MOVE_ROOM|MOVE_ROOM':
      head.payload.toX = op.payload.toX; head.payload.toY = op.payload.toY; head.payload.toZ = op.payload.toZ;
      head.label = op.label; return 'folded';
    // Rule 4: EDIT_ENV_COLOR per envId — first oldColor, last newColor.
    case 'EDIT_ENV_COLOR|EDIT_ENV_COLOR':
      head.payload.newColor = op.payload.newColor; head.label = op.label; return 'folded';
    // Rule 5: ADD + DELETE of the same object cancels out.
    case 'ADD_ROOM|DELETE_ROOM': case 'ADD_AREA|DELETE_AREA': case 'ADD_LABEL|DELETE_LABEL':
    case 'ADD_CL|DELETE_CL': case 'ADD_SUPPRESSOR|DELETE_SUPPRESSOR':
      return 'vanish';
    // Rule 6: paint-batch merge + per-roomId collapse (first before, last after).
    case 'PAINT_BATCH|PAINT_BATCH': {
      const byRoom = new Map();
      for (const ch of [...(head.payload.changes || []), ...(op.payload.changes || [])]) {
        const k = String(ch.roomId);
        if (byRoom.has(k)) { const c = byRoom.get(k); c.afterEnv = ch.afterEnv; c.afterSymbol = ch.afterSymbol; }
        else byRoom.set(k, Object.assign({}, ch));
      }
      head.payload.changes = [...byRoom.values()];
      head.label = op.label; return 'folded';
    }
  }
  return null;
}

// Log compaction (spec .arkdelta §8) — deterministic, output seq 1..N.
// Folds redundant op chains (edit→edit, add→edit, add→delete, paint merges)
// without changing the applied result; closes chains that a later op's
// reference set could invalidate. Idempotent on already-compacted input.
function _compactDeltaOps(ops) {
  const out = [];            // merged ops (null = hole after vanish)
  const open = new Map();    // chain key -> head index in out
  const keyMeta = new Map();     // key -> { t: 'room'|'area', id } (index bookkeeping)
  const clByRoom = new Map();    // roomId -> Set of open 'cl:'/'sup:' keys of that room
  const labelByArea = new Map(); // areaId -> Set of open 'label:' keys of that area
  const _openChain = (k, idx, op) => {
    open.set(k, idx);
    const T = op.target || {};
    if (k.startsWith('cl:') || k.startsWith('sup:')) {
      const id = String(T.roomId);
      keyMeta.set(k, { t: 'room', id });
      let s = clByRoom.get(id); if (!s) clByRoom.set(id, s = new Set());
      s.add(k);
    } else if (k.startsWith('label:')) {
      const id = String(T.areaId);
      keyMeta.set(k, { t: 'area', id });
      let s = labelByArea.get(id); if (!s) labelByArea.set(id, s = new Set());
      s.add(k);
    }
  };
  const _closeChain = (k) => {
    if (!open.has(k)) return;
    open.delete(k);
    const m = keyMeta.get(k);
    if (!m) return;
    keyMeta.delete(k);
    const idxMap = m.t === 'room' ? clByRoom : labelByArea;
    const s = idxMap.get(m.id);
    if (s) { s.delete(k); if (s.size === 0) idxMap.delete(m.id); }
  };
  const _blockByRefs = (refs, exceptKey) => {
    for (const r of refs) {
      if (r !== exceptKey) _closeChain(r);                     // exact key hit (r === k)
      if (r.startsWith('room:')) {
        const s = clByRoom.get(r.slice(5));
        if (s) for (const k of [...s]) { if (k !== exceptKey) _closeChain(k); }
        if (exceptKey !== 'paint') _closeChain('paint');
      } else if (r.startsWith('area:')) {
        const s = labelByArea.get(r.slice(5));
        if (s) for (const k of [...s]) { if (k !== exceptKey) _closeChain(k); }
      }
    }
  };
  for (const src of ops) {
    const op = { seq: 0, type: src.type,
                 target: JSON.parse(JSON.stringify(src.target || {})),
                 payload: JSON.parse(JSON.stringify(src.payload || {})),
                 label: src.label || '' };
    if (op.type === 'PAINT_BATCH') {
      // rule 6 within a single batch: per-roomId collapse (first before, last after)
      const byRoom = new Map();
      for (const ch of (op.payload.changes || [])) {
        const k = String(ch.roomId);
        if (byRoom.has(k)) { const c = byRoom.get(k); c.afterEnv = ch.afterEnv; c.afterSymbol = ch.afterSymbol; }
        else byRoom.set(k, ch);
      }
      op.payload.changes = [...byRoom.values()];
    }
    const key = _deltaChainKey(op);
    const refs = _deltaOpRefs(op);
    let foldedInto = null;
    if (key !== null && open.has(key)) {
      const hi = open.get(key);
      const r = _deltaTryFold(out[hi], op);
      if (r === 'folded') foldedInto = key;
      else if (r === 'vanish') { out[hi] = null; _closeChain(key); foldedInto = key; }
    }
    _blockByRefs(refs, foldedInto);
    if (!foldedInto) {
      // Unabsorbed op: goes into the file; only types that have continuations
      // open a chain head (DELETE_* never — their only role is the vanish pair).
      if (key !== null && !/^DELETE_/.test(op.type)) { _openChain(key, out.length, op); }
      out.push(op);
    }
  }
  return out.filter(Boolean).map((o, i) => { o.seq = i + 1; return o; });
}

// Entry types exportable to a delta — MIRROR of buildDelta's switch (25 types).
// An entry outside the set (e.g. meta-data acceptances) is skipped by
// buildDelta (default: continue); consumers can use this set to detect a log
// with zero exportable ops up front.
const DELTA_EXPORTABLE = new Set([
  'ADD_ROOM', 'DELETE_ROOM', 'EDIT_ROOM', 'EDIT_EXIT', 'PAINT_BATCH',
  'MOVE_ROOM', 'MOVE_ROOM_TO_AREA', 'ADD_EXIT', 'DELETE_EXIT', 'DELETE_SPECIAL_EXIT',
  'ADD_AREA', 'DELETE_AREA', 'EDIT_AREA', 'ADD_CL', 'EDIT_CL',
  'DELETE_CL', 'DELETE_SUPPRESSOR', 'ADD_SUPPRESSOR', 'AUTO_FIX_SUPPRESSORS',
  'ADD_LABEL', 'EDIT_LABEL', 'DELETE_LABEL', 'MOVE_LABEL', 'RESIZE_LABEL',
  'EDIT_ENV_COLOR',
]);

// buildDelta(log, base, opts?) → .arkdelta file text.
//   log:  deltaLog entries (the shape diffMaps returns / Studio's edit log)
//   base: base-map identity from computeBaseInfo() (recorded in meta.base)
//   opts.appVersion: producer version string recorded in meta.app_version
// One pass — a sid is born at ADD, dies at DELETE (live* maps below).
// Compaction D5 runs before serialization; envelope v3 (D1): format /
// format_version / checksums top-level; meta = base + provenance + bookkeeping.
function buildDelta(log, base, opts) {
  log = log || [];
  base = base || {};
  let counter = 0;
  const liveRoom = new Map(), liveArea = new Map(), liveLabel = new Map();
  const rId = id => (typeof id === 'number' && liveRoom.has(id)) ? liveRoom.get(id) : id;
  const aId = id => (typeof id === 'number' && liveArea.has(id)) ? liveArea.get(id) : id;
  const lKey = (areaId, labelId) => aId(areaId) + ':' + labelId;
  const lId = (areaId, labelId) => liveLabel.get(lKey(areaId, labelId)) ?? labelId;

  function rwRoom(room) {
    const c = _deltaStripRoom(room);
    if (liveRoom.has(c.id)) c.id = liveRoom.get(c.id);
    if (c.exits)          for (const k of Object.keys(c.exits))          c.exits[k] = rId(c.exits[k]);
    if (c.special_exits)  for (const k of Object.keys(c.special_exits))  c.special_exits[k] = rId(c.special_exits[k]);
    return c;
  }

  // Op emission (single pass)
  const ops = [];
  let seq = 0;
  for (const e of log) {
    let target = null, payload = null;
    switch (e.type) {
      case 'ADD_ROOM': {
        const sid = 'd:' + (++counter);
        liveRoom.set(e.roomId, sid);
        target = { roomId: sid, areaId: aId(e.areaId) };
        payload = { room: rwRoom(e.roomData) };
        break;
      }
      case 'DELETE_ROOM':
        target = { roomId: rId(e.roomId), areaId: aId(e.areaId) };
        payload = { room: rwRoom(e.snapshot) };
        liveRoom.delete(e.roomId);
        break;
      case 'EDIT_ROOM': case 'EDIT_EXIT':
        target = { roomId: rId(e.roomId) };
        payload = { before: rwRoom(e.before), after: rwRoom(e.after) };
        break;
      case 'PAINT_BATCH':
        target = {};
        payload = { changes: (e.changes || []).map(ch => ({
          roomId: rId(ch.roomId), beforeEnv: ch.beforeEnv, beforeSymbol: ch.beforeSymbol,
          afterEnv: ch.afterEnv, afterSymbol: ch.afterSymbol })) };
        break;
      case 'MOVE_ROOM':
        target = { roomId: rId(e.roomId) };
        payload = { fromX: e.fromX, fromY: e.fromY, fromZ: e.fromZ, toX: e.toX, toY: e.toY, toZ: e.toZ };
        break;
      case 'MOVE_ROOM_TO_AREA':
        target = { roomId: rId(e.roomId) };
        payload = { fromAreaId: aId(e.fromAreaId), toAreaId: aId(e.toAreaId) };
        break;
      case 'ADD_EXIT':
        target = { sourceId: rId(e.sourceId), dir: e.dir };
        payload = { targetId: rId(e.targetId), bidirectional: !!e.bidirectional };
        break;
      case 'DELETE_EXIT':
        target = { roomId: rId(e.roomId), dir: e.dir };
        payload = {};
        if (e.snap && e.snap.exitId !== undefined) payload.exitId = rId(e.snap.exitId);
        break;
      case 'DELETE_SPECIAL_EXIT':
        target = { roomId: rId(e.roomId) };
        payload = { cmd: e.snap.cmd };
        if (e.snap.targetId !== undefined) payload.targetId = rId(e.snap.targetId);
        break;
      case 'ADD_AREA': {
        const sid = 'd:' + (++counter);
        liveArea.set(e.areaId, sid);
        const area = JSON.parse(JSON.stringify(e.areaData));
        area.id = sid;
        area.rooms = []; area.labels = [];
        target = { areaId: sid };
        payload = { area };
        break;
      }
      case 'DELETE_AREA':
        target = { areaId: aId(e.areaId) };
        payload = { name: e.snapshot && e.snapshot.name || '' };
        liveArea.delete(e.areaId);
        break;
      case 'EDIT_AREA':
        target = { areaId: aId(e.areaId) };
        payload = {
          name: e.after.name, user_data: e.after.user_data || {},
          beforeName: e.before.name, beforeUserData: e.before.user_data || {},
        };
        break;
      case 'ADD_CL':
        target = { roomId: rId(e.roomId), dir: e.dir };
        payload = { cl: JSON.parse(JSON.stringify(e.snapshot)) };
        break;
      case 'EDIT_CL':
        target = { roomId: rId(e.roomId), dir: e.dir };
        payload = { before: JSON.parse(JSON.stringify(e.before)), after: JSON.parse(JSON.stringify(e.after)) };
        break;
      case 'DELETE_CL': case 'DELETE_SUPPRESSOR':
        target = { roomId: rId(e.roomId), dir: e.dir };
        payload = e.snapshot ? { cl: JSON.parse(JSON.stringify(e.snapshot)) } : {};
        break;
      case 'ADD_SUPPRESSOR':
        target = { roomId: rId(e.roomId), dir: e.dir };
        payload = {};
        break;
      case 'AUTO_FIX_SUPPRESSORS':
        target = {};
        payload = {
          added:   (e.added   || []).map(x => ({ roomId: rId(x.roomId), dir: x.dir, cl: JSON.parse(JSON.stringify(x.snapshot)) })),
          removed: (e.removed || []).map(x => ({ roomId: rId(x.roomId), dir: x.dir })),
        };
        break;
      case 'ADD_LABEL': {
        const sid = 'd:' + (++counter);
        liveLabel.set(lKey(e.areaId, e.snapshot.id), sid);
        const lbl = JSON.parse(JSON.stringify(e.snapshot));
        lbl.id = sid;
        target = { areaId: aId(e.areaId) };
        payload = { label: lbl };
        break;
      }
      case 'EDIT_LABEL': {
        const before = JSON.parse(JSON.stringify(e.before));
        const after  = JSON.parse(JSON.stringify(e.after));
        before.id = lId(e.areaId, before.id);
        after.id  = lId(e.areaId, after.id);
        target = { areaId: aId(e.areaId), labelId: lId(e.areaId, e.labelId) };
        payload = { before, after };
        break;
      }
      case 'DELETE_LABEL': {
        const lbl = JSON.parse(JSON.stringify(e.snapshot));
        const sid = lId(e.areaId, lbl.id);
        lbl.id = sid;
        target = { areaId: aId(e.areaId), labelId: sid };
        payload = { label: lbl };
        liveLabel.delete(lKey(e.areaId, e.snapshot.id));
        break;
      }
      case 'MOVE_LABEL':
        target = { areaId: aId(e.areaId), labelId: lId(e.areaId, e.labelId) };
        payload = { fromX: e.fromX, fromY: e.fromY, toX: e.toX, toY: e.toY };
        break;
      case 'RESIZE_LABEL':
        target = { areaId: aId(e.areaId), labelId: lId(e.areaId, e.labelId) };
        payload = { fromX: e.fromX, fromY: e.fromY, fromW: e.fromW, fromH: e.fromH, toX: e.toX, toY: e.toY, toW: e.toW, toH: e.toH };
        break;
      case 'EDIT_ENV_COLOR':
        target = { envId: e.envId };
        payload = { oldColor: e.oldColor, newColor: e.newColor };
        break;
      default:
        continue; // unknown entry type skipped at export (should not happen)
    }
    ops.push({ seq: ++seq, type: e.type, target, payload, label: e.label || '' });
  }

  // D5: log compaction before serialization (spec §8) — deterministic, seq 1..N.
  const cps = _compactDeltaOps(ops);
  // Envelope v3 (D1): format/format_version/checksums top-level.
  const meta = { ops_count: cps.length, base };
  const appVersion = opts && opts.appVersion;
  if (appVersion !== undefined) meta.app_version = appVersion;
  const checksums = deltaChecksums(meta, cps);
  return stableStringify({ format: ARKDELTA_FORMAT, format_version: ARKDELTA_FORMAT_VERSION, meta, ops: cps, checksums });
}

// Serialize a delta from given ops (meta + checksums computed fresh).
// Envelope v3: compaction D5 (idempotent on already-compacted input) + seq 1..N
// (works on copies — the originals are not modified).
function serializeDeltaOps(ops, base, opts) {
  ops = _compactDeltaOps(ops);
  const meta = { ops_count: ops.length, base: base || {} };
  const appVersion = opts && opts.appVersion;
  if (appVersion !== undefined) meta.app_version = appVersion;
  const checksums = deltaChecksums(meta, ops);
  return stableStringify({ format: ARKDELTA_FORMAT, format_version: ARKDELTA_FORMAT_VERSION, meta, ops, checksums });
}

export { buildDelta, serializeDeltaOps, DELTA_EXPORTABLE, _compactDeltaOps, _deltaStripRoom };

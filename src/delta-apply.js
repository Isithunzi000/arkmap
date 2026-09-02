// delta-apply.js — .arkdelta apply: pure, in-place application of a delta to
// an .arkmap map, with Studio-exact op semantics and per-op isolation.
//
// .arkdelta is the edit-delta format of ArkMap Studio (25 op types).
// Reader: delta-validate.js; writer: delta-build.js.
// Spec: docs/arkdelta_spec.html (Studio repo).
//
// Origin: ArkMap Studio @ 24bd902 (pinned extract source) — applyDelta plus
// the data semantics of its commit layer (commitAddExit, commitDeleteExit,
// commitMoveRoom, commitDeleteArea, deleteRoom) and the undo-redo dispatcher.
// Maintained module — tracked in EXTRACT_MANIFEST.json.
//
// Divergences from the Studio source:
// - the map is an explicit parameter (Studio uses global state); indexes
//   (roomById / roomArea / areas) are built once, used during the pass
// - no undo entries, no redraw, no toasts — Studio glue stays in Studio
//   (undo can be reconstructed as the inverse delta at the Studio layer)
// - Studio's editMode guard is conceptually always on (the package has no
//   view/edit distinction)
// - skip reasons come from locale.js catalogs (opts.locale, EN default;
//   PL byte-pinned to Studio); skipped entries carry a stable `code`
// - room.area backlinks are maintained exactly like Studio's live model
//   (canonical serialization strips them at save)
//
// Contract: mutates `map` in place; `delta` is never modified (ops are
// deep-cloned through translation). Per-op isolation: a failing op is
// skipped with a reason and the rest of the delta still applies (no
// rollback — rollback would fight selective application). Deterministic:
// same (map, delta, opts) → same result and same report.
//
// applyDelta(map, delta, opts?) → { applied, appliedSeqs, skipped }
//   opts.onlySeq   — Set/array of seq numbers: apply only these ops
//                    (deselected ops are skipped silently)
//   opts.overrides — Map/object seq → { x, y }: fallback positions for
//                    ADD_ROOM / MOVE_ROOM; re-validated fail-closed just
//                    before the commit (occupied cell = skip, zero mutation)
//   opts.seedSids  — Map/object/array of [sid, id] pairs: pre-resolved sid →
//                    live id (executed ADDs override the seed)
//   opts.locale    — 'en' (default) | 'pl' for skip reasons

import { stableStringify } from './stable-stringify.js';
import { OPPOSITE } from './opposite.js';
import { translate } from './locale.js';
import { _deltaSidRefSlots } from './delta-validate.js';
import { _deltaStripRoom } from './delta-build.js';

const _DELTA_SID_RE = /^d:[1-9][0-9]*$/;

const _clone = v => JSON.parse(JSON.stringify(v));

// ── index over the live map (Studio's state.roomById/roomArea/areas) ──
function _indexMap(map) {
  const st = { map, roomById: {}, roomArea: {}, areas: new Map() };
  for (const area of (map.areas || [])) {
    st.areas.set(area.id, area);
    for (const r of (area.rooms || [])) { st.roomById[r.id] = r; st.roomArea[r.id] = area.id; }
  }
  return st;
}

function _roomAt(st, areaId, x, y, z) {
  const area = st.areas.get(areaId);
  if (!area) return null;
  for (const r of (area.rooms || [])) if (r.x === x && r.y === y && (r.z ?? 0) === (z ?? 0)) return r;
  return null;
}

function _maxRoomId(st)  { let m = 0; for (const id of Object.keys(st.roomById)) m = Math.max(m, +id); return m; }
function _maxAreaId(st)  { let m = 0; for (const id of st.areas.keys()) m = Math.max(m, id); return m; }
function _maxLabelId(area) { let m = 0; for (const l of (area.labels || [])) m = Math.max(m, l.id); return m; }

// Translates sid → fresh id in a deep clone of the op — ONLY in reference
// positions (user texts are never substituted).
function _translateOp(obj, sidMap) {
  const c = _clone(obj);
  if (!sidMap.size) return c;
  for (const [o, k] of _deltaSidRefSlots(c)) {
    const v = o[k];
    if (typeof v === 'string' && sidMap.has(v)) o[k] = sidMap.get(v);
  }
  return c;
}

// Clean field replace (Studio _replaceRoomData): delete all keys, assign the
// snapshot, restore the redundant room.area backlink from the index.
function _replaceRoomData(st, room, snapshot) {
  for (const k of Object.keys(room)) delete room[k];
  Object.assign(room, snapshot);
  if (room.id !== undefined && st.roomArea[room.id] !== undefined)
    room.area = st.roomArea[room.id];
}

// Data semantics of the undo-redo dispatcher for the entry types applyDelta
// routes through it (edit-style ops). Mutates the live map.
function _applyEditEntry(st, entry) {
  const rm = id => st.roomById[id];
  switch (entry.type) {
    case 'EDIT_ROOM': case 'EDIT_EXIT': {
      const r = rm(entry.roomId); if (!r) break;
      _replaceRoomData(st, r, _clone(entry.after));
      break;
    }
    case 'ADD_CL': {
      const r = rm(entry.roomId); if (!r) break;
      r.custom_lines = r.custom_lines || {};
      r.custom_lines[entry.dir] = _clone(entry.snapshot);
      break;
    }
    case 'EDIT_CL': {
      const r = rm(entry.roomId); if (!r) break;
      if (r.custom_lines) r.custom_lines[entry.dir] = _clone(entry.after);
      break;
    }
    case 'ADD_SUPPRESSOR': {
      const r = rm(entry.roomId); if (!r) break;
      r.custom_lines = r.custom_lines || {};
      r.custom_lines[entry.dir] = { points: [], color: [255, 0, 0] };
      break;
    }
    case 'DELETE_CL': case 'DELETE_SUPPRESSOR': {
      const r = rm(entry.roomId); if (!r) break;
      if (r.custom_lines) delete r.custom_lines[entry.dir];
      break;
    }
    case 'ADD_LABEL': {
      const area = st.areas.get(entry.areaId); if (!area) break;
      area.labels = area.labels || [];
      area.labels.push(_clone(entry.snapshot));
      break;
    }
    case 'EDIT_LABEL': {
      const area = st.areas.get(entry.areaId); if (!area) break;
      const idx = (area.labels || []).findIndex(l => l.id === entry.labelId);
      if (idx >= 0) area.labels[idx] = _clone(entry.after);
      break;
    }
    case 'DELETE_LABEL': {
      const area = st.areas.get(entry.areaId); if (!area) break;
      area.labels = (area.labels || []).filter(l => l.id !== entry.snapshot.id);
      break;
    }
    case 'MOVE_LABEL': {
      const area = st.areas.get(entry.areaId); if (!area) break;
      const lbl = (area.labels || []).find(l => l.id === entry.labelId);
      if (lbl) { lbl.x = entry.toX; lbl.y = entry.toY; }
      break;
    }
    case 'RESIZE_LABEL': {
      const area = st.areas.get(entry.areaId); if (!area) break;
      const lbl = (area.labels || []).find(l => l.id === entry.labelId);
      if (lbl) { lbl.width = entry.toW; lbl.height = entry.toH; lbl.x = entry.toX; lbl.y = entry.toY; }
      break;
    }
    case 'AUTO_FIX_SUPPRESSORS': {
      for (const { roomId, dir, snapshot } of (entry.added || [])) {
        const r = rm(roomId); if (!r) continue;
        r.custom_lines = r.custom_lines || {};
        r.custom_lines[dir] = _clone(snapshot);
      }
      for (const { roomId, dir } of (entry.removed || [])) {
        const r = rm(roomId); if (!r) continue;
        if (r.custom_lines) delete r.custom_lines[dir];
      }
      break;
    }
    case 'EDIT_ENV_COLOR': {
      // newColor === null → remove the entry; else → set it
      const map = st.map;
      map.colors = map.colors || {};
      map.colors.custom_env_colors = map.colors.custom_env_colors || {};
      if (entry.newColor !== null && entry.newColor !== undefined) {
        map.colors.custom_env_colors[entry.envId] = entry.newColor;
      } else {
        delete map.colors.custom_env_colors[entry.envId];
      }
      break;
    }
  }
}

// Data semantics of commitAddExit: guards first (occupied direction refuses
// WITHOUT any mutation — the apply loop then reports the guard skip),
// suppressor custom lines dropped in the directions the new exit takes over.
// Returns true when the exit was written.
function _addExitData(st, sourceId, dir, targetId, bidirectional) {
  const src = st.roomById[sourceId];
  const tgt = st.roomById[targetId];
  if (!src || !tgt) return false;
  const opp = OPPOSITE[dir];
  if (src.exits?.[dir] !== undefined) return false;                        // direction occupied
  if (bidirectional && opp && tgt.exits?.[opp] !== undefined) return false; // opposite occupied
  const prevSupCL = (src.custom_lines?.[dir] && (src.custom_lines[dir].points || []).length === 0);
  const prevOppSupCL = (bidirectional && opp && tgt.custom_lines?.[opp] && (tgt.custom_lines[opp].points || []).length === 0);
  src.exits = src.exits || {}; src.exits[dir] = targetId;
  if (prevSupCL) { delete src.custom_lines[dir]; if (!Object.keys(src.custom_lines).length) delete src.custom_lines; }
  if (bidirectional && opp) { tgt.exits = tgt.exits || {}; tgt.exits[opp] = sourceId; }
  if (prevOppSupCL) { delete tgt.custom_lines[opp]; if (!Object.keys(tgt.custom_lines).length) delete tgt.custom_lines; }
  return true;
}

// Data semantics of commitDeleteExit: exit + associated fields; doors survive
// when the direction is also a stub.
function _deleteExitData(room, dir) {
  if (!room || !room.exits?.[dir]) return;
  const hasStub = (room.stubs || []).includes(dir);
  delete room.exits[dir];
  if (room.exit_weights) delete room.exit_weights[dir];
  if (room.custom_lines) delete room.custom_lines[dir];
  if (room.exit_locks)   room.exit_locks = (room.exit_locks || []).filter(d => d !== dir);
  if (!hasStub && room.doors) delete room.doors[dir];
}

// Data semantics of deleteRoom: cascade — incoming exits and special exits of
// every other room are cleaned (with associated fields and empty-container
// pruning), then the room leaves its area and the indexes.
function _deleteRoomData(st, roomId) {
  const room = st.roomById[roomId];
  if (!room) return;
  const area = st.areas.get(st.roomArea[roomId]);
  if (!area) return;
  for (const srcRoom of Object.values(st.roomById)) {
    for (const [dir, targetId] of Object.entries(srcRoom.exits || {})) {
      if (targetId !== roomId) continue;
      delete srcRoom.exits[dir];
      if (!Object.keys(srcRoom.exits).length) delete srcRoom.exits;
      if (srcRoom.exit_weights) { delete srcRoom.exit_weights[dir]; if (!Object.keys(srcRoom.exit_weights).length) delete srcRoom.exit_weights; }
      if (srcRoom.exit_locks)   { srcRoom.exit_locks = srcRoom.exit_locks.filter(d => d !== dir); if (!srcRoom.exit_locks.length) delete srcRoom.exit_locks; }
      if (srcRoom.doors)        { delete srcRoom.doors[dir];        if (!Object.keys(srcRoom.doors).length)        delete srcRoom.doors; }
      if (srcRoom.custom_lines) { delete srcRoom.custom_lines[dir]; if (!Object.keys(srcRoom.custom_lines).length) delete srcRoom.custom_lines; }
    }
    for (const [cmd, targetId] of Object.entries(srcRoom.special_exits || {})) {
      if (targetId !== roomId) continue;
      delete srcRoom.special_exits[cmd];
      if (!Object.keys(srcRoom.special_exits).length) delete srcRoom.special_exits;
      if (srcRoom.special_exit_locks) { srcRoom.special_exit_locks = srcRoom.special_exit_locks.filter(c => c !== cmd); if (!srcRoom.special_exit_locks.length) delete srcRoom.special_exit_locks; }
      if (srcRoom.custom_lines) { delete srcRoom.custom_lines[cmd]; if (!Object.keys(srcRoom.custom_lines).length) delete srcRoom.custom_lines; }
      if (srcRoom.doors)        { delete srcRoom.doors[cmd];        if (!Object.keys(srcRoom.doors).length)        delete srcRoom.doors; }
      if (srcRoom.exit_weights) { delete srcRoom.exit_weights[cmd]; if (!Object.keys(srcRoom.exit_weights).length) delete srcRoom.exit_weights; }
    }
  }
  const idx = (area.rooms || []).indexOf(room);
  if (idx !== -1) area.rooms.splice(idx, 1);
  delete st.roomById[roomId];
  delete st.roomArea[roomId];
}

// Data semantics of commitDeleteArea: rooms of the area leave the indexes,
// cross exits pointing at them are cleaned (associated fields + empty
// containers pruned across ALL remaining rooms), the area leaves the map.
// Returns false for the reserved default area (id <= 0) or a missing area.
function _deleteAreaData(st, areaId) {
  if (!areaId || areaId <= 0) return false;
  const area = st.areas.get(areaId);
  if (!area) return false;
  const removedSet = new Set((area.rooms || []).map(r => r.id));
  for (const r of Object.values(st.roomById)) {
    if (removedSet.has(r.id)) continue;
    for (const [dir, tid] of Object.entries(r.exits || {})) {
      if (!removedSet.has(tid)) continue;
      delete r.exits[dir];
      if (r.custom_lines)  { delete r.custom_lines[dir];  if (!Object.keys(r.custom_lines).length)  delete r.custom_lines; }
      if (r.doors)         { delete r.doors[dir];         if (!Object.keys(r.doors).length)         delete r.doors; }
      if (r.exit_weights)  { delete r.exit_weights[dir];  if (!Object.keys(r.exit_weights).length)  delete r.exit_weights; }
      if (r.exit_locks)    { r.exit_locks = r.exit_locks.filter(d => d !== dir); if (!r.exit_locks.length) delete r.exit_locks; }
    }
    for (const [cmd, tid] of Object.entries(r.special_exits || {})) {
      if (!removedSet.has(tid)) continue;
      delete r.special_exits[cmd];
      if (r.custom_lines) { delete r.custom_lines[cmd]; if (!Object.keys(r.custom_lines).length) delete r.custom_lines; }
      if (r.special_exit_locks) { r.special_exit_locks = r.special_exit_locks.filter(c => c !== cmd); if (!r.special_exit_locks.length) delete r.special_exit_locks; }
      if (r.doors)         { delete r.doors[cmd];         if (!Object.keys(r.doors).length)         delete r.doors; }
      if (r.exit_weights)  { delete r.exit_weights[cmd];  if (!Object.keys(r.exit_weights).length)  delete r.exit_weights; }
    }
  }
  // empty-container pruning across all remaining rooms
  for (const r of Object.values(st.roomById)) {
    if (removedSet.has(r.id)) continue;
    for (const key of ['exits', 'special_exits', 'custom_lines', 'doors', 'exit_weights']) {
      if (r[key] && !Object.keys(r[key]).length) delete r[key];
    }
    for (const key of ['exit_locks', 'special_exit_locks']) {
      if (r[key] && !r[key].length) delete r[key];
    }
  }
  for (const r of (area.rooms || [])) {
    delete st.roomById[r.id];
    delete st.roomArea[r.id];
  }
  st.map.areas = (st.map.areas || []).filter(a => a.id !== areaId);
  st.areas.delete(areaId);
  return true;
}

// opts normalization: accept Map / plain object / array of pairs / array.
function _toSet(v) { return v == null ? null : (v instanceof Set ? v : new Set(v)); }
function _toMap(v) {
  if (v == null) return null;
  if (v instanceof Map) return v;
  if (Array.isArray(v)) return new Map(v);
  return new Map(Object.entries(v).map(([k, val]) => [Number(k), val]));
}

function applyDelta(map, delta, opts) {
  const loc = opts && opts.locale;
  const onlySeq = _toSet(opts && opts.onlySeq);
  const overrides = _toMap(opts && opts.overrides);
  const seedSids = opts && opts.seedSids;
  const st = _indexMap(map);
  const sidMap = new Map();
  // seed = resolutions made at classification time (sid -> live id). An
  // executed ADD overwrites the seed with its fresh id — execution wins.
  if (seedSids) {
    const entries = seedSids instanceof Map ? seedSids
      : Array.isArray(seedSids) ? seedSids : Object.entries(seedSids);
    for (const [k, v] of entries) if (!sidMap.has(k)) sidMap.set(k, v); // sid keys stay strings
  }
  let nextRoomId = _maxRoomId(st) + 1;
  let nextAreaId = _maxAreaId(st) + 1;
  const labelNext = new Map(); // areaId -> next label id
  let applied = 0;
  const appliedSeqs = [];
  const skipped = [];
  const skip = (seq, key, params) => skipped.push({ seq, reason: translate(key, params, loc), code: key.slice(7) });

  for (const rawOp of delta.ops) {
    if (onlySeq && !onlySeq.has(rawOp.seq)) continue;
    const op = _translateOp(rawOp, sidMap);
    const seq = rawOp.seq;
    // Mirror of validation: after translation no unknown sid may remain
    // (exception: the sid defined by THIS op — ADD_ROOM/ADD_AREA/ADD_LABEL).
    {
      const ownSid = rawOp.type === 'ADD_ROOM' ? String(rawOp.target.roomId)
                   : rawOp.type === 'ADD_AREA' ? String(rawOp.target.areaId)
                   : rawOp.type === 'ADD_LABEL' ? String(rawOp.payload.label && rawOp.payload.label.id) : null;
      let leftover = null;
      // leftover scan only in ref positions (texts may be anything)
      for (const [o, k] of _deltaSidRefSlots(op)) {
        const v = o[k];
        if (typeof v === 'string' && _DELTA_SID_RE.test(v) && v !== ownSid && !sidMap.has(v) && leftover === null) leftover = v;
      }
      if (leftover !== null) { skip(seq, 'dapply.SID_LEFTOVER', { sid: leftover }); continue; }
    }
    // Position override (auto/manual) — after sid translation, before commit.
    // Fail-closed: the fallback cell must be free LIVE; occupied → skip, zero mutation.
    const ov = overrides && overrides.get(seq);
    if (ov && (op.type === 'ADD_ROOM' || op.type === 'MOVE_ROOM')) {
      const oa = op.type === 'ADD_ROOM' ? op.target.areaId : st.roomArea[op.target.roomId];
      const oz = op.type === 'ADD_ROOM' ? (op.payload.room.z ?? 0) : op.payload.toZ;
      const occRoom = _roomAt(st, oa, ov.x, ov.y, oz);
      if (occRoom && occRoom.id !== op.target.roomId) { skip(seq, 'dapply.OVERRIDE_OCCUPIED'); continue; }
      if (op.type === 'ADD_ROOM') { op.payload.room.x = ov.x; op.payload.room.y = ov.y; }
      else { op.payload.toX = ov.x; op.payload.toY = ov.y; }
    }
    try {
      switch (op.type) {
        case 'ADD_ROOM': {
          const area = st.areas.get(op.target.areaId);
          if (!area) { skip(seq, 'dapply.AREA_MISSING'); break; }
          const room = op.payload.room;
          room.x = room.x ?? 0; room.y = room.y ?? 0; room.z = room.z ?? 0;
          // Live occupancy guard — occupied cell = skip, zero mutation.
          if (_roomAt(st, area.id, room.x, room.y, room.z)) { skip(seq, 'dapply.CELL_OCCUPIED'); break; }
          const freshId = nextRoomId++;
          if (_DELTA_SID_RE.test(String(rawOp.target.roomId))) sidMap.set(rawOp.target.roomId, freshId);
          room.id = freshId; room.area = area.id;
          area.rooms = area.rooms || []; area.rooms.push(room);
          st.roomById[freshId] = room; st.roomArea[freshId] = area.id;
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'DELETE_ROOM': {
          if (!st.roomById[op.target.roomId]) { skip(seq, 'dapply.ROOM_MISSING'); break; }
          _deleteRoomData(st, op.target.roomId);
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'EDIT_ROOM': case 'EDIT_EXIT': {
          const room = st.roomById[op.target.roomId];
          if (!room) { skip(seq, 'dapply.ROOM_MISSING'); break; }
          _applyEditEntry(st, { type: op.type, roomId: room.id, after: op.payload.after });
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'PAINT_BATCH': {
          let any = false;
          for (const ch of op.payload.changes) {
            const r = st.roomById[ch.roomId];
            if (!r) continue;
            any = true;
            r.env = ch.afterEnv;
            if ((ch.afterSymbol ?? '') !== '') r.symbol = ch.afterSymbol; else delete r.symbol;
          }
          if (!any) { skip(seq, 'dapply.NO_ROOM_EXISTS'); break; }
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'MOVE_ROOM': {
          const room = st.roomById[op.target.roomId];
          if (!room) { skip(seq, 'dapply.ROOM_MISSING'); break; }
          const fx = room.x, fy = room.y, fz = room.z ?? 0;
          const tx = op.payload.toX, ty = op.payload.toY, tz = op.payload.toZ ?? fz;
          if (fx === tx && fy === ty && fz === tz) { skip(seq, 'dapply.ALREADY_THERE'); break; }
          // Live occupancy guard (symmetry with ADD_ROOM).
          const occM = _roomAt(st, st.roomArea[room.id], tx, ty, tz);
          if (occM && occM.id !== room.id) { skip(seq, 'dapply.CELL_OCCUPIED'); break; }
          room.x = tx; room.y = ty; room.z = tz;
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'MOVE_ROOM_TO_AREA': {
          const room = st.roomById[op.target.roomId];
          if (!room) { skip(seq, 'dapply.ROOM_MISSING'); break; }
          const toAreaId = op.payload.toAreaId;
          if (toAreaId === undefined || toAreaId === null || !st.areas.get(toAreaId)) { skip(seq, 'dapply.TARGET_AREA_MISSING'); break; }
          if (st.roomArea[room.id] === toAreaId) { skip(seq, 'dapply.ALREADY_IN_AREA'); break; }
          const fromArea = st.areas.get(st.roomArea[room.id]);
          const toArea = st.areas.get(toAreaId);
          if (fromArea) fromArea.rooms = (fromArea.rooms || []).filter(r => r.id !== room.id);
          toArea.rooms = toArea.rooms || []; toArea.rooms.push(room);
          room.area = toAreaId;
          st.roomArea[room.id] = toAreaId;
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'ADD_EXIT': {
          const src = st.roomById[op.target.sourceId], tgt = st.roomById[op.payload.targetId];
          if (!src || !tgt) { skip(seq, 'dapply.SRC_OR_TGT_MISSING'); break; }
          _addExitData(st, op.target.sourceId, op.target.dir, op.payload.targetId, !!op.payload.bidirectional);
          if (src.exits?.[op.target.dir] !== op.payload.targetId) { skip(seq, 'dapply.DIR_OCCUPIED'); break; }
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'DELETE_EXIT': {
          const room = st.roomById[op.target.roomId];
          if (!room || !room.exits?.[op.target.dir]) { skip(seq, 'dapply.EXIT_MISSING'); break; }
          _deleteExitData(room, op.target.dir);
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'DELETE_SPECIAL_EXIT': {
          const room = st.roomById[op.target.roomId];
          const cmd = op.payload.cmd;
          if (!room || !room.special_exits?.[cmd]) { skip(seq, 'dapply.SPECIAL_EXIT_MISSING'); break; }
          delete room.special_exits[cmd];
          if (!Object.keys(room.special_exits).length) delete room.special_exits;
          if (room.custom_lines) { delete room.custom_lines[cmd]; if (!Object.keys(room.custom_lines).length) delete room.custom_lines; }
          if (room.special_exit_locks) { room.special_exit_locks = room.special_exit_locks.filter(c => c !== cmd); if (!room.special_exit_locks.length) delete room.special_exit_locks; }
          if (room.doors)        { delete room.doors[cmd];        if (!Object.keys(room.doors).length)        delete room.doors; }
          if (room.exit_weights) { delete room.exit_weights[cmd]; if (!Object.keys(room.exit_weights).length) delete room.exit_weights; }
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'ADD_AREA': {
          const freshId = nextAreaId++;
          if (_DELTA_SID_RE.test(String(rawOp.target.areaId))) sidMap.set(rawOp.target.areaId, freshId);
          const area = op.payload.area;
          area.id = freshId; area.rooms = []; area.labels = area.labels || [];
          st.map.areas = st.map.areas || []; st.map.areas.push(area);
          st.areas.set(freshId, area);
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'DELETE_AREA': {
          if (!st.areas.get(op.target.areaId)) { skip(seq, 'dapply.AREA_MISSING'); break; }
          // the default area is reserved — counts as a skip, not a success
          if (op.target.areaId <= 0) { skip(seq, 'dapply.DEFAULT_AREA'); break; }
          const delOk = _deleteAreaData(st, op.target.areaId);
          if (delOk === false) { skip(seq, 'dapply.DEFAULT_AREA'); break; }
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'EDIT_AREA': {
          const area = st.areas.get(op.target.areaId);
          if (!area) { skip(seq, 'dapply.AREA_MISSING'); break; }
          area.name = op.payload.name;
          area.user_data = op.payload.user_data || {};
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'ADD_CL': case 'ADD_SUPPRESSOR': {
          const room = st.roomById[op.target.roomId];
          if (!room) { skip(seq, 'dapply.ROOM_MISSING'); break; }
          if (op.type === 'ADD_CL') {
            _applyEditEntry(st, { type: 'ADD_CL', roomId: room.id, dir: op.target.dir, snapshot: _clone(op.payload.cl) });
          } else {
            _applyEditEntry(st, { type: 'ADD_SUPPRESSOR', roomId: room.id, dir: op.target.dir });
          }
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'EDIT_CL': {
          const room = st.roomById[op.target.roomId];
          if (!room) { skip(seq, 'dapply.ROOM_MISSING'); break; }
          // classify<->apply convergence: editing a missing CL is a skip, not
          // a silent create.
          if (!room.custom_lines?.[op.target.dir]) { skip(seq, 'dapply.CL_MISSING'); break; }
          _applyEditEntry(st, { type: 'EDIT_CL', roomId: room.id, dir: op.target.dir, after: _clone(op.payload.after) });
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'DELETE_CL': case 'DELETE_SUPPRESSOR': {
          const room = st.roomById[op.target.roomId];
          if (!room || !room.custom_lines?.[op.target.dir]) { skip(seq, 'dapply.CL_MISSING'); break; }
          _applyEditEntry(st, { type: op.type, roomId: room.id, dir: op.target.dir });
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'AUTO_FIX_SUPPRESSORS': {
          const entry = { type: 'AUTO_FIX_SUPPRESSORS',
            added:   op.payload.added.filter(x => st.roomById[x.roomId]).map(x => ({ roomId: x.roomId, dir: x.dir, snapshot: x.cl })),
            removed: op.payload.removed.filter(x => st.roomById[x.roomId]) };
          if (!entry.added.length && !entry.removed.length) { skip(seq, 'dapply.ROOMS_MISSING'); break; }
          _applyEditEntry(st, entry);
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'ADD_LABEL': {
          const area = st.areas.get(op.target.areaId);
          if (!area) { skip(seq, 'dapply.AREA_MISSING'); break; }
          const rawSid = String(rawOp.payload.label && rawOp.payload.label.id);
          const next = labelNext.get(area.id) ?? (_maxLabelId(area) + 1);
          labelNext.set(area.id, next + 1);
          const lbl = op.payload.label;
          lbl.id = next;
          if (_DELTA_SID_RE.test(rawSid)) sidMap.set(rawSid, next);
          _applyEditEntry(st, { type: 'ADD_LABEL', areaId: area.id, snapshot: _clone(lbl) });
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'EDIT_LABEL': case 'DELETE_LABEL': case 'MOVE_LABEL': case 'RESIZE_LABEL': {
          const area = st.areas.get(op.target.areaId);
          const lbl = area ? (area.labels || []).find(l => l.id === op.target.labelId) : null;
          if (!lbl) { skip(seq, 'dapply.LABEL_MISSING'); break; }
          if (op.type === 'EDIT_LABEL') {
            const after = _clone(op.payload.after); after.id = lbl.id;
            _applyEditEntry(st, { type: op.type, areaId: area.id, labelId: lbl.id, after });
          } else if (op.type === 'DELETE_LABEL') {
            _applyEditEntry(st, { type: op.type, areaId: area.id, snapshot: _clone(lbl) });
          } else if (op.type === 'MOVE_LABEL') {
            _applyEditEntry(st, { type: op.type, areaId: area.id, labelId: lbl.id, toX: op.payload.toX, toY: op.payload.toY });
          } else {
            _applyEditEntry(st, { type: op.type, areaId: area.id, labelId: lbl.id,
              toX: op.payload.toX, toY: op.payload.toY, toW: op.payload.toW, toH: op.payload.toH });
          }
          applied++; appliedSeqs.push(seq);
          break;
        }
        case 'EDIT_ENV_COLOR': {
          _applyEditEntry(st, { type: 'EDIT_ENV_COLOR', envId: op.target.envId,
            newColor: op.payload.newColor ? [...op.payload.newColor] : null });
          applied++; appliedSeqs.push(seq);
          break;
        }
        default:
          skip(seq, 'dapply.UNKNOWN_TYPE');
      }
    } catch (err) {
      skip(seq, 'dapply.EXEC_ERROR', { msg: err.message });
    }
  }
  return { applied, appliedSeqs, skipped };
}

export { applyDelta };

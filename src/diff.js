// diff.js — universal map diff: src map + dst map -> ordered arkdelta-style op list.
//
// Hand-written module. Logic is byte-verbatim from ArkMap Studio's diffMaps
// (the editor's "map clone" tool), so a diff produced here matches the app
// op-for-op. Universal — works on any arkmap-shaped maps, any MUD.
//
// Output: { entries, stats, overlap, srcRooms, dstRooms }.
//   entries — topologically ordered ops (ADD_AREA, EDIT_AREA, EDIT_ENV_COLOR,
//             ADD_ROOM, MOVE_ROOM_TO_AREA, DELETE_ROOM, MOVE_ROOM, EDIT_ROOM,
//             DELETE_EXIT/ADD_EXIT, EDIT_EXIT, PAINT_BATCH, ADD_CL/EDIT_CL/
//             DELETE_CL, ADD_LABEL/EDIT_LABEL/MOVE_LABEL/RESIZE_LABEL/
//             DELETE_LABEL, DELETE_AREA); every op carries a human-readable
//             `label` (English by default; pass { locale: 'pl' } for Polish —
//             PL labels are byte-identical to ArkMap Studio's history panel).
//   stats   — per-op-type counts.
//   overlap — room-id kinship ratio (0..1): a guard against diffing two
//             unrelated maps (low overlap = probably not the same map).
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// plain function/const declarations, single-line imports, one-line export list.

import { stableStringify } from './stable-stringify.js';
import { _stripRoomDefaults } from './checksum.js';
import { translate, plural } from './locale.js';

function _deltaIsSuppressor(cl) {
  return !!cl && Array.isArray(cl.points) && cl.points.length === 0;
}

const _DIFF_DIR_ORDER = ['n','ne','e','se','s','sw','w','nw','up','down','in','out'];
function _diffDirCmp(a, b) {
  const ia = _DIFF_DIR_ORDER.indexOf(a), ib = _DIFF_DIR_ORDER.indexOf(b);
  return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)) || (a < b ? -1 : a > b ? 1 : 0);
}
function _diffEq(a, b) { return stableStringify(a) === stableStringify(b); }
function _diffPick(c, fields) { const o = {}; for (const f of fields) if (c[f] !== undefined) o[f] = c[f]; return o; }
function _diffExcept(c, fields) { const o = Object.assign({}, c); for (const f of fields) delete o[f]; return o; }

// Room canon for comparisons — same convention as _computeBaseInfo (default stripping
// + sorted array fields): the same map from .dat and .arkmap yields an EMPTY delta.
function _diffCanonRoom(room) {
  const c = JSON.parse(JSON.stringify(room));
  delete c.area;
  _stripRoomDefaults(c);
  if (c.stubs) c.stubs.sort();
  if (c.exit_locks) c.exit_locks.sort();
  if (c.special_exit_locks) c.special_exit_locks.sort();
  if (c.env === null || c.env === undefined) delete c.env;
  if (c.z === 0) delete c.z;
  return c;
}

// Cascade trim: exactly the scope of doFn deleteRoom — exits and special exits
// pointing at deleted rooms vanish together with the side fields on those directions.
function _diffTrimRoomToDeleted(room, deletedRooms) {
  for (const dir of Object.keys(room.exits || {})) {
    if (deletedRooms.has(room.exits[dir])) {
      delete room.exits[dir];
      if (room.exit_weights) delete room.exit_weights[dir];
      if (room.doors) delete room.doors[dir];
      if (room.exit_locks) room.exit_locks = room.exit_locks.filter(d => d !== dir);
      if (room.custom_lines) delete room.custom_lines[dir];
    }
  }
  for (const cmd of Object.keys(room.special_exits || {})) {
    if (deletedRooms.has(room.special_exits[cmd])) {
      delete room.special_exits[cmd];
      if (room.special_exit_locks) room.special_exit_locks = room.special_exit_locks.filter(c => c !== cmd);
      if (room.custom_lines) delete room.custom_lines[cmd];
      if (room.doors) delete room.doors[cmd];
      if (room.exit_weights) delete room.exit_weights[cmd];
    }
  }
  ['exits','special_exits','doors','exit_weights','custom_lines'].forEach(k => { if (room[k] && !Object.keys(room[k]).length) delete room[k]; });
  ['exit_locks','special_exit_locks'].forEach(k => { if (Array.isArray(room[k]) && !room[k].length) delete room[k]; });
}

// before-snapshot for full-state ops (EDIT_ROOM/EDIT_EXIT): the room state
// after the delete cascade and after the move — matching classifyDelta's shadow at op time.
// Positions are taken from the RAW destination room (not the canon — the canon normalizes
// z=0, and _deltaRoomCmp in classify compares full snapshots, z preserved).
function _diffBeforeSnapshot(srcRoom, deletedRooms, posRoom) {
  // posRoom = where x/y/z come from: the DESTINATION room when the delta moves the room first
  // (MOVE_ROOM before roomOps — the classifier shadow is already at the new position);
  // the SOURCE room when the same op IS the move itself (cycle fallback) or when
  // there is no move at all (EDIT_ROOM resid — such a room never gets a MOVE_ROOM).
  const b = JSON.parse(JSON.stringify(srcRoom));
  _diffTrimRoomToDeleted(b, deletedRooms);
  b.x = posRoom.x; b.y = posRoom.y;
  if (posRoom.z !== undefined) b.z = posRoom.z; else delete b.z;
  return b;
}

function _diffClLabel(msg, kind, cl, name, id, dir) {
  const supp = _deltaIsSuppressor(cl);
  const p = { dir, name, id };
  if (kind === 'add') return msg(supp ? 'diff.addSuppressor' : 'diff.addCL', p);
  if (kind === 'del') return msg(supp ? 'diff.delSuppressor' : 'diff.delCL', p);
  return msg('diff.editCL', p);
}

const _DIFF_EXIT_FAM  = ['exits','special_exits','doors','exit_weights','exit_locks','special_exit_locks','stubs'];
const _DIFF_PAINT_FAM = ['env','symbol'];
const _DIFF_RESID_SKIP = ['x','y','z','custom_lines'].concat(_DIFF_EXIT_FAM, _DIFF_PAINT_FAM);

function diffMaps(srcMap, dstMap, opts) {
  const loc = opts && opts.locale;
  const msg = (key, params) => translate(key, params, loc);
  const stats = { addArea:0, editArea:0, delArea:0, envColor:0, addRoom:0, editRoom:0, delRoom:0,
    moveRoom:0, moveArea:0, addExit:0, editExit:0, delExit:0, paintRooms:0, paintBatches:0,
    addCL:0, editCL:0, delCL:0, addLabel:0, editLabel:0, delLabel:0, moveLabel:0, resizeLabel:0 };
  const srcAreas = new Map(), dstAreas = new Map();
  for (const a of (srcMap.areas || [])) srcAreas.set(a.id, a);
  for (const a of (dstMap.areas || [])) dstAreas.set(a.id, a);
  const srcRooms = new Map(), dstRooms = new Map();   // id -> { room, areaId }
  for (const [aid, a] of srcAreas) for (const r of (a.rooms || [])) srcRooms.set(r.id, { room: r, areaId: aid });
  for (const [aid, a] of dstAreas) for (const r of (a.rooms || [])) dstRooms.set(r.id, { room: r, areaId: aid });

  // straznik pokrewienstwa: odsetek wspolnych id pokoi (ostrzezenie w dialogu)
  let common = 0;
  for (const id of srcRooms.keys()) if (dstRooms.has(id)) common++;
  const denom = Math.max(srcRooms.size, dstRooms.size);
  const overlap = denom === 0 ? 1 : common / denom;

  const out = { addArea:[], editArea:[], envColor:[], addRoom:[], moveArea:[], delRoom:[],
    roomOps:[], labelAdd:[], labelEdit:[], labelDel:[], delArea:[] };
  const paintGroups = new Map();  // change key -> changes[]
  const moveCands = [];           // { id, name, area, from{x,y,z}, to{x,y,z}, sRoom, dRoom }

  // ── obszary ──
  const allAreaIds = [...new Set([...srcAreas.keys(), ...dstAreas.keys()])].sort((a, b) => a - b);
  const deletedAreas = new Set();
  for (const id of allAreaIds) {
    const sA = srcAreas.get(id), dA = dstAreas.get(id);
    if (sA && !dA) {
      deletedAreas.add(id);
      out.delArea.push({ type:'DELETE_AREA', areaId:id, snapshot:{ name: sA.name || '' },
        label: msg('diff.delArea', { name: sA.name || '#' + id }) }); stats.delArea++;
    } else if (!sA && dA) {
      const areaData = JSON.parse(JSON.stringify(dA));
      delete areaData.rooms; delete areaData.labels;
      out.addArea.push({ type:'ADD_AREA', areaId:id, areaData,
        label: msg('diff.addArea', { name: dA.name || '#' + id }) }); stats.addArea++;
    } else {
      const bs = { name: sA.name || '', user_data: sA.user_data || {} };
      const bd = { name: dA.name || '', user_data: dA.user_data || {} };
      if (!_diffEq(bs, bd)) {
        out.editArea.push({ type:'EDIT_AREA', areaId:id, before:bs, after:bd,
          label: msg('diff.editArea', { name: dA.name || sA.name || '#' + id }) }); stats.editArea++;
      }
    }
  }

  // ── kolory env ──
  const sc  = (srcMap.colors && srcMap.colors.custom_env_colors) || {};
  const dcc = (dstMap.colors && dstMap.colors.custom_env_colors) || {};
  const envIds = [...new Set([...Object.keys(sc), ...Object.keys(dcc)])].sort((a, b) => (+a) - (+b));
  for (const envKey of envIds) {
    const o = sc[envKey] ?? null, n = dcc[envKey] ?? null;
    if (_diffEq(o, n)) continue;
    const envId = isFinite(+envKey) ? +envKey : envKey;
    out.envColor.push({ type:'EDIT_ENV_COLOR', envId,
      oldColor: o ? [...o] : null, newColor: n ? [...n] : null,
      label: n ? msg('diff.envColorSet', { envId, rgb: n.join(',') }) : msg('diff.envColorReset', { envId }) });
    stats.envColor++;
  }

  // ── rooms ──
  const deletedRooms = new Set(), addedRooms = new Set();
  const allRoomIds = [...new Set([...srcRooms.keys(), ...dstRooms.keys()])].sort((a, b) => a - b);
  for (const id of allRoomIds) {
    if (srcRooms.has(id) && !dstRooms.has(id)) deletedRooms.add(id);
    if (!srcRooms.has(id) && dstRooms.has(id)) addedRooms.add(id);
  }
  for (const id of allRoomIds) {
    const s = srcRooms.get(id), d = dstRooms.get(id);
    if (s && !d) {
      out.delRoom.push({ type:'DELETE_ROOM', roomId:id, areaId:s.areaId,
        snapshot: JSON.parse(JSON.stringify(s.room)),
        label: msg('diff.delRoom', { name: s.room.name || '#' + id, id }) });
      stats.delRoom++;
      continue;
    }
    if (!s && d) {
      out.addRoom.push({ type:'ADD_ROOM', roomId:id, roomData: JSON.parse(JSON.stringify(d.room)), areaId:d.areaId,
        label: msg('diff.addRoom', { name: d.room.name || '', id }) });
      stats.addRoom++;
      continue;
    }
    const name = d.room.name || s.room.name || ('#' + id);
    const cs = _diffCanonRoom(s.room), cd = _diffCanonRoom(d.room);
    _diffTrimRoomToDeleted(cs, deletedRooms);   // kanon zrodla po kaskadzie delete'ow

    const areaChanged = s.areaId !== d.areaId;
    const posChanged  = (cs.x !== cd.x) || (cs.y !== cd.y) || ((cs.z ?? 0) !== (cd.z ?? 0));
    const exitsDiffer = !_diffEq(cs.exits || {}, cd.exits || {});
    const exitRestDiffer = !_diffEq(_diffExcept(_diffPick(cs, _DIFF_EXIT_FAM), ['exits']),
                                    _diffExcept(_diffPick(cd, _DIFF_EXIT_FAM), ['exits']));
    const paintDiffer = !_diffEq(_diffPick(cs, _DIFF_PAINT_FAM), _diffPick(cd, _DIFF_PAINT_FAM));
    const clS = cs.custom_lines || {}, clD = cd.custom_lines || {};
    const clDiffer = !_diffEq(clS, clD);
    const residDiffer = !_diffEq(_diffExcept(cs, _DIFF_RESID_SKIP), _diffExcept(cd, _DIFF_RESID_SKIP));
    if (!areaChanged && !posChanged && !exitsDiffer && !exitRestDiffer && !paintDiffer && !clDiffer && !residDiffer) continue;

    if (areaChanged) {
      out.moveArea.push({ type:'MOVE_ROOM_TO_AREA', roomId:id, fromAreaId:s.areaId, toAreaId:d.areaId,
        label: msg('diff.moveRoomToArea', { name, id, areaName: (dstAreas.get(d.areaId) || {}).name || '#' + d.areaId }) });
      stats.moveArea++;
    }

    if (residDiffer) {
      // pelny EDIT_ROOM pokrywa wszystko (wyjscia/malowanie/CL-e/pozycje) jednym opem
      out.roomOps.push({ type:'EDIT_ROOM', roomId:id,
        before: _diffBeforeSnapshot(s.room, deletedRooms, s.room),
        after: JSON.parse(JSON.stringify(d.room)),
        label: msg('diff.editRoom', { name, id }) });
      stats.editRoom++;
      continue;
    }

    if (posChanged) {
      moveCands.push({ id, name, area: d.areaId,
        from: { x: s.room.x, y: s.room.y, z: s.room.z },
        to:   { x: d.room.x, y: d.room.y, z: d.room.z } });
    }

    const delExitDirs = new Set();
    if (exitsDiffer && !exitRestDiffer) {
      // granular DELETE/ADD per direction (no snapshots — the most readable history)
      const dirs = [...new Set([...Object.keys(cs.exits || {}), ...Object.keys(cd.exits || {})])].sort(_diffDirCmp);
      for (const dir of dirs) {
        const sT = (cs.exits || {})[dir], dT = (cd.exits || {})[dir];
        if (sT !== undefined && dT === undefined) {
          delExitDirs.add(dir);
          out.roomOps.push({ type:'DELETE_EXIT', roomId:id, dir,
            snap: { exitId: sT, weight: (cs.exit_weights || {})[dir],
              lock: (cs.exit_locks || []).includes(dir) ? dir : undefined,
              door: (cs.doors || {})[dir], hasStub: (cs.stubs || []).includes(dir),
              cl: clS[dir] ? JSON.parse(JSON.stringify(clS[dir])) : undefined },
            label: msg('diff.delExit', { dir, id }) });
          stats.delExit++;
        } else if (sT === undefined && dT !== undefined) {
          out.roomOps.push({ type:'ADD_EXIT', sourceId:id, dir, targetId:dT, bidirectional:false,
            label: msg('diff.addExit', { dir, target: dT, id }) });
          stats.addExit++;
        } else if (sT !== dT) {
          delExitDirs.add(dir);
          out.roomOps.push({ type:'DELETE_EXIT', roomId:id, dir,
            snap: { exitId: sT, weight: (cs.exit_weights || {})[dir],
              lock: (cs.exit_locks || []).includes(dir) ? dir : undefined,
              door: (cs.doors || {})[dir], hasStub: (cs.stubs || []).includes(dir),
              cl: clS[dir] ? JSON.parse(JSON.stringify(clS[dir])) : undefined },
            label: msg('diff.delExit', { dir, id }) });
          out.roomOps.push({ type:'ADD_EXIT', sourceId:id, dir, targetId:dT, bidirectional:false,
            label: msg('diff.addExit', { dir, target: dT, id }) });
          stats.delExit++; stats.addExit++;
        }
      }
    } else if (exitsDiffer || exitRestDiffer) {
      // mixed exit-family changes -> one EDIT_EXIT (full snapshots; also covers paint/CL)
      const dirs = new Set();
      for (const k of new Set([...Object.keys(cs.exits || {}), ...Object.keys(cd.exits || {})]))
        if ((cs.exits || {})[k] !== (cd.exits || {})[k]) dirs.add(k);
      for (const k of new Set([...Object.keys(cs.special_exits || {}), ...Object.keys(cd.special_exits || {})]))
        if ((cs.special_exits || {})[k] !== (cd.special_exits || {})[k]) dirs.add(k);
      for (const f of ['doors','exit_weights'])
        for (const k of new Set([...Object.keys(cs[f] || {}), ...Object.keys(cd[f] || {})]))
          if (!_diffEq((cs[f] || {})[k], (cd[f] || {})[k])) dirs.add(k);
      for (const f of ['exit_locks','stubs','special_exit_locks']) {
        const a = new Set(cs[f] || []), b = new Set(cd[f] || []);
        for (const k of new Set([...a, ...b])) if (a.has(k) !== b.has(k)) dirs.add(k);
      }
      const sd = [...dirs].sort(_diffDirCmp);
      out.roomOps.push({ type:'EDIT_EXIT', roomId:id,
        before: _diffBeforeSnapshot(s.room, deletedRooms, d.room),
        after: JSON.parse(JSON.stringify(d.room)),
        label: sd.length === 1
          ? msg('diff.editExit', { dir: sd[0], name, id })
          : msg('diff.editExits', { name, id }) });
      stats.editExit++;
    } else {
      if (paintDiffer) {
        const key = stableStringify([cs.env ?? null, cs.symbol ?? '', cd.env ?? null, cd.symbol ?? '']);
        if (!paintGroups.has(key)) paintGroups.set(key, []);
        paintGroups.get(key).push({ roomId:id, beforeEnv: cs.env ?? null, beforeSymbol: cs.symbol ?? '',
          afterEnv: cd.env ?? null, afterSymbol: cd.symbol ?? '' });
      }
      if (clDiffer) {
        // directions with DELETE_EXIT: their CL vanishes with the exit — treat the source as empty
        const dirs = [...new Set([...Object.keys(clS), ...Object.keys(clD)])].sort(_diffDirCmp);
        for (const dir of dirs) {
          const sC = delExitDirs.has(dir) ? undefined : clS[dir];
          const dC = clD[dir];
          if (sC && !dC) {
            out.roomOps.push({ type:'DELETE_CL', roomId:id, dir, snapshot: JSON.parse(JSON.stringify(sC)),
              label: _diffClLabel(msg, 'del', sC, name, id, dir) });
            stats.delCL++;
          } else if (!sC && dC) {
            out.roomOps.push({ type:'ADD_CL', roomId:id, dir, snapshot: JSON.parse(JSON.stringify(dC)),
              label: _diffClLabel(msg, 'add', dC, name, id, dir) });
            stats.addCL++;
          } else if (sC && dC && !_diffEq(sC, dC)) {
            out.roomOps.push({ type:'EDIT_CL', roomId:id, dir,
              before: JSON.parse(JSON.stringify(sC)), after: JSON.parse(JSON.stringify(dC)),
              label: _diffClLabel(msg, 'edit', dC, name, id, dir) });
            stats.editCL++;
          }
        }
      }
    }
  }

  // ── moves: emission in unblocking order; a cycle (e.g. swap) -> EDIT_ROOM fallback ──
  const occ = new Map();  // "areaId:x,y,z" -> roomId (state after deletes, with added rooms)
  const occKey = (areaId, x, y, z) => areaId + ':' + x + ',' + y + ',' + (z ?? 0);
  for (const [id, s] of srcRooms) {
    if (deletedRooms.has(id)) continue;
    occ.set(occKey(s.areaId, s.room.x, s.room.y, s.room.z), id);
  }
  for (const id of addedRooms) {
    const d = dstRooms.get(id);
    occ.set(occKey(d.areaId, d.room.x, d.room.y, d.room.z), id);
  }
  const moveOps = [];
  let pend = moveCands;   // allRoomIds posortowane → kandydaci posortowani po id
  while (pend.length) {
    let progress = false;
    const rest = [];
    for (const m of pend) {
      const toKey = occKey(m.area, m.to.x, m.to.y, m.to.z);
      const occupant = occ.get(toKey);
      if (occupant === undefined || occupant === m.id) {
        moveOps.push({ type:'MOVE_ROOM', roomId:m.id,
          fromX:m.from.x, fromY:m.from.y, fromZ:m.from.z, toX:m.to.x, toY:m.to.y, toZ:m.to.z,
          label: msg('diff.moveRoom', { name: m.name, id: m.id }) });
        occ.delete(occKey(m.area, m.from.x, m.from.y, m.from.z));
        occ.set(toKey, m.id);
        stats.moveRoom++;
        progress = true;
      } else rest.push(m);
    }
    if (!progress) {
      // cykl kolizyjny (np. zamiana miejsc) — rozbijamy JEDEN fallback EDIT_ROOM
      // (omija klasyfikacje move), co zwalnia pole i odblokowuje reszte cyklu
      const m = rest[0];
      const srcRoom = srcRooms.get(m.id).room;
      const after = JSON.parse(JSON.stringify(srcRoom));
      _diffTrimRoomToDeleted(after, deletedRooms);
      after.x = m.to.x; after.y = m.to.y;
      if (m.to.z !== undefined) after.z = m.to.z; else delete after.z;
      moveOps.push({ type:'EDIT_ROOM', roomId:m.id,
        before: _diffBeforeSnapshot(srcRoom, deletedRooms, srcRoom),
        after,
        label: msg('diff.moveRoom', { name: m.name, id: m.id }) });
      occ.delete(occKey(m.area, m.from.x, m.from.y, m.from.z));
      occ.set(occKey(m.area, m.to.x, m.to.y, m.to.z), m.id);
      stats.moveRoom++;
      rest.shift();
    }
    pend = rest;
  }

  // ── malowanie: grupy identycznych zmian env/symbol ──
  const paintOps = [];
  for (const key of [...paintGroups.keys()].sort()) {
    const changes = paintGroups.get(key).sort((a, b) => a.roomId - b.roomId);
    const n = changes.length;
    paintOps.push({ type:'PAINT_BATCH', changes,
      label: msg('diff.paintBatch', { n, rooms: plural(loc, n, 'words.room') }) });
    stats.paintBatches++; stats.paintRooms += n;
  }

  // ── labels (skipping deleted areas — labels vanish in the cascade) ──
  for (const aid of allAreaIds) {
    if (deletedAreas.has(aid)) continue;
    const sA = srcAreas.get(aid), dA = dstAreas.get(aid);
    const sL = new Map(), dL = new Map();
    for (const l of ((sA && sA.labels) || [])) sL.set(l.id, l);
    for (const l of ((dA && dA.labels) || [])) dL.set(l.id, l);
    const ids = [...new Set([...sL.keys(), ...dL.keys()])].sort((a, b) => a - b);
    for (const lid of ids) {
      const s = sL.get(lid), d = dL.get(lid);
      const nm = (d && d.text) || (s && s.text) || ('#' + lid);
      if (s && !d) {
        out.labelDel.push({ type:'DELETE_LABEL', areaId:aid, snapshot: JSON.parse(JSON.stringify(s)),
          label: msg('diff.delLabel', { name: nm, id: lid }) });
        stats.delLabel++;
      } else if (!s && d) {
        out.labelAdd.push({ type:'ADD_LABEL', areaId:aid, snapshot: JSON.parse(JSON.stringify(d)),
          label: msg('diff.addLabel', { name: nm, id: lid }) });
        stats.addLabel++;
      } else if (!_diffEq(s, d)) {
        const posCh  = (s.x !== d.x) || (s.y !== d.y);
        const sizeCh = (s.width !== d.width) || (s.height !== d.height);
        const restCh = !_diffEq(_diffExcept(s, ['x','y','width','height']), _diffExcept(d, ['x','y','width','height']));
        if (restCh) {
          out.labelEdit.push({ type:'EDIT_LABEL', areaId:aid, labelId:lid,
            before: JSON.parse(JSON.stringify(s)), after: JSON.parse(JSON.stringify(d)),
            label: msg('diff.editLabel', { name: nm, id: lid }) });
          stats.editLabel++;
        } else if (sizeCh) {
          out.labelEdit.push({ type:'RESIZE_LABEL', areaId:aid, labelId:lid,
            fromW:s.width, fromH:s.height, fromX:s.x, fromY:s.y, toW:d.width, toH:d.height, toX:d.x, toY:d.y,
            label: msg('diff.resizeLabel', { name: nm, id: lid }) });
          stats.resizeLabel++;
        } else if (posCh) {
          out.labelEdit.push({ type:'MOVE_LABEL', areaId:aid, labelId:lid,
            fromX:s.x, fromY:s.y, toX:d.x, toY:d.y,
            label: msg('diff.moveLabel', { name: nm, id: lid }) });
          stats.moveLabel++;
        }
      }
    }
  }

  // ── kolejnosc emisji (topologiczna, deterministyczna) ──
  const entries = [
    ...out.addArea, ...out.editArea, ...out.envColor,
    ...out.addRoom, ...out.moveArea, ...out.delRoom,
    ...moveOps, ...out.roomOps, ...paintOps,
    ...out.labelAdd, ...out.labelEdit, ...out.labelDel,
    ...out.delArea,
  ];
  return { entries, stats, overlap, srcRooms: srcRooms.size, dstRooms: dstRooms.size };
}

export { diffMaps };

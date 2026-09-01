// graph.js — room graph over an arkmap map: indexing, adjacency, pathfinding, search.
//
// Hand-written module (not extracted from the standalone app).
// Pure and stateless: no I/O, no randomness, no clock — same input, same output.
//
// Routing parity with the reference planner:
// - edge weight: exit_weights[dir] when a positive number, else max(target.weight ?? 1, 1)
//   (Mudlet semantics — the destination room's weight is the default step cost);
// - dirMode filter: 'cardinal' = compass n..nw; 'vertical' = + up/down/in/out;
//   'all' = + special exits (special exits never pass 'cardinal'/'vertical');
// - locked exits (exit_locks / special_exit_locks) are always skipped;
//   locked rooms are skipped when avoidLocked (except as the route start);
// - transports (arkmap-transports) are virtual edges OUTSIDE the dirMode filter;
//   with transports or extraEdges active the router always uses Dijkstra
//   (the A* heuristic is inadmissible over hops), exactly like the reference.
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// plain function/const declarations, single-line imports, one-line export list.

import { DIR_BY_SHORT } from './constants.js';
import { buildTransportEdges } from './transports.js';

/**
 * Build a room lookup index over all areas.
 * Duplicate room ids across areas: the last occurrence wins (room ids are
 * unique in well-formed maps; this keeps the result deterministic regardless).
 * @param {object} map arkmap map ({ areas: [{ id, name?, rooms: [...] }] })
 * @returns {Map<number, {room: object, areaId: number, areaName: string}>}
 */
function buildIndex(map) {
  const idx = new Map();
  for (const area of map?.areas || []) {
    const areaName = area.name || String(area.id);
    for (const room of area.rooms || []) idx.set(room.id, { room, areaId: area.id, areaName });
  }
  return idx;
}

// Edge weight (reference parity): explicit positive exit_weights[dir] wins;
// otherwise the destination room's weight (Mudlet room weight), min 1.
// exit_weights of 0 / negative / NaN count as unset; Infinity passes through
// (an effectively blocked edge — Dijkstra simply never relaxes it).
function edgeWeight(room, dir, nbr) {
  const ew = room.exit_weights?.[dir];
  if (typeof ew === 'number' && ew > 0) return ew;
  const w = nbr?.weight;
  return Math.max(typeof w === 'number' && w > 0 ? w : 1, 1);
}

/**
 * Adjacency list of a room: [[targetRoomId, weight], ...].
 * Regular exits first (in key order), then special exits. Dangling targets
 * are NOT filtered here (findPath/findRoute skip them against the index).
 * Pass idx (buildIndex result) for reference-parity weights (destination room
 * weight); without idx the weight falls back to exit_weights / 1.
 * @param {object} room
 * @param {Map<number, {room: object}>} [idx]
 * @returns {Array<[number, number]>}
 */
function neighborsOf(room, idx) {
  const out = [];
  for (const [dir, tgt] of Object.entries(room.exits || {})) {
    out.push([tgt, edgeWeight(room, dir, idx?.get(tgt)?.room)]);
  }
  for (const [cmd, tgt] of Object.entries(room.special_exits || {})) {
    out.push([tgt, edgeWeight(room, cmd, idx?.get(tgt)?.room)]);
  }
  return out;
}

// ── binary heap of [cost, roomId] (deterministic; ties unspecified) ────────
function _heapPush(heap, item) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p][0] <= heap[i][0]) break;
    [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
  }
}
function _heapPop(heap) {
  const top = heap[0], last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
    }
  }
  return top;
}

// ── cached-shape adjacency build (per call; the package is stateless) ──────
// Entry: { id, w, cls, lk, x, y, z }
//   cls 0 = compass (n..nw), 1 = vertical (up/down/in/out), 2 = special/unknown
//   lk  = locked exit (exit_locks / special_exit_locks) — always skipped
// Merge priority on key collision: special_exits override exits (reference parity).
// Also builds areaMin: min edge weight between distinct areas (A* area heuristic).
function _adjBuild(idx) {
  const adj = new Map(), areaMin = new Map();
  for (const [id, e] of idx) {
    const room = e.room;
    const exits = room.exits, se = room.special_exits;
    if (!exits && !se) continue;
    const exitLockSet = room.exit_locks?.length ? new Set(room.exit_locks) : null;
    const specLockSet = room.special_exit_locks?.length ? new Set(room.special_exit_locks) : null;
    const merged = [];
    const posByDir = new Map();
    const put = (dir, nid, isSpecial) => {
      const at = posByDir.get(dir);
      if (at === undefined) { posByDir.set(dir, merged.length); merged.push({ dir, nid, isSpecial }); }
      else { const m = merged[at]; m.nid = nid; m.isSpecial = true; }
    };
    if (exits) for (const dir in exits) put(dir, exits[dir], false);
    if (se) for (const dir in se) put(dir, se[dir], true);
    const out = [];
    for (const m of merged) {
      const nid = m.nid;
      if (!nid) continue;
      const nbr = idx.get(nid)?.room;
      if (!nbr) continue;
      let cls;
      if (m.isSpecial) cls = 2;
      else { const d = DIR_BY_SHORT[m.dir]; cls = !d ? 2 : (d.idx <= 8 ? 0 : 1); }
      out.push({
        id: nid,
        w: edgeWeight(room, m.dir, nbr),
        cls,
        lk: !!((exitLockSet && exitLockSet.has(m.dir)) || (specLockSet && specLockSet.has(m.dir))),
        x: nbr.x, y: nbr.y, z: nbr.z ?? 0,
      });
    }
    if (!out.length) continue;
    out.sort((a, b) => a.id - b.id);   // stable — ties keep insertion order
    adj.set(+id, out);
    const a = e.areaId;
    for (const edge of out) {
      const b = idx.get(edge.id)?.areaId;
      if (b === undefined || b === a) continue;
      let tos = areaMin.get(a);
      if (!tos) { tos = new Map(); areaMin.set(a, tos); }
      if (edge.w < (tos.get(b) ?? Infinity)) tos.set(b, edge.w);
    }
  }
  return { adj, areaMin };
}

// Distances of areas TO the target area over the area graph (reverse Dijkstra).
function _areaDistances(areaMin, areaTo) {
  const dist = new Map([[areaTo, 0]]);
  const rev = new Map();
  for (const [a, tos] of areaMin) {
    for (const [b, w] of tos) {
      let l = rev.get(b);
      if (!l) { l = []; rev.set(b, l); }
      l.push({ from: a, w });
    }
  }
  const heap = [[0, areaTo]];
  while (heap.length) {
    const [d, a] = _heapPop(heap);
    if (d > (dist.get(a) ?? Infinity)) continue;
    const l = rev.get(a);
    if (!l) continue;
    for (const e of l) {
      const nd = d + e.w;
      if (nd < (dist.get(e.from) ?? Infinity)) { dist.set(e.from, nd); _heapPush(heap, [nd, e.from]); }
    }
  }
  return dist;
}

// A* scan parameters: max geometric edge length and min edge weight.
function _astarParams(idx, adj) {
  let maxDist = 1, minW = Infinity;
  for (const [id, out] of adj) {
    const room = idx.get(id)?.room;
    if (!room) continue;
    for (const e of out) {
      const dx = e.x - room.x, dy = e.y - room.y, dz = e.z - (room.z ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > maxDist) maxDist = dist;
      if (e.w < minW) minW = e.w;
    }
  }
  if (!Number.isFinite(minW)) minW = 1;
  return { maxEdgeDist: maxDist, minEdgeW: minW };
}

function _dirAllowedCls(cls, dirMode) {
  if (cls === 2) return dirMode === 'all';
  if (cls === 1) return dirMode !== 'cardinal';
  return true;
}

/**
 * Shortest path between two rooms (Dijkstra over exits + special_exits).
 * Returns an array of room ids from fromId to toId inclusive, [fromId] when
 * from === to, or null when either id is unknown or the target is unreachable.
 * Weights follow reference parity (see edgeWeight). Among equal-cost shortest
 * paths the choice is deterministic but unspecified — do not rely on a
 * specific tie-break.
 * @param {number} fromId
 * @param {number} toId
 * @param {Map<number, {room: object}>} idx index from buildIndex()
 * @returns {number[] | null}
 */
function findPath(fromId, toId, idx) {
  if (!idx.has(fromId) || !idx.has(toId)) return null;
  if (fromId === toId) return [fromId];
  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const heap = [[0, fromId]];
  while (heap.length) {
    const [d, id] = _heapPop(heap);
    if (id === toId) {
      const path = [toId];
      let cur = toId;
      while (prev.has(cur)) { cur = prev.get(cur); path.push(cur); }
      return path.reverse();
    }
    if (d > (dist.get(id) ?? Infinity)) continue;
    for (const [nid, w] of neighborsOf(idx.get(id).room, idx)) {
      if (!idx.has(nid)) continue;
      const nd = d + w;
      if (nd < (dist.get(nid) ?? Infinity)) { dist.set(nid, nd); prev.set(nid, id); _heapPush(heap, [nd, nid]); }
    }
  }
  return null;
}

/**
 * Full router (reference-planner parity, stateless).
 * opts:
 *   algorithm     'dijkstra' | 'astar'      (default 'dijkstra'; forced to
 *                                             Dijkstra when transports/extraEdges are active)
 *   dirMode       'cardinal' | 'vertical' | 'all'   (default 'all')
 *   transportMode 'off' | 'normal' | 'aggressive'   (default 'off')
 *   avoidLocked   bool — skip locked rooms (default true); locked exits always skipped
 *   isLocked      (room) => bool — room lock predicate (default: room.locked)
 *   transports    arkmap-transports document (embedded map.transports or sidecar)
 *   transportEdges  prebuilt edges from buildTransportEdges() (skips rebuild)
 *   extraEdges    [{ from, to, cost, hop? }] — ad-hoc virtual edges for any map
 * Returns { path: number[] | null, hops: (hop | null)[] } — hops aligned to
 * path steps (null for walking steps); empty when path is null.
 */
function findRoute(fromId, toId, idx, opts) {
  const o = opts || {};
  const dirMode = o.dirMode || 'all';
  const transportMode = o.transportMode || 'off';
  const avoidLocked = o.avoidLocked !== false;
  const isLocked = typeof o.isLocked === 'function' ? o.isLocked : (r) => !!r.locked;
  if (!idx.has(fromId) || !idx.has(toId)) return { path: null, hops: [] };
  if (fromId === toId) return { path: [fromId], hops: [] };

  const { adj, areaMin } = _adjBuild(idx);

  // virtual edges: transports (outside the dirMode filter) + ad-hoc extraEdges
  let transportEdges = null;
  if (transportMode !== 'off') {
    transportEdges = o.transportEdges ||
      (o.transports ? buildTransportEdges(o.transports, idx, { mode: transportMode }) : null);
  }
  const extra = new Map();
  for (const e of o.extraEdges || []) {
    if (!idx.has(e.from) || !idx.has(e.to)) continue;
    if (typeof e.cost !== 'number' || !(e.cost >= 0)) continue;
    if (!extra.has(e.from)) extra.set(e.from, []);
    extra.get(e.from).push({ to: e.to, cost: e.cost, hop: e.hop ?? null });
  }
  const hasVirtual = !!(transportEdges || extra.size);
  const algorithm = hasVirtual ? 'dijkstra' : (o.algorithm === 'astar' ? 'astar' : 'dijkstra');

  const pathHops = new Map();   // target roomId -> hop of the entering step
  const prev = new Map();

  if (algorithm === 'astar') {
    // A* — admissible + consistent heuristic:
    //   h(n) = max(euclid(n)/maxEdgeDist*minEdgeW, areaGraphDist(area(n)))
    const roomFrom = idx.get(fromId).room, roomTo = idx.get(toId).room;
    const { maxEdgeDist, minEdgeW } = _astarParams(idx, adj);
    const aFrom = idx.get(fromId).areaId, aTo = idx.get(toId).areaId;
    let areaDist = null;
    if (aFrom !== undefined && aTo !== undefined && aFrom !== aTo) {
      areaDist = _areaDistances(areaMin, aTo);
      if (!areaDist.has(aFrom)) return { path: null, hops: [] };   // disconnected area graph
    }
    const h = (rid, x, y, z) => {
      const dx = x - roomTo.x, dy = y - roomTo.y, dz = z - (roomTo.z ?? 0);
      let hh = Math.sqrt(dx * dx + dy * dy + dz * dz) / maxEdgeDist * minEdgeW;
      if (areaDist) {
        const a = idx.get(rid)?.areaId;
        const ad = (a === aTo) ? 0 : (a === undefined ? undefined : areaDist.get(a));
        if (ad !== undefined && ad > hh) hh = ad;
      }
      return hh;
    };
    const g = new Map([[fromId, 0]]);
    const visited = new Set();
    const heap = [[h(fromId, roomFrom.x, roomFrom.y, roomFrom.z ?? 0), fromId]];
    while (heap.length) {
      const [, cur] = _heapPop(heap);
      if (visited.has(cur)) continue;
      visited.add(cur);
      const room = idx.get(cur)?.room;
      if (!room) continue;
      if (avoidLocked && isLocked(room) && cur !== fromId) continue;   // locked start may exit
      if (cur === toId) break;
      const gCur = g.get(cur) ?? Infinity;
      const adjL = adj.get(+cur);
      if (adjL) for (const e of adjL) {
        if (visited.has(e.id)) continue;
        if (e.lk) continue;                                    // locked exit — always skipped
        if (!_dirAllowedCls(e.cls, dirMode)) continue;
        const nbr = idx.get(e.id)?.room;
        if (!nbr) continue;
        if (avoidLocked && isLocked(nbr)) continue;
        const newG = gCur + e.w;
        if (newG < (g.get(e.id) ?? Infinity)) {
          g.set(e.id, newG); prev.set(e.id, cur);
          _heapPush(heap, [newG + h(e.id, e.x, e.y, e.z), e.id]);
        }
      }
    }
  } else {
    // Dijkstra (walking + virtual edges)
    const dist = new Map([[fromId, 0]]);
    const visited = new Set();
    const heap = [[0, fromId]];
    while (heap.length) {
      const [cost, cur] = _heapPop(heap);
      if (visited.has(cur)) continue;
      visited.add(cur);
      const room = idx.get(cur)?.room;
      if (!room) continue;
      if (avoidLocked && isLocked(room) && cur !== fromId) continue;
      if (cur === toId) break;
      const adjL = adj.get(+cur);
      if (adjL) for (const e of adjL) {
        if (visited.has(e.id)) continue;
        if (e.lk) continue;
        if (!_dirAllowedCls(e.cls, dirMode)) continue;
        const nbr = idx.get(e.id)?.room;
        if (!nbr) continue;
        if (avoidLocked && isLocked(nbr)) continue;
        const nd = cost + e.w;
        if (nd < (dist.get(e.id) ?? Infinity)) {
          dist.set(e.id, nd); prev.set(e.id, cur);
          pathHops.delete(e.id);   // better walking step replaces a hop
          _heapPush(heap, [nd, e.id]);
        }
      }
      if (transportEdges) {
        const tEdges = transportEdges.get(cur);
        if (tEdges) for (const te of tEdges) {
          if (visited.has(te.to)) continue;
          const tn = idx.get(te.to)?.room;
          if (!tn) continue;
          if (avoidLocked && isLocked(tn)) continue;
          const nd = cost + te.cost;
          if (nd < (dist.get(te.to) ?? Infinity)) {
            dist.set(te.to, nd); prev.set(te.to, cur);
            pathHops.set(te.to, te.hop);
            _heapPush(heap, [nd, te.to]);
          }
        }
      }
      const xEdges = extra.get(cur);
      if (xEdges) for (const xe of xEdges) {
        if (visited.has(xe.to)) continue;
        const tn = idx.get(xe.to)?.room;
        if (!tn) continue;
        if (avoidLocked && isLocked(tn)) continue;
        const nd = cost + xe.cost;
        if (nd < (dist.get(xe.to) ?? Infinity)) {
          dist.set(xe.to, nd); prev.set(xe.to, cur);
          if (xe.hop) pathHops.set(xe.to, xe.hop); else pathHops.delete(xe.to);
          _heapPush(heap, [nd, xe.to]);
        }
      }
    }
  }

  if (!prev.has(toId)) return { path: null, hops: [] };
  const path = [toId];
  let c = toId;
  while (prev.has(c)) { c = prev.get(c); path.push(c); }
  path.reverse();
  const hops = new Array(path.length - 1).fill(null);
  for (let i = 1; i < path.length; i++) {
    const hp = pathHops.get(path[i]);
    if (hp) hops[i - 1] = hp;
  }
  return { path, hops };
}

/**
 * Multi-waypoint route (reference wpRecalcPaths parity, stateless).
 * waypoints: array of (roomId | null); a leg is computed for every consecutive
 * pair with both endpoints set; legs touching a null waypoint come back null.
 * Returns { legs: ({ from, to, path, hops } | null)[], totalSteps, complete }.
 * complete = every computed leg found a path.
 */
function planRoute(waypoints, idx, opts) {
  const legs = [];
  let totalSteps = 0, complete = true;
  for (let i = 0; i + 1 < (waypoints || []).length; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    if (a == null || b == null) { legs.push(null); continue; }
    const { path, hops } = findRoute(a, b, idx, opts);
    if (!path) complete = false;
    else totalSteps += path.length - 1;
    legs.push({ from: a, to: b, path, hops });
  }
  return { legs, totalSteps, complete };
}

// Count steps that go through special exits (gates, portals) in a path.
function countSpecialSteps(path, idx) {
  if (!path || path.length < 2) return 0;
  let count = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const r = idx.get(path[i])?.room;
    if (!r) continue;
    const toId = +path[i + 1];
    const inNormal = Object.values(r.exits || {}).some(v => +v === toId);
    const inSpecial = Object.values(r.special_exits || {}).some(v => +v === toId);
    if (inSpecial && !inNormal) count++;
  }
  return count;
}

/**
 * Search rooms by name fragment or by id.
 * A query of digits (optionally prefixed with '#') matches the room id
 * exactly; anything else is a case-insensitive substring match on room.name
 * (Arkadia crowd-map names carry the region as a suffix, so region search
 * works through the name). Results follow map order, cut at `limit`.
 * @param {string} query
 * @param {object} mapObj arkmap map
 * @param {number} [limit=25]
 * @returns {Array<{room: object, areaId: number, areaName: string}>}
 */
function searchRooms(query, mapObj, limit = 25) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const asId = /^#?(\d+)$/.exec(q);
  const out = [];
  for (const area of mapObj?.areas || []) {
    for (const room of area.rooms || []) {
      const name = (room.name || '').toLowerCase();
      const hit = asId ? room.id === parseInt(asId[1]) : name.includes(q);
      if (hit) out.push({ room, areaId: area.id, areaName: area.name || String(area.id) });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export { buildIndex, edgeWeight, neighborsOf, findPath, findRoute, planRoute, countSpecialSteps, searchRooms };

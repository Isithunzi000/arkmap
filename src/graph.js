// graph.js — room graph over an arkmap map: indexing, adjacency, pathfinding, search.
//
// Hand-written module (not extracted from the standalone app).
// Pure and stateless: no I/O, no randomness, no clock — same input, same output.
//
// Adjacency: room.exits + room.special_exits. Edge weight comes from
// room.exit_weights[dir|cmd]; missing/invalid weight (non-number, negative,
// non-finite) falls back to 1. Weight 0 is legal. Exit targets that do not
// resolve to a room in the index are skipped (dangling exits are tolerated).
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// `export function` declarations only, no import statements, no export lists.

/**
 * Build a room lookup index over all areas.
 * Duplicate room ids across areas: the last occurrence wins (room ids are
 * unique in well-formed maps; this keeps the result deterministic regardless).
 * @param {object} map arkmap map ({ areas: [{ id, name?, rooms: [...] }] })
 * @returns {Map<number, {room: object, areaId: number, areaName: string}>}
 */
export function buildIndex(map) {
  const idx = new Map();
  for (const area of map?.areas || []) {
    const areaName = area.name || String(area.id);
    for (const room of area.rooms || []) idx.set(room.id, { room, areaId: area.id, areaName });
  }
  return idx;
}

/**
 * Adjacency list of a room: [[targetRoomId, weight], ...].
 * Regular exits first (in key order), then special exits. Dangling targets
 * are NOT filtered here (findPath skips them against the index).
 * @param {object} room
 * @returns {Array<[number, number]>}
 */
export function neighborsOf(room) {
  const out = [];
  for (const [dir, tgt] of Object.entries(room.exits || {})) {
    let w = room.exit_weights?.[dir];
    if (typeof w !== 'number' || w < 0 || !Number.isFinite(w)) w = 1;
    out.push([tgt, w]);
  }
  for (const [cmd, tgt] of Object.entries(room.special_exits || {})) {
    let w = room.exit_weights?.[cmd];
    if (typeof w !== 'number' || w < 0 || !Number.isFinite(w)) w = 1;
    out.push([tgt, w]);
  }
  return out;
}

/**
 * Shortest path between two rooms (Dijkstra over exits + special_exits).
 * Returns an array of room ids from fromId to toId inclusive, [fromId] when
 * from === to, or null when either id is unknown or the target is unreachable.
 * Among equal-cost shortest paths the choice is deterministic but unspecified
 * — do not rely on a specific tie-break.
 * @param {number} fromId
 * @param {number} toId
 * @param {Map<number, {room: object}>} idx index from buildIndex()
 * @returns {number[] | null}
 */
export function findPath(fromId, toId, idx) {
  if (!idx.has(fromId) || !idx.has(toId)) return null;
  if (fromId === toId) return [fromId];
  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  // binary heap of [cost, roomId]
  const heap = [[0, fromId]];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
    }
  };
  const pop = () => {
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
  };
  while (heap.length) {
    const [d, id] = pop();
    if (id === toId) {
      const path = [toId];
      let cur = toId;
      while (prev.has(cur)) { cur = prev.get(cur); path.push(cur); }
      return path.reverse();
    }
    if (d > (dist.get(id) ?? Infinity)) continue;
    for (const [nid, w] of neighborsOf(idx.get(id).room)) {
      if (!idx.has(nid)) continue;
      const nd = d + w;
      if (nd < (dist.get(nid) ?? Infinity)) { dist.set(nid, nd); prev.set(nid, id); push([nd, nid]); }
    }
  }
  return null;
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
export function searchRooms(query, mapObj, limit = 25) {
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

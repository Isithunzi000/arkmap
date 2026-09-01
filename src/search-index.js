// search-index.js — token-indexed room search for any arkmap map.
//
// Hand-written module (not extracted from the standalone app).
//
// Scoring parity with ArkMap Studio's planner search (wpDoSearch):
//   token = lowercase word (split on \s+) of a room name or an area name.
//   The index maps token -> { n: [roomId...] (name hits), a: [roomId...]
//   (area hits) }. Query words are matched as substrings of tokens —
//   exactness note: a query word contains no whitespace, so
//   name.includes(word) is equivalent to "some token of the name includes
//   the word". Per query word: union of name+area hits; the candidate set is
//   intersected across words. Score: each word found in the room name = 2
//   points, in the area name = 1 point; a room whose id equals the numeric
//   query scores 999. Results sort by score desc, ties keep map traversal
//   order (stable sort over ord-ordered candidates), cut at `limit`.
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// plain function/const declarations, single-line imports, one-line export list.

// buildSearchIndex(mapObj) -> {
//   tok:  Map token -> { n: roomId[], a: roomId[] },
//   ord:  Map roomId -> position in map traversal (stable tie-break),
//   byId: Map roomId -> room,
//   areaOf: Map roomId -> areaId,
//   areaNames: Map areaId -> string,
// }
function buildSearchIndex(mapObj) {
  const tok = new Map(), ord = new Map(), byId = new Map(), areaOf = new Map(), areaNames = new Map();
  let i = 0;
  for (const area of mapObj?.areas || []) {
    areaNames.set(area.id, area.name || '');
    for (const room of area.rooms || []) {
      ord.set(room.id, i++);
      byId.set(room.id, room);
      areaOf.set(room.id, area.id);
      const nameLow = (room.name || '').toLowerCase();
      const areaLow = (area.name || '').toLowerCase();
      for (const t of new Set(nameLow.split(/\s+/).filter(Boolean))) {
        let e = tok.get(t); if (!e) { e = { n: [], a: [] }; tok.set(t, e); }
        e.n.push(room.id);
      }
      for (const t of new Set(areaLow.split(/\s+/).filter(Boolean))) {
        let e = tok.get(t); if (!e) { e = { n: [], a: [] }; tok.set(t, e); }
        e.a.push(room.id);
      }
    }
  }
  return { tok, ord, byId, areaOf, areaNames };
}

// searchIndexed(index, query, limit = 25) ->
//   [{ roomId, name, areaName, score }] — scoring rules in the header.
function searchIndexed(index, query, limit = 25) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !index) return [];
  const byNum = parseInt(q);
  const words = q.split(/\s+/).filter(Boolean);

  // candidates from the token index (per word: name OR area; intersect words)
  let cand = null;
  for (const w of words) {
    const uni = new Set();
    for (const [t, e] of index.tok) {
      if (!t.includes(w)) continue;
      for (const id of e.n) uni.add(id);
      for (const id of e.a) uni.add(id);
    }
    cand = cand === null ? uni : new Set([...cand].filter(id => uni.has(id)));
    if (cand.size === 0) break;
  }
  const idRoom = (!isNaN(byNum) && index.byId.has(byNum)) ? byNum : null;
  if (idRoom !== null) { if (!cand) cand = new Set(); cand.add(idRoom); }
  if (!cand) return [];

  const hits = [];
  const ids = [...cand].sort((x, y) => index.ord.get(x) - index.ord.get(y));
  for (const id of ids) {
    const r = index.byId.get(id);
    if (!r) continue;
    const nameLow = (r.name || '').toLowerCase();
    const areaName = index.areaNames.get(index.areaOf.get(id)) || '';
    const areaLow = areaName.toLowerCase();
    const idMatch = !isNaN(byNum) && r.id === byNum;
    if (words.length === 0 && !idMatch) continue;
    let score = 0, allMatch = true;
    for (const w of words) {
      const inName = nameLow.includes(w);
      const inArea = areaLow.includes(w);
      if (!inName && !inArea) { allMatch = false; break; }
      score += inName ? 2 : 1;
    }
    if (allMatch || idMatch) {
      hits.push({ roomId: r.id, name: r.name || `#${r.id}`, areaName, score: idMatch ? 999 : score });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

export { buildSearchIndex, searchIndexed };

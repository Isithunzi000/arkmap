// waypoints.js — universal route codes (waypoint import/export) for any map.
//
// Hand-written module (not extracted from the standalone app).
//
// Format (generation 3): arkmap:<algo><dir><trans>:<ids CSV>:<crc8>
//   algo:  d = dijkstra, a = astar
//   dir:   k = cardinal, p = vertical, w = all
//   trans: p = off,     n = normal,  g = aggressive
//   ids:   comma-separated positive integer room ids, canonical form
//          (no leading zeros, no whitespace)
//   crc8:  first 8 hex chars of xxh3_64hex over the lowercased prefix
//          "arkmap:<flags>:<ids>" — paste-integrity check (typos, truncated
//          or mangled codes), not a security feature
// Example: arkmap:dwp:2188,1998,729:16990e69
//
// The encoder always emits lowercase; the decoder lowercases the whole code
// before parsing, so letter case is insignificant everywhere (prefix, flags,
// crc). There is no backward compatibility with older generations
// (ARKMAP:/ARKMAP2:, base64 payloads) — they decode to null by design.
//
// Fail-closed everywhere: the encoder never produces a code its own decoder
// would reject; the decoder returns null on any structural corruption, a
// { error: 'crc' } object on checksum mismatch and { error: 'too-many' }
// when the waypoint limit is exceeded.
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// plain function/const declarations, single-line import, one-line export list.

import { xxh3_64hex } from './checksum.js';

const ROUTE_CODE_PREFIX = 'arkmap';
const ROUTE_CODE_MAX = 64000;   // hard cap on code length (decoder fails closed above)
const WP_MAX = 200;             // hard cap on waypoints per route code

const _te = new TextEncoder();

// crc of the normalized core "arkmap:<flags>:<ids>" — 32 bits of xxh3_64,
// hex-lowercase by construction (matches the lowercased decode path).
function _routeCrc(core) {
  return xxh3_64hex(_te.encode(core)).slice(0, 8);
}

// encodeRoute(waypoints, opts) -> route code string, or '' when the route is
// not encodable (fewer than 2 known ids, non-integer/non-positive id, too
// many waypoints). waypoints may contain nulls (unfilled slots are skipped).
// opts: { algorithm: 'dijkstra'|'astar', dirMode: 'cardinal'|'vertical'|'all',
//         transportMode: 'off'|'normal'|'aggressive' } — unknown values fall
// back to the most permissive default (dijkstra / all / off).
function encodeRoute(waypoints, opts) {
  const o = opts || {};
  const ids = (Array.isArray(waypoints) ? waypoints : []).filter(id => id !== null && id !== undefined);
  if (ids.length < 2) return '';
  if (ids.length > WP_MAX) return '';
  if (ids.some(id => !Number.isInteger(id) || id <= 0)) return '';   // fail-closed
  const algoCode = o.algorithm === 'astar' ? 'a' : 'd';
  const dirCode = { cardinal: 'k', vertical: 'p', all: 'w' }[o.dirMode] || 'w';
  const transCode = { off: 'p', normal: 'n', aggressive: 'g' }[o.transportMode] || 'p';
  const core = ROUTE_CODE_PREFIX + ':' + algoCode + dirCode + transCode + ':' + ids.join(',');
  try { return core + ':' + _routeCrc(core); }
  catch { return ''; }
}

// decodeRoute(code, hasRoom?) ->
//   null                                        — structurally corrupt code
//   { error: 'crc', expected, actual }          — integrity check failed
//   { error: 'too-many', max, total }           — waypoint count over WP_MAX
//   { ids, valid, invalidCount, total, algorithm, dirMode, transportMode }
// The code is case-insensitive: it is lowercased before parsing, and the crc
// is computed over the lowercased form. hasRoom(id) — optional predicate
// (e.g. id => idx.has(id)); without it every id counts as valid
// (valid = ids, invalidCount = 0). `ids` keeps all decoded ids in order;
// `valid` holds only those passing hasRoom.
function decodeRoute(code, hasRoom) {
  const raw = (typeof code === 'string' ? code : '').trim();
  if (!raw) return null;
  if (raw.length > ROUTE_CODE_MAX) return null;   // fail-closed on huge pastes
  const norm = raw.toLowerCase();
  if (!norm.startsWith(ROUTE_CODE_PREFIX + ':')) return null;
  const parts = norm.slice(ROUTE_CODE_PREFIX.length + 1).split(':');
  if (parts.length !== 3) return null;
  const [flags, csv, crc] = parts;
  const algorithm = { d: 'dijkstra', a: 'astar' }[flags[0]];
  const dirMode = { k: 'cardinal', p: 'vertical', w: 'all' }[flags[1]];
  const transportMode = { p: 'off', n: 'normal', g: 'aggressive' }[flags[2]];
  if (flags.length !== 3 || !algorithm || !dirMode || !transportMode) return null;
  if (!/^[0-9a-f]{8}$/.test(crc)) return null;                 // crc shape
  if (!/^[1-9][0-9]*(,[1-9][0-9]*)*$/.test(csv)) return null;  // canonical CSV
  const core = ROUTE_CODE_PREFIX + ':' + flags + ':' + csv;
  const expected = _routeCrc(core);
  if (crc !== expected) return { error: 'crc', expected, actual: crc };
  const tokens = csv.split(',');
  if (tokens.length > WP_MAX) return { error: 'too-many', max: WP_MAX, total: tokens.length };
  const ids = tokens.map(t => parseInt(t, 10));
  const valid = [];
  let invalidCount = 0;
  for (const id of ids) {
    if (!hasRoom || hasRoom(id)) valid.push(id);
    else invalidCount++;
  }
  return { ids, valid, invalidCount, total: ids.length, algorithm, dirMode, transportMode };
}

export { ROUTE_CODE_PREFIX, ROUTE_CODE_MAX, WP_MAX, encodeRoute, decodeRoute };

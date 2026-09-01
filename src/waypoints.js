// waypoints.js — universal route codes (waypoint import/export) for any map.
//
// Hand-written module (not extracted from the standalone app; logic mirrors
// the app's wpEncodeRoute/wpDecodeRoute byte-for-byte in behavior).
//
// Format: ARKMAP2:<algo><dir><trans>:base64(ids CSV)
//   algo:  d = dijkstra, a = astar
//   dir:   k = cardinal, p = vertical, w = all
//   trans: p = off,     n = normal,  g = aggressive
//
// Fail-closed everywhere: the encoder never produces a code its own decoder
// would reject; the decoder returns null on any structural corruption and a
// { error: 'too-many' } object when the waypoint limit is exceeded.
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// plain function/const declarations, no imports, one-line export list.

const ROUTE_CODE_PREFIX = 'ARKMAP2';
const ROUTE_CODE_MAX = 64000;   // hard cap on code length (decoder fails closed above)
const WP_MAX = 200;             // hard cap on waypoints per route code

// base64 that works in Node and browsers without touching Buffer/atob globals
const _B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function _b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += _B64[a >> 2] + _B64[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
    out += b === undefined ? '=' : _B64[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)];
    out += c === undefined ? '=' : _B64[c & 63];
  }
  return out;
}
function _b64decode(str) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str) || str.length % 4 !== 0) throw new Error('bad base64');
  const bytes = [];
  for (let i = 0; i < str.length; i += 4) {
    const c = [0, 1, 2, 3].map(k => (str[i + k] === '=' ? -1 : _B64.indexOf(str[i + k])));
    if (c.some(v => v < -1) || c[0] < 0 || c[1] < 0) throw new Error('bad base64');
    const n = (c[0] << 18) | ((c[1] & 63) << 12) | ((c[2] & 63) << 6) | (c[3] & 63);
    bytes.push((n >> 16) & 255);
    if (c[2] >= 0) bytes.push((n >> 8) & 255);
    if (c[3] >= 0) bytes.push(n & 255);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
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
  try { return ROUTE_CODE_PREFIX + ':' + algoCode + dirCode + transCode + ':' + _b64encode(ids.join(',')); }
  catch { return ''; }
}

// decodeRoute(code, hasRoom?) ->
//   null                                  — structurally corrupt code
//   { error: 'too-many', max, total }     — waypoint count over WP_MAX
//   { ids, valid, invalidCount, total, algorithm, dirMode, transportMode }
// hasRoom(id) — optional predicate (e.g. id => idx.has(id)); without it every
// id counts as valid (valid = ids, invalidCount = 0). `ids` keeps all decoded
// ids in order; `valid` holds only those passing hasRoom.
function decodeRoute(code, hasRoom) {
  const raw = (typeof code === 'string' ? code : '').trim();
  if (!raw.startsWith(ROUTE_CODE_PREFIX + ':')) return null;
  if (raw.length > ROUTE_CODE_MAX) return null;   // fail-closed on huge pastes
  const rest = raw.slice(ROUTE_CODE_PREFIX.length + 1);
  if (rest.length < 5 || rest[3] !== ':') return null;
  const flags = rest.slice(0, 3);
  const b64 = rest.slice(4);
  const algorithm = { d: 'dijkstra', a: 'astar' }[flags[0]];
  const dirMode = { k: 'cardinal', p: 'vertical', w: 'all' }[flags[1]];
  const transportMode = { p: 'off', n: 'normal', g: 'aggressive' }[flags[2]];
  if (!algorithm || !dirMode || !transportMode || !b64) return null;
  let decoded;
  try { decoded = _b64decode(b64); } catch { return null; }
  const tokens = decoded.split(',');
  if (tokens.length > WP_MAX) return { error: 'too-many', max: WP_MAX, total: tokens.length };
  if (!tokens.length) return null;
  const ids = [];
  for (const t of tokens) {
    const n = parseInt(t.trim(), 10);
    if (isNaN(n) || n <= 0 || String(n) !== t.trim()) return null;
    ids.push(n);
  }
  const valid = [];
  let invalidCount = 0;
  for (const id of ids) {
    if (!hasRoom || hasRoom(id)) valid.push(id);
    else invalidCount++;
  }
  return { ids, valid, invalidCount, total: ids.length, algorithm, dirMode, transportMode };
}

export { ROUTE_CODE_PREFIX, ROUTE_CODE_MAX, WP_MAX, encodeRoute, decodeRoute };

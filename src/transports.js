// transports.js — universal transport lines (ships, coaches, portals) for any map.
//
// Hand-written module (not extracted from the standalone app).
// Standard `arkmap-transports` v1: a document (embedded as map.transports or kept
// as a sidecar JSON) describing named lines; each line has boarding commands,
// an exit command and ordered legs { from, to, time, label }. Leg order is
// semantic (it defines the ride); line order in the array is not.
//
// Integrity: addTransportChecksums/verifyTransportChecksums sign and verify the
// document per line (checksums.transports = { hash, lines }), mirroring the
// room/area checksum pattern. Transport sums are reported separately from the
// map data sums (auxiliary routing data — same class as meta, design D2).
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// plain function/const declarations, single-line imports, one-line export list.

import { xxh3_64hex } from './checksum.js';
import { stableStringify } from './stable-stringify.js';

// Cost model (same values as the reference implementation): hop cost =
// sum(leg times) * ratio + one boarding penalty per ride. The penalty covers
// the average wait for departure, so a direct crossing beats transfers.
const TRANSPORT_BOARDING_PENALTY = { normal: 30, aggressive: 10 };
const TRANSPORT_TIME_RATIO = { normal: 0.5, aggressive: 0.1 };
const TRANSPORT_DEFAULT_TIME = 60;   // when a leg has no measured time

const TRANSPORTS_FORMAT = 'arkmap-transports';
const TRANSPORTS_VERSION = 1;

// ── validation ─────────────────────────────────────────────────────────────

function validateTransports(doc) {
  const errors = [];
  const err = (path, msg) => errors.push({ path, msg });
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: [{ path: 'transports', msg: 'must be an object' }] };
  }
  if (doc.format !== TRANSPORTS_FORMAT) err('transports.format', `must be '${TRANSPORTS_FORMAT}'`);
  if (doc.version !== TRANSPORTS_VERSION) err('transports.version', `must be ${TRANSPORTS_VERSION}`);
  if (!Array.isArray(doc.lines)) {
    err('transports.lines', 'must be an array');
    return { ok: false, errors };
  }
  const seen = new Set();
  for (let i = 0; i < doc.lines.length; i++) {
    const L = doc.lines[i], p = `transports.lines[${i}]`;
    if (!L || typeof L !== 'object') { err(p, 'must be an object'); continue; }
    if (typeof L.name !== 'string' || !L.name.trim()) err(`${p}.name`, 'must be a non-empty string');
    else if (seen.has(L.name)) err(`${p}.name`, `duplicate line name '${L.name}' (lines are keyed by name)`);
    else seen.add(L.name);
    if (!Array.isArray(L.board) || !L.board.length || L.board.some(c => typeof c !== 'string')) {
      err(`${p}.board`, 'must be a non-empty array of strings');
    }
    if (typeof L.exit !== 'string' || !L.exit.trim()) err(`${p}.exit`, 'must be a non-empty string');
    if (!Array.isArray(L.legs) || !L.legs.length) { err(`${p}.legs`, 'must be a non-empty array'); continue; }
    for (let j = 0; j < L.legs.length; j++) {
      const g = L.legs[j], gp = `${p}.legs[${j}]`;
      if (!g || typeof g !== 'object') { err(gp, 'must be an object'); continue; }
      if (!Number.isInteger(g.from) || g.from <= 0) err(`${gp}.from`, 'must be a positive integer room id');
      if (!Number.isInteger(g.to) || g.to <= 0) err(`${gp}.to`, 'must be a positive integer room id');
      if (g.time !== undefined && g.time !== null && (typeof g.time !== 'number' || !(g.time > 0))) {
        err(`${gp}.time`, 'must be a positive number, null or omitted');
      }
      if (g.label !== undefined && g.label !== null && typeof g.label !== 'string') {
        err(`${gp}.label`, 'must be a string, null or omitted');
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

// ── normalization ──────────────────────────────────────────────────────────

// normalizeTransports(raw) — accepts the compact tuple format used by the
// Arkadia community data source ([name, board[], exitCmd, [[from,to,time,label], ...]])
// and returns a standard arkmap-transports v1 document.
function normalizeTransports(raw) {
  const lines = [];
  for (const entry of raw || []) {
    const [name, board, exitCmd, stops] = entry;
    const legs = [];
    for (const s of stops || []) {
      const leg = { from: s[0], to: s[1] };
      if (s[2] != null) leg.time = s[2];
      if (s[3] != null) leg.label = s[3];
      legs.push(leg);
    }
    lines.push({ name, board: [...(board || [])], exit: exitCmd, legs });
  }
  return { format: TRANSPORTS_FORMAT, version: TRANSPORTS_VERSION, lines };
}

// Canonical forms for hashing: undefined fields dropped; lines sorted by name
// (array order is not semantic); leg order preserved (it defines the ride).
function _canonLeg(g) {
  const o = { from: g.from, to: g.to };
  if (g.time != null) o.time = g.time;
  if (g.label != null) o.label = g.label;
  return o;
}
function _canonLine(L) {
  return { name: L.name, board: [...L.board], exit: L.exit, legs: L.legs.map(_canonLeg) };
}
function _canonDoc(doc) {
  return {
    format: doc.format, version: doc.version,
    lines: (doc.lines || []).map(_canonLine).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  };
}
function _hash(obj) {
  return xxh3_64hex(new TextEncoder().encode(stableStringify(obj)));
}

// ── integrity (checksums.transports) ───────────────────────────────────────

// addTransportChecksums(map) — sign map.transports into the checksums envelope
// (map.checksums.transports = { hash, lines }). Independent of addChecksums
// ordering; without map.transports any stored transport sums are removed, so
// a re-save never leaves orphan signatures. In place, returns map.
function addTransportChecksums(map) {
  if (!map.checksums) map.checksums = { alg: 'v4' };
  if (!map.transports) { delete map.checksums.transports; return map; }
  const canon = _canonDoc(map.transports);
  const lines = {};
  for (const L of canon.lines) lines[L.name] = _hash(L);
  map.checksums.transports = { hash: _hash(canon), lines };
  return map;
}

// verifyTransportChecksums(map) — never throws. Returns:
//   { present, ok, unsigned?, badLines, missingLines, extraLines, verifyError? }
// Semantics mirror room/area sums: badLines = content changed; missingLines =
// line added after signing (unsigned); extraLines = signature orphan (line removed).
function verifyTransportChecksums(map) {
  const none = { badLines: [], missingLines: [], extraLines: [] };
  const stored = map?.checksums?.transports;
  const doc = map?.transports;
  if (!stored && !doc) return { present: false, ok: true, ...none };
  if (!stored && doc) {
    return { present: false, ok: true, unsigned: true, ...none,
             lineCount: Array.isArray(doc.lines) ? doc.lines.length : 0 };
  }
  let current;
  try { current = doc ? _canonDoc(doc) : null; }
  catch { return { present: true, ok: false, verifyError: true, ...none }; }
  const storedLines = stored.lines || {};
  if (!current) {
    return { present: true, ok: false, hashOk: false,
             badLines: [], missingLines: [], extraLines: Object.keys(storedLines).sort() };
  }
  const curLines = {};
  for (const L of current.lines) curLines[L.name] = _hash(L);
  const badLines = [], missingLines = [], extraLines = [];
  for (const name of Object.keys(curLines)) {
    if (!(name in storedLines)) missingLines.push(name);
    else if (storedLines[name] !== curLines[name]) badLines.push(name);
  }
  for (const name of Object.keys(storedLines)) {
    if (!(name in curLines)) extraLines.push(name);
  }
  badLines.sort(); missingLines.sort(); extraLines.sort();
  const hashOk = stored.hash === _hash(current);
  return { present: true, ok: hashOk && !badLines.length && !missingLines.length && !extraLines.length,
           hashOk, badLines, missingLines, extraLines };
}

// ── routing edges ──────────────────────────────────────────────────────────

// buildTransportEdges(doc, idx, opts) — virtual edges for the router:
// Map(roomId -> [{ to, cost, hop }]). idx is a room index from buildIndex();
// chains stop at rooms missing from the map (foreign map segment). A hop
// carries { name, board, exit, from, to, label, via, time } for display.
function buildTransportEdges(doc, idx, opts) {
  const mode = (opts && opts.mode) || 'normal';
  const penalty = TRANSPORT_BOARDING_PENALTY[mode];
  const ratio = TRANSPORT_TIME_RATIO[mode];
  const edges = new Map();
  if (penalty === undefined) return edges;   // unknown mode — no edges (fail-closed)
  for (const L of (doc && doc.lines) || []) {
    const stops = L.legs.map(g => [g.from, g.to, g.time, g.label]);
    const n = stops.length;
    for (let i = 0; i < n; i++) {
      const fromId = stops[i][0];
      if (!idx.has(fromId)) continue;
      let cumTime = 0, chainFrom = fromId;
      const via = [];
      for (let off = 0; off < n; off++) {
        const s = stops[(i + off) % n];
        if (s[0] !== chainFrom) break;              // chain must stay contiguous
        cumTime += (typeof s[2] === 'number' && s[2] > 0) ? s[2] : TRANSPORT_DEFAULT_TIME;
        const toId = s[1];
        if (toId === fromId) break;                 // return loop — skip
        if (!idx.has(toId)) break;                  // room not in this map
        const hop = { name: L.name, board: L.board, exit: L.exit, from: fromId, to: toId,
                      label: s[3] ?? null, via: via.slice(), time: cumTime };
        const cost = cumTime * ratio + penalty;
        if (!edges.has(fromId)) edges.set(fromId, []);
        edges.get(fromId).push({ to: toId, cost, hop });
        via.push(s[3]);
        chainFrom = toId;
      }
    }
  }
  return edges;
}

export { TRANSPORT_BOARDING_PENALTY, TRANSPORT_TIME_RATIO, TRANSPORT_DEFAULT_TIME, TRANSPORTS_FORMAT, TRANSPORTS_VERSION, validateTransports, normalizeTransports, addTransportChecksums, verifyTransportChecksums, buildTransportEdges };

// delta-validate.js — .arkdelta reader: fail-closed validation, integrity
// checksums, base identity, Ed25519 signature verification (verify-only).
//
// .arkdelta is the edit-delta format of ArkMap Studio: an ordered op log
// (25 op types) over a base map, with canonical XXH3-64 checksums and
// optional author signatures. Spec: docs/arkdelta_spec.html (Studio repo).
//
// Origin: ArkMap Studio @ 24bd902 (pinned extract source), ARKDELTA block
// (validator, schema, sid machinery, checksums) + identity block (signature
// verify path). Maintained module — tracked in EXTRACT_MANIFEST.json.
//
// Divergences from the Studio source:
// - user-facing strings come from locale.js catalogs (opts.locale, EN default;
//   PL catalog byte-pinned to Studio's validator wording)
// - result carries a parallel `codes` array (stable machine codes)
// - validateDeltaText never throws (Studio contract preserved)
// - computeBaseInfo takes the map explicitly (Studio falls back to global state)
// - VALID_DIRS derived from DIR_BY_SHORT (constants.js)
// - crypto resolved at call time (browser globalThis.crypto, else node:crypto)

import { stableStringify } from './stable-stringify.js';
import { xxh3_64hex, _computeV4Checksums } from './checksum.js';
import { DIR_BY_SHORT } from './constants.js';
import { LOCALES, resolveLocale, translate } from './locale.js';

const ARKDELTA_FORMAT = 'arkdelta';
const ARKDELTA_FORMAT_VERSION = 3;  // envelope v3 (D1): format/format_version/checksums top-level
// P-LOCK-2: complete top-level key whitelist — foreign keys are not covered by
// the signature (pre P-LOCK-1), so the validator rejects them loudly (fail-closed).
const _DELTA_TOP_KEYS = new Set(['format', 'format_version', 'meta', 'ops', 'checksums']);
const ARKDELTA_MAX_OPS = 5000;
const ARKDELTA_MAX_BYTES = 8 * 1024 * 1024;
const _DELTA_SID_RE = /^d:[1-9][0-9]*$/;

const VALID_DIRS = new Set(Object.keys(DIR_BY_SHORT)); // n,ne,e,se,s,sw,w,nw,up,down,in,out

const _canonTe = new TextEncoder();

// deltaChecksums(meta, ops) — integrity sums of the delta: XXH3-64 over
// stableStringify canonical serialization (UTF-8). Envelope v3 (D1/D2):
// checksums.file covers { format, format_version, meta, ops } — the whole file
// minus the checksums object (so checksums.sig lies outside the input by
// construction, no exclusion rules). checksums.ops: per-op sums — diagnostic
// only (corruption localization), not a gate. One shared point for both
// builders (delta-build.js) and import verification.
function deltaChecksums(meta, ops) {
  const h = o => xxh3_64hex(_canonTe.encode(stableStringify(o)));
  return { file: h({ format: ARKDELTA_FORMAT, format_version: ARKDELTA_FORMAT_VERSION, meta, ops }), ops: ops.map(h) };
}

// ── Op schema (spec .arkdelta §7): required target/payload keys per op type ──
const _DELTA_SCHEMA = {
  ADD_ROOM:             { target: ['roomId', 'areaId'], payload: ['room'] },
  DELETE_ROOM:          { target: ['roomId', 'areaId'], payload: ['room'] },
  EDIT_ROOM:            { target: ['roomId'], payload: ['before', 'after'] },
  EDIT_EXIT:            { target: ['roomId'], payload: ['before', 'after'] },
  PAINT_BATCH:          { target: [], payload: ['changes'] },
  MOVE_ROOM:            { target: ['roomId'], payload: ['toX', 'toY', 'toZ'] },
  MOVE_ROOM_TO_AREA:    { target: ['roomId'], payload: ['toAreaId'] },
  ADD_EXIT:             { target: ['sourceId', 'dir'], payload: ['targetId'] },
  DELETE_EXIT:          { target: ['roomId', 'dir'], payload: [] },
  DELETE_SPECIAL_EXIT:  { target: ['roomId'], payload: ['cmd'] },
  ADD_AREA:             { target: ['areaId'], payload: ['area'] },
  DELETE_AREA:          { target: ['areaId'], payload: [] },
  EDIT_AREA:            { target: ['areaId'], payload: ['name'] },
  ADD_CL:               { target: ['roomId', 'dir'], payload: ['cl'] },
  EDIT_CL:              { target: ['roomId', 'dir'], payload: ['before', 'after'] },
  DELETE_CL:            { target: ['roomId', 'dir'], payload: [] },
  DELETE_SUPPRESSOR:    { target: ['roomId', 'dir'], payload: [] },
  ADD_SUPPRESSOR:       { target: ['roomId', 'dir'], payload: [] },
  AUTO_FIX_SUPPRESSORS: { target: [], payload: ['added', 'removed'] },
  ADD_LABEL:            { target: ['areaId'], payload: ['label'] },
  EDIT_LABEL:           { target: ['areaId', 'labelId'], payload: ['before', 'after'] },
  DELETE_LABEL:         { target: ['areaId', 'labelId'], payload: ['label'] },
  MOVE_LABEL:           { target: ['areaId', 'labelId'], payload: ['toX', 'toY'] },
  RESIZE_LABEL:         { target: ['areaId', 'labelId'], payload: ['toX', 'toY', 'toW', 'toH'] },
  EDIT_ENV_COLOR:       { target: ['envId'], payload: ['newColor'] },
};

// D1 (spec .arkdelta §4): CLOSED op field set — an unknown key in an op or at
// the first level of target/payload = load refusal (fail-closed: a delta from
// a foreign producer cannot smuggle fields the reader does not understand).
// Required keys: _DELTA_SCHEMA; optional (emitted by v3): below.
// Deeper containers (room/label/cl/area/changes/before/after) are not strict —
// they carry user data (e.g. user_data inside room).
const _DELTA_OPT_TARGET = {};  // currently no optional target fields
const _DELTA_OPT_PAYLOAD = {
  MOVE_ROOM:           ['fromX', 'fromY', 'fromZ'],
  MOVE_ROOM_TO_AREA:   ['fromAreaId'],
  ADD_EXIT:            ['bidirectional'],
  DELETE_EXIT:         ['exitId'],
  DELETE_SPECIAL_EXIT: ['targetId'],
  DELETE_AREA:         ['name'],
  EDIT_AREA:           ['user_data', 'beforeName', 'beforeUserData'],
  DELETE_CL:           ['cl'],
  DELETE_SUPPRESSOR:   ['cl'],
  MOVE_LABEL:          ['fromX', 'fromY'],
  RESIZE_LABEL:        ['fromX', 'fromY', 'fromW', 'fromH'],
  EDIT_ENV_COLOR:      ['oldColor'],
};
const _DELTA_OP_KEYS = new Set(['seq', 'type', 'target', 'payload', 'label']);

// Reference positions for sid d:N — ONE source of truth. sids are validated
// and translated ONLY in reference positions (ref keys of target/payload per
// type + id-valued fields in containers: id, exits, special_exits, targetId,
// roomId). Text fields (name/notes/text/user_data/label.text) NEVER — a room
// may legitimately be named "d:1". Consumers: the validator (use collection),
// _deltaTranslate in delta-apply.js (substitution), leftover scan in applyDelta.
const _DELTA_REF_TARGET = {
  ADD_ROOM: ['roomId', 'areaId'], DELETE_ROOM: ['roomId', 'areaId'], EDIT_ROOM: ['roomId'],
  EDIT_EXIT: ['roomId'], MOVE_ROOM: ['roomId'], MOVE_ROOM_TO_AREA: ['roomId'],
  ADD_EXIT: ['sourceId'], DELETE_EXIT: ['roomId'], DELETE_SPECIAL_EXIT: ['roomId'],
  ADD_CL: ['roomId'], EDIT_CL: ['roomId'], DELETE_CL: ['roomId'],
  DELETE_SUPPRESSOR: ['roomId'], ADD_SUPPRESSOR: ['roomId'],
  ADD_AREA: ['areaId'], DELETE_AREA: ['areaId'], EDIT_AREA: ['areaId'],
  ADD_LABEL: ['areaId'], EDIT_LABEL: ['areaId', 'labelId'], DELETE_LABEL: ['areaId', 'labelId'],
  MOVE_LABEL: ['areaId', 'labelId'], RESIZE_LABEL: ['areaId', 'labelId'],
  PAINT_BATCH: [], AUTO_FIX_SUPPRESSORS: [], EDIT_ENV_COLOR: [],
};
const _DELTA_REF_PAYLOAD = {
  MOVE_ROOM_TO_AREA: ['toAreaId'], ADD_EXIT: ['targetId'],
};
// Payload containers with id-valued fields: key -> container kind.
const _DELTA_REF_CONTAINERS = {
  ADD_ROOM: { room: 'room' }, DELETE_ROOM: { room: 'room' },
  EDIT_ROOM: { before: 'room', after: 'room' }, EDIT_EXIT: { before: 'room', after: 'room' },
  ADD_LABEL: { label: 'label' }, EDIT_LABEL: { before: 'label', after: 'label' },
  DELETE_LABEL: { label: 'label' }, ADD_AREA: { area: 'area' },
  PAINT_BATCH: { changes: 'changes' },
  AUTO_FIX_SUPPRESSORS: { added: 'changes', removed: 'changes' },
};
// Slots [obj, key] of the op's reference positions (mutable — translation
// substitutes in place).
function _deltaSidRefSlots(op) {
  const slots = [];
  const T = op.target || {}, P = op.payload || {};
  for (const k of (_DELTA_REF_TARGET[op.type] || [])) if (T[k] !== undefined) slots.push([T, k]);
  for (const k of (_DELTA_REF_PAYLOAD[op.type] || [])) if (P[k] !== undefined) slots.push([P, k]);
  const walkRoom = (room) => {
    if (!room || typeof room !== 'object') return;
    if (room.id !== undefined) slots.push([room, 'id']);
    if (room.exits) for (const d of Object.keys(room.exits)) slots.push([room.exits, d]);
    if (room.special_exits) for (const c of Object.keys(room.special_exits)) slots.push([room.special_exits, c]);
  };
  const cont = _DELTA_REF_CONTAINERS[op.type] || {};
  for (const key of Object.keys(cont)) {
    const c = P[key];
    if (cont[key] === 'room') walkRoom(c);
    else if (cont[key] === 'label' || cont[key] === 'area') { if (c && typeof c === 'object' && c.id !== undefined) slots.push([c, 'id']); }
    else if (cont[key] === 'changes') {
      if (Array.isArray(c)) for (const ch of c) if (ch && typeof ch === 'object' && ch.roomId !== undefined) slots.push([ch, 'roomId']);
    }
  }
  return slots;
}

const _DELTA_MAX_DEPTH = 60;  // delta scanner recursion limit — controlled error instead of RangeError (the "never throws" contract of validateDeltaText)
function _deltaScanDeep(val, onKey, onStr, depth) {
  depth = depth || 0;
  if (depth > _DELTA_MAX_DEPTH) throw new Error('delta-scan-depth');  // caught by validateDeltaText
  if (Array.isArray(val)) { for (const v of val) _deltaScanDeep(v, onKey, onStr, depth + 1); return; }
  if (val !== null && typeof val === 'object') {
    for (const k of Object.keys(val)) { onKey(k); _deltaScanDeep(val[k], onKey, onStr, depth + 1); }
    return;
  }
  if (typeof val === 'string') onStr(val);
}

// Field display names live in locale.js catalogs ('dval.field.<name>');
// Studio's `|| k` fallback preserved for out-of-dictionary keys.
function _fieldName(k, loc) {
  return LOCALES[resolveLocale(loc)]['dval.field.' + k] || LOCALES.en['dval.field.' + k] || k;
}

// Type validation of delta fields (the schema above only checks presence).
// sid-aware: reference fields accept a positive int or a delta identifier 'd:N'.
function _deltaIsRef(v) { return (Number.isInteger(v) && Math.abs(v) < 2147483648) || (typeof v === 'string' && _DELTA_SID_RE.test(v)); }
function _deltaIsCoord(v) { return Number.isFinite(v) && Math.abs(v) < 2147483648; }
function _deltaValidateOpTypes(op, loc) {
  const bad = [];
  const T = op.target || {}, P = op.payload || {};
  const pl = k => _fieldName(k, loc);
  const refT = k => { if (T[k] !== undefined && !_deltaIsRef(T[k])) bad.push(pl(k)); };
  const refP = k => { if (P[k] !== undefined && !_deltaIsRef(P[k])) bad.push(pl(k)); };
  const coordP = k => { if (P[k] !== undefined && !_deltaIsCoord(P[k])) bad.push(pl(k)); };
  const objP = k => { if (P[k] !== undefined && (typeof P[k] !== 'object' || P[k] === null || Array.isArray(P[k]))) bad.push(pl(k)); };
  const arrP = k => { if (P[k] !== undefined && !Array.isArray(P[k])) bad.push(pl(k)); };
  const strP = k => { if (P[k] !== undefined && typeof P[k] !== 'string') bad.push(pl(k)); };
  switch (op.type) {
    case 'ADD_ROOM': case 'DELETE_ROOM': refT('roomId'); refT('areaId'); objP('room'); break;
    case 'EDIT_ROOM': case 'EDIT_EXIT': refT('roomId'); objP('before'); objP('after'); break;
    case 'MOVE_ROOM': refT('roomId'); coordP('toX'); coordP('toY'); coordP('toZ'); break;
    case 'MOVE_ROOM_TO_AREA': refT('roomId'); refP('toAreaId'); break;
    case 'ADD_EXIT': refT('sourceId'); refP('targetId'); break;
    case 'DELETE_EXIT': refT('roomId'); break;
    case 'DELETE_SPECIAL_EXIT': refT('roomId'); strP('cmd'); break;
    case 'ADD_AREA': refT('areaId'); objP('area'); break;
    case 'DELETE_AREA': refT('areaId'); break;
    case 'EDIT_AREA': refT('areaId'); strP('name'); break;
    case 'ADD_CL': refT('roomId'); objP('cl'); break;
    case 'EDIT_CL': refT('roomId'); objP('before'); objP('after'); break;
    case 'DELETE_CL': case 'DELETE_SUPPRESSOR': case 'ADD_SUPPRESSOR': refT('roomId'); break;
    case 'PAINT_BATCH': arrP('changes');
      // element shape (object; roomId ref: number or sid); roomId REQUIRED —
      // an element without roomId passed validation and was silently skipped
      // at apply time
      if (Array.isArray(P.changes) && P.changes.some(ch => !ch || typeof ch !== 'object' || Array.isArray(ch)
          || ch.roomId === undefined || (typeof ch.roomId !== 'number' && typeof ch.roomId !== 'string'))) bad.push(pl('changes'));
      break;
    case 'AUTO_FIX_SUPPRESSORS': arrP('added'); arrP('removed');
      // roomId REQUIRED in added/removed (as in PAINT_BATCH above)
      if (Array.isArray(P.added) && P.added.some(ch => !ch || typeof ch !== 'object' || Array.isArray(ch)
          || ch.roomId === undefined || (typeof ch.roomId !== 'number' && typeof ch.roomId !== 'string'))) bad.push(pl('added'));
      if (Array.isArray(P.removed) && P.removed.some(ch => !ch || typeof ch !== 'object' || Array.isArray(ch)
          || ch.roomId === undefined || (typeof ch.roomId !== 'number' && typeof ch.roomId !== 'string'))) bad.push(pl('removed'));
      break;
    case 'ADD_LABEL': refT('areaId'); objP('label'); break;
    case 'EDIT_LABEL': refT('areaId'); refT('labelId'); objP('before'); objP('after'); break;
    case 'DELETE_LABEL': refT('areaId'); refT('labelId'); objP('label'); break;
    case 'MOVE_LABEL': refT('areaId'); refT('labelId'); coordP('toX'); coordP('toY'); break;
    case 'RESIZE_LABEL': refT('areaId'); refT('labelId'); coordP('toX'); coordP('toY'); coordP('toW'); coordP('toH'); break;
    case 'EDIT_ENV_COLOR':
      if (T.envId !== undefined && !(Number.isInteger(T.envId) && T.envId >= 0) && !(typeof T.envId === 'string' && T.envId.length)) bad.push(pl('envId'));
      // null = restore default color (the diff generator legally emits null)
      if (P.newColor !== undefined && P.newColor !== null && !(Array.isArray(P.newColor) && P.newColor.length >= 3 && P.newColor.every(c => Number.isInteger(c) && c >= 0 && c <= 255))) bad.push(pl('newColor'));
      break;
  }
  return bad;
}

// validateDeltaText(text, opts?) → { ok, errors: [string], codes: [string], delta? }.
// Never throws. errors follow opts.locale (EN default); codes are the stable
// machine names (catalog keys minus the 'dval.' prefix), parallel to errors.
function validateDeltaText(text, opts) {
  const loc = opts && opts.locale;
  const errors = [], codes = [];
  const fail = (key, params) => { errors.push(translate(key, params, loc)); codes.push(key.slice(5)); };
  const failRet = (key, params) => { fail(key, params); return { ok: false, errors, codes }; };

  if (typeof text !== 'string' || !text.length) return failRet('dval.EMPTY_FILE');
  if (text.length > ARKDELTA_MAX_BYTES) return failRet('dval.FILE_TOO_LARGE', { limitMB: ARKDELTA_MAX_BYTES / 1024 / 1024 });
  let delta = null;
  try { delta = JSON.parse(text); }
  catch (e) { return failRet('dval.PARSE_ERROR'); }
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return failRet('dval.NOT_ARKDELTA');
  const meta = delta.meta || {};
  // Envelope v3 (D1): magic and version top-level; old layouts (meta.format /
  // meta.format_version) are rejected.
  if (delta.format !== ARKDELTA_FORMAT) return failRet('dval.NOT_ARKDELTA');
  if (delta.format_version !== ARKDELTA_FORMAT_VERSION)
    return failRet('dval.UNSUPPORTED_VERSION', { version: delta.format_version ?? translate('dval.VERSION_MISSING', null, loc), supported: ARKDELTA_FORMAT_VERSION });

  // P-LOCK-2: foreign top-level keys = refusal (covered by neither spec nor signature).
  const extraTop = Object.keys(delta).filter(k => !_DELTA_TOP_KEYS.has(k));
  if (extraTop.length)
    return failRet('dval.UNKNOWN_TOP_KEYS', { keys: extraTop.join(', ') });

  // Depth guard BEFORE checksums — stableStringify is recursive; without the
  // guard deep ops would throw RangeError outside the validator. meta enters
  // stableStringify in deltaChecksums too, so it is guarded as well.
  if (Array.isArray(delta.ops)) {
    let tooDeep = false;
    try { _deltaScanDeep(meta, () => {}, () => {}); for (const op of delta.ops) _deltaScanDeep(op, () => {}, () => {}); }
    catch (e) { tooDeep = true; }
    if (tooDeep) return failRet('dval.TOO_DEEP');
  }

  // Checksums: aggregate first; on mismatch, per-op localization.
  const cs = delta.checksums || {};
  const computed = deltaChecksums(meta, Array.isArray(delta.ops) ? delta.ops : []);
  if (cs.file !== computed.file) {
    const bad = [];
    if (Array.isArray(delta.ops) && Array.isArray(cs.ops)) {
      for (let i = 0; i < delta.ops.length; i++) {
        if (cs.ops[i] !== undefined && cs.ops[i] !== computed.ops[i])
          bad.push(delta.ops[i] && delta.ops[i].seq !== undefined ? delta.ops[i].seq : i + 1);
      }
    }
    const detail = bad.length === 1 ? translate('dval.CHECKSUM_DETAIL_ONE', { seq: bad[0] }, loc)
      : bad.length ? translate('dval.CHECKSUM_DETAIL_MANY', { seqs: bad.map(s => '#' + s).join(', ') }, loc) : '';
    return failRet('dval.CHECKSUM_MISMATCH', { detail });
  }

  const ops = delta.ops;
  if (!Array.isArray(ops)) return failRet('dval.OPS_MISSING');
  if (ops.length > ARKDELTA_MAX_OPS) return failRet('dval.TOO_MANY_OPS', { limit: ARKDELTA_MAX_OPS });
  if (meta.ops_count !== ops.length) fail('dval.OPS_COUNT_MISMATCH', { declared: meta.ops_count, actual: ops.length });

  const definedSid = new Set();
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const tag = translate('dval.OP_TAG', { seq: op && op.seq !== undefined ? op.seq : i + 1 }, loc);
    const opErr = (key, params) => { errors.push(tag + ': ' + translate(key, params, loc)); codes.push(key.slice(5)); };
    if (!op || typeof op !== 'object') { opErr('dval.OP_BAD_SHAPE'); continue; }
    if (op.seq !== i + 1) { opErr('dval.OP_SEQ_ORDER'); continue; }
    const schema = _DELTA_SCHEMA[op.type];
    if (!schema) { opErr('dval.OP_UNKNOWN_TYPE', { type: op.type }); continue; }
    if (!op.target || typeof op.target !== 'object') { opErr('dval.OP_NO_TARGET'); continue; }
    if (!op.payload || typeof op.payload !== 'object') { opErr('dval.OP_NO_PAYLOAD'); continue; }
    for (const k of schema.target)  if (op.target[k] === undefined)  opErr('dval.OP_MISSING_FIELD', { field: _fieldName(k, loc) });
    for (const k of schema.payload) if (op.payload[k] === undefined) opErr('dval.OP_MISSING_FIELD', { field: _fieldName(k, loc) });
    for (const f of _deltaValidateOpTypes(op, loc)) opErr('dval.OP_INVALID_FIELD', { field: f });
    if (op.target.dir !== undefined && !VALID_DIRS.has(op.target.dir)) opErr('dval.OP_BAD_DIR', { dir: op.target.dir });
    // sid integrity: definition before use, no duplicates, key sanitation.
    let badKey = null;
    try { _deltaScanDeep(op, k => { if (k === '__proto__' || k === 'constructor' || k === 'prototype') badKey = k; }, () => {}); }
    catch (e) { opErr('dval.OP_TOO_DEEP'); continue; }
    if (badKey) { opErr('dval.OP_FORBIDDEN_KEY', { key: badKey }); continue; }
    // D1 ops-strict: closed field set (refuse on unknown key) — AFTER the key
    // guard, so __proto__ gets its own security message.
    let unknownKey = null;
    for (const k of Object.keys(op)) if (!_DELTA_OP_KEYS.has(k)) { unknownKey = k; break; }
    if (!unknownKey) {
      const allowT = new Set([...schema.target, ...(_DELTA_OPT_TARGET[op.type] || [])]);
      for (const k of Object.keys(op.target)) if (!allowT.has(k)) { unknownKey = k; break; }
      if (!unknownKey) {
        const allowP = new Set([...schema.payload, ...(_DELTA_OPT_PAYLOAD[op.type] || [])]);
        for (const k of Object.keys(op.payload)) if (!allowP.has(k)) { unknownKey = k; break; }
      }
    }
    if (unknownKey) { opErr('dval.OP_UNKNOWN_KEY', { key: unknownKey }); continue; }
    // Own op definition first (ADD_*) — otherwise the own sid looks like a use
    // without a definition.
    const ownSid = (op.type === 'ADD_ROOM' && _DELTA_SID_RE.test(String(op.target.roomId))) ? String(op.target.roomId)
                 : (op.type === 'ADD_AREA' && _DELTA_SID_RE.test(String(op.target.areaId))) ? String(op.target.areaId)
                 : (op.type === 'ADD_LABEL' && _DELTA_SID_RE.test(String(op.payload.label && op.payload.label.id))) ? String(op.payload.label.id)
                 : null;
    if (ownSid) {
      if (definedSid.has(ownSid)) { opErr('dval.OP_DUP_SID', { sid: ownSid }); continue; }
      definedSid.add(ownSid);
    }
    else if (op.type === 'ADD_ROOM' || op.type === 'ADD_AREA' || op.type === 'ADD_LABEL')
      opErr('dval.OP_ADD_NEEDS_SID');
    // sid uses collected ONLY from reference positions (map above); op depth
    // guarded by the key scan above + the global depth guard.
    const used = [];
    for (const [o, k] of _deltaSidRefSlots(op)) {
      const v = o[k];
      if (typeof v === 'string' && _DELTA_SID_RE.test(v)) used.push(v);
    }
    for (const sid of used) if (!definedSid.has(sid)) opErr('dval.OP_UNKNOWN_SID', { sid });
  }
  if (errors.length) return { ok: false, errors, codes };
  return { ok: true, delta, errors: [], codes: [] };
}

// ── Base identity (crc computed once, at map load) ──────────────────────────
// computeBaseInfo(map, precomputed?) — identity of the base map a delta was
// cut against: file crc + optional version/revision from meta.user_data +
// per-area sums (risk classification green/yellow/red when a delta is reviewed
// on a different base, spec .arkdelta §4). precomputed: optional result of
// _computeV4Checksums (e.g. from verifyChecksums at load) — single pass.
function computeBaseInfo(map, precomputed) {
  if (!map) return null;
  const cs = precomputed || _computeV4Checksums(map);
  const ud = (map.meta && map.meta.user_data) || {};
  const info = { crc: cs.file };
  if (ud.version)  info.version  = ud.version;
  if (ud.revision) info.revision = ud.revision;
  info.areas = Object.assign({}, cs.areas);
  return info;
}

// ── Ed25519 signature verification (spec .arkdelta §9) — async, NEVER refuses
// the load. States: unsigned (no sig and no author fields), claimed (author
// fields without sig — declaration without proof), ok (signature valid),
// bad (sig corrupted/mismatched, or declared id does not match the key).
// sig = Ed25519 over ASCII "arkdelta-v3:" + checksums.file; key from
// meta.author_pubkey (covers checksums.file).
//
// WebCrypto first; when Ed25519 is unavailable — vendored BigInt fallback.
// The fallback is NOT constant-time; the threat model (local continuity-of-
// authorship identity, not real-world identity) accepts that. RFC 8032
// vectors are pinned in tests.

const _ED_Q = (1n << 255n) - 19n;
const _ED_L = (1n << 252n) + 27742317777372353535851937790883648493n;
function _edPow(b, e) { let r = 1n; b = ((b % _ED_Q) + _ED_Q) % _ED_Q;
  while (e > 0n) { if (e & 1n) r = (r * b) % _ED_Q; b = (b * b) % _ED_Q; e >>= 1n; } return r; }
function _edInv(x) { return _edPow(x, _ED_Q - 2n); }
const _ED_D = ((-121665n * _edInv(121666n)) % _ED_Q + _ED_Q) % _ED_Q;
const _ED_I = _edPow(2n, (_ED_Q - 1n) / 4n);
function _edXRecover(y) {
  const xx = ((y * y - 1n) * _edInv((_ED_D * y * y + 1n) % _ED_Q)) % _ED_Q;
  let x = _edPow(xx, (_ED_Q + 3n) / 8n);
  if (((x * x - xx) % _ED_Q + _ED_Q) % _ED_Q !== 0n) x = (x * _ED_I) % _ED_Q;
  if (x & 1n) x = _ED_Q - x;
  return x;
}
const _ED_BY = (4n * _edInv(5n)) % _ED_Q;
const _ED_B = [_edXRecover(_ED_BY), _ED_BY];
function _edAdd(P, Q) {
  const [x1, y1] = P, [x2, y2] = Q;
  const x1x2 = (x1 * x2) % _ED_Q, y1y2 = (y1 * y2) % _ED_Q;
  const dxxyy = (_ED_D * x1x2 % _ED_Q) * y1y2 % _ED_Q;
  const x3 = (((x1 * y2 + x2 * y1) % _ED_Q) * _edInv((1n + dxxyy) % _ED_Q)) % _ED_Q;
  const y3 = (((y1y2 + x1x2) % _ED_Q) * _edInv((1n - dxxyy) % _ED_Q)) % _ED_Q;
  return [((x3 % _ED_Q) + _ED_Q) % _ED_Q, ((y3 % _ED_Q) + _ED_Q) % _ED_Q];
}
function _edMul(P, e) {
  let R = [0n, 1n];
  while (e > 0n) { if (e & 1n) R = _edAdd(R, P); P = _edAdd(P, P); e >>= 1n; }
  return R;
}
function _edDecode(bytes) {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(bytes[i]);
  const sign = (y >> 255n) & 1n;
  y &= (1n << 255n) - 1n;
  if (y >= _ED_Q) throw new Error('ed25519: point out of range');
  const x = _edXRecover(y);
  if ((x & 1n) !== sign) return [_ED_Q - x, y];
  return [x, y];
}
async function _edSha512(bytes) { return new Uint8Array(await (await _subtle()).digest('SHA-512', bytes)); }
function _edHashInt(bytes) {
  let r = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) r = (r << 8n) | BigInt(bytes[i]);
  return r;
}
async function _edVerify(pub, msg, sig) {
  try {
    if (sig.length !== 64 || pub.length !== 32) return false;
    const A = _edDecode(pub), R = _edDecode(sig.slice(0, 32));
    let S = 0n;
    for (let i = 63; i >= 32; i--) S = (S << 8n) | BigInt(sig[i]);
    if (S >= _ED_L) return false;
    const k = _edHashInt(await _edSha512(new Uint8Array([...sig.slice(0, 32), ...pub, ...msg]))) % _ED_L;
    const left = _edMul(_ED_B, S);
    const right = _edAdd(R, _edMul(A, k));
    return left[0] === right[0] && left[1] === right[1];
  } catch (e) { return false; }
}

// crypto resolved at call time: browser/Node ≥19 global, else node:crypto.
async function _subtle() {
  if (globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto.subtle;
  const { webcrypto } = await import('node:crypto');
  return webcrypto.subtle;
}

function _identityHex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); }
function _identityFromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}
async function _identityVerifySig(pubHex, sigHex, payloadStr) {
  if (typeof pubHex !== 'string' || !/^[0-9a-f]{64}$/.test(pubHex)) return false;
  if (typeof sigHex !== 'string' || !/^[0-9a-f]{128}$/.test(sigHex)) return false;
  const pub = _identityFromHex(pubHex), sig = _identityFromHex(sigHex);
  const msg = new TextEncoder().encode(payloadStr);
  const subtle = await _subtle();
  let good = false;
  try {
    const key = await subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    good = await subtle.verify('Ed25519', key, sig, msg);
  } catch (e) { good = false; }
  if (!good) { try { good = await _edVerify(pub, msg, sig); } catch (e) { good = false; } }
  return good;
}
async function _identityAuthorId(pubBytes) {
  const h = new Uint8Array(await (await _subtle()).digest('SHA-256', pubBytes));
  return _identityHex(h.slice(0, 8));
}
// P-LOCK-1: payload = the whole canonical object minus checksums.sig.
function _sigPayload(domain, obj) {
  const chk = obj.checksums || {};
  const rest = {};
  for (const k of Object.keys(chk)) if (k !== 'sig') rest[k] = chk[k];
  return domain + stableStringify(Object.assign({}, obj, { checksums: rest }));
}

// verifyDeltaSignature(delta) → { state: 'unsigned' }
//   | { state: 'claimed', author, authorId, pubkeyHex }
//   | { state: 'bad', author, authorId, pubkeyHex }
//   | { state: 'ok', author, authorId, idOk, pubkeyHex }
async function verifyDeltaSignature(delta) {
  const cs = delta.checksums || {}, meta = delta.meta || {};
  const author = typeof meta.author === 'string' ? meta.author : null;
  const authorId = typeof meta.author_id === 'string' ? meta.author_id : null;
  const pubHex = typeof meta.author_pubkey === 'string' ? meta.author_pubkey : null;
  if (cs.sig === undefined || cs.sig === null)
    return (author || authorId || pubHex) ? { state: 'claimed', author, authorId, pubkeyHex: pubHex } : { state: 'unsigned' };
  if (typeof cs.sig !== 'string' || !/^[0-9a-f]{128}$/.test(cs.sig)) return { state: 'bad', author, authorId, pubkeyHex: pubHex };
  if (!pubHex || !/^[0-9a-f]{64}$/.test(pubHex)) return { state: 'bad', author, authorId, pubkeyHex: pubHex };
  const good = await _identityVerifySig(pubHex, cs.sig, _sigPayload('arkdelta-v3:', delta));
  if (!good) return { state: 'bad', author, authorId, pubkeyHex: pubHex };
  const realId = await _identityAuthorId(_identityFromHex(pubHex));
  const idOk = authorId === null || authorId === realId;
  return { state: 'ok', author, authorId: realId, idOk, pubkeyHex: pubHex };
}

export {
  ARKDELTA_FORMAT, ARKDELTA_FORMAT_VERSION, ARKDELTA_MAX_OPS, ARKDELTA_MAX_BYTES,
  validateDeltaText, verifyDeltaSignature, computeBaseInfo, deltaChecksums,
  _deltaSidRefSlots,
};

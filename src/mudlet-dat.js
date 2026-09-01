// MAINTAINED module — forked from the generated extraction; logic has deliberately
// diverged from the source app, so scripts/extract.mjs no longer rewrites this file.
// Origin: Isithunzi000/arkadia-web_standalone-arkmap_studio/arkmap_studio.html @ 24bd9022895753779758e5c58286565c76d85d19 (lines 5553-6540)
// Divergence: EN error strings + machine codes on all throw paths (H0.3).

// ── mudlet_dat.js ──
/**
 * mudlet_dat.js — full port of the Mudlet map.dat binary format for the browser.
 *
 * Format based on Qt QDataStream (big-endian).
 * No external dependencies — runs in the browser and Node.js.
 *
 * Exports:
 *   readMudletDat(arrayBuffer)  → raw map object (identical to mudlet_reader.read)
 *   writeMudletDat(mapObj)      → Uint8Array
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// ReadBuffer
// ═══════════════════════════════════════════════════════════════════════════════

class ReadBuffer {
  constructor(arrayBuffer) {
    this.buf = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : arrayBuffer.buffer ?? arrayBuffer;
    this.view = new DataView(this.buf);
    this.pos  = 0;
  }
  // audit A7: bounds-check before every read — a controlled format error instead of a raw
  // RangeError (reaches the toast via catch in loadDat); pos stays untouched when throwing
  _need(n) {
    if (n < 0 || n > this.remaining()) {
      const err = new Error(`arkmap: corrupt or truncated .dat: read of ${n} B at offset ${this.pos}, file is ${this.buf.byteLength} B`);
      err.code = 'DAT_TRUNCATED';
      throw err;
    }
  }
  readInt8()   { this._need(1); const v = this.view.getInt8(this.pos);           this.pos += 1; return v; }
  readUInt8()  { this._need(1); const v = this.view.getUint8(this.pos);          this.pos += 1; return v; }
  readUInt16() { this._need(2); const v = this.view.getUint16(this.pos, false);  this.pos += 2; return v; }
  readInt32()  { this._need(4); const v = this.view.getInt32(this.pos, false);   this.pos += 4; return v; }
  readUInt32() { this._need(4); const v = this.view.getUint32(this.pos, false);  this.pos += 4; return v; }
  readDouble() { this._need(8); const v = this.view.getFloat64(this.pos, false); this.pos += 8; return v; }
  readBytes(n) { this._need(n); const b = new Uint8Array(this.buf, this.pos, n); this.pos += n; return b; }
  remaining()  { return this.buf.byteLength - this.pos; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WriteBuffer
// ═══════════════════════════════════════════════════════════════════════════════

class WriteBuffer {
  constructor() { this.chunks = []; }
  _push(n, fn) { const b = new Uint8Array(n); fn(new DataView(b.buffer)); this.chunks.push(b); }
  writeInt8(v)   { this._push(1, d => d.setInt8(0, v)); }
  writeUInt8(v)  { this._push(1, d => d.setUint8(0, v)); }
  writeUInt16(v) { this._push(2, d => d.setUint16(0, v, false)); }
  writeInt32(v)  { this._push(4, d => d.setInt32(0, v, false)); }
  writeUInt32(v) { this._push(4, d => d.setUint32(0, v, false)); }
  writeDouble(v) { this._push(8, d => d.setFloat64(0, v, false)); }
  writeBytes(u8) { this.chunks.push(u8 instanceof Uint8Array ? u8 : new Uint8Array(u8)); }
  writeZero(n)   { this.chunks.push(new Uint8Array(n)); }
  toUint8Array() {
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) { out.set(c, off); off += c.length; }
    return out;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QString — Qt UTF-16 Big-Endian strings
// ═══════════════════════════════════════════════════════════════════════════════

const _utf16be = new TextDecoder('utf-16be');

function readQString(r) {
  const byteLen = r.readUInt32();
  if (byteLen === 0 || byteLen === 0xFFFFFFFF) return '';
  return _utf16be.decode(r.readBytes(byteLen));
}

function writeQString(w, str) {
  if (str === null || str === undefined) { w.writeUInt32(0xFFFFFFFF); return; }
  if (str === '') { w.writeUInt32(0x00000000); return; }
  // Encode as UTF-16 Big-Endian (JavaScript string is UTF-16 internally)
  const bytes = new Uint8Array(str.length * 2);
  const view  = new DataView(bytes.buffer);
  for (let i = 0; i < str.length; i++) view.setUint16(i * 2, str.charCodeAt(i), false);
  w.writeUInt32(bytes.length);
  w.writeBytes(bytes);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QColor — Qt QColor (RGB with 257-multiplied components)
//   Binary layout: int8 spec | uint16 alpha*257 | uint16 r*257 | uint16 g*257 | uint16 b*257 | uint16 pad*257
// ═══════════════════════════════════════════════════════════════════════════════

function readQColor(r) {
  const spec  = r.readInt8();
  const alpha = r.readUInt16() >> 8;
  const red   = r.readUInt16() >> 8;
  const green = r.readUInt16() >> 8;
  const blue  = r.readUInt16() >> 8;
  const pad   = r.readUInt16() >> 8;
  return { spec, alpha, r: red, g: green, b: blue, pad };
}

function writeQColor(w, c) {
  const o = c || { spec: 1, alpha: 255, r: 0, g: 0, b: 0, pad: 0 };
  w.writeInt8(o.spec);
  w.writeUInt16(o.alpha * 257);
  w.writeUInt16(o.r    * 257);
  w.writeUInt16(o.g    * 257);
  w.writeUInt16(o.b    * 257);
  w.writeUInt16(o.pad  * 257);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QFont — Qt font descriptor
//   NOTE: stretch is written shifted by 8 bits (<< 8) — we preserve this
//         behavior (a bug in the original mudlet_reader.js, but compatible).
// ═══════════════════════════════════════════════════════════════════════════════

function readQFont(r) {
  const family        = readQString(r);
  const style         = readQString(r);
  const pointSize     = r.readDouble();
  const pixelSize     = r.readInt32();
  const styleHint     = r.readInt8();
  const styleStrategy = r.readUInt16();
  r.readInt8();                          // padding byte
  const weight        = r.readUInt8();
  const fontBits      = r.readUInt8();
  const stretch       = r.readUInt16(); // raw — in a Mudlet file: plain value; after we write it: stretch<<8
  const extFontBits   = r.readUInt8();
  const letterSpacing = r.readInt32();
  const wordSpacing   = r.readInt32();
  const hintingPref   = r.readUInt8();
  const capital       = r.readUInt8();

  return {
    family, style, pointSize, pixelSize, styleHint, styleStrategy, weight,
    fontBits, stretch, extendedFontBits: extFontBits,
    letterSpacing, wordSpacing, hintingPreference: hintingPref, capital,
    // Derived booleans from fontBits
    styleSetting:   !!(fontBits & 0x01),
    underline:      !!(fontBits & 0x02),
    strikeOut:      !!(fontBits & 0x04),
    fixedPitch:     !!(fontBits & 0x08),
    kerning:        !!(fontBits & 0x10),
    overline:       !!(fontBits & 0x40),
    styleOblique:   !!(fontBits & 0x80),
    ignorePitch:             !!(extFontBits & 0x01),
    letterSpacingIsAbsolute: !!(extFontBits & 0x02),
  };
}

function writeQFont(w, f) {
  const o = f || {};
  writeQString(w, o.family        ?? '');
  writeQString(w, o.style         ?? '');
  w.writeDouble(o.pointSize       ?? 0.0);
  w.writeInt32( o.pixelSize       ?? -1);
  w.writeInt8(  o.styleHint       ?? 0);
  w.writeUInt16(o.styleStrategy   ?? 0);
  w.writeZero(1);                                      // padding
  w.writeUInt8( o.weight          ?? 0);
  w.writeUInt8( o.fontBits        ?? 0);
  w.writeUInt16((o.stretch        ?? 100) << 8);       // original bug — preserved
  w.writeUInt8( o.extendedFontBits ?? 0);
  w.writeInt32( o.letterSpacing   ?? 0);
  w.writeInt32( o.wordSpacing     ?? 0);
  w.writeUInt8( o.hintingPreference ?? 0);
  w.writeUInt8( o.capital         ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QPoint (pair of doubles) and QVector (triple of doubles)
// ═══════════════════════════════════════════════════════════════════════════════

function readQPoint(r)  { return [r.readDouble(), r.readDouble()]; }
function writeQPoint(w, p) { w.writeDouble(p[0]); w.writeDouble(p[1]); }

function readQVector(r) { return [r.readDouble(), r.readDouble(), r.readDouble()]; }
function writeQVector(w, v) {
  const o = v || [0, 0, 0];
  w.writeDouble(o[0]); w.writeDouble(o[1]); w.writeDouble(o[2]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QPixMap — holds PNG data or is empty
// ═══════════════════════════════════════════════════════════════════════════════

function readQPixMap(r) {
  r.readUInt32();                         // header uint32 (always 1 or ignored)
  const startPos = r.pos;
  if (r.remaining() < 8) return new Uint8Array(0);

  // audit A9: full 8-byte PNG signature + chunk parsing instead of scanning bytes past IEND
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (const s of sig) {
    if (r.readUInt8() !== s) { r.pos = startPos; return new Uint8Array(0); }  // not a PNG — rewind
  }

  // Chunks: uint32 length BE | type 4 B | data(length) | CRC 4 B; ends at IEND.
  // "IEND" bytes inside IDAT data do not confuse the parser (they used to truncate the pixmap).
  // A corrupt/truncated chunk -> controlled error via _need (audit A7) — the stream position
  // would be unrecoverable, so silently swallowing the rest of the file (old behavior) was worse.
  for (;;) {
    const len = r.readUInt32();
    const t0 = r.readUInt8(), t1 = r.readUInt8(), t2 = r.readUInt8(), t3 = r.readUInt8();
    r._need(len + 4);                     // data + CRC
    r.pos += len + 4;
    if (t0 === 0x49 && t1 === 0x45 && t2 === 0x4E && t3 === 0x44) break;  // IEND
  }

  const endPos = r.pos;
  r.pos = startPos;
  return r.readBytes(endPos - startPos).slice();  // PNG copy
}

function writeQPixMap(w, bytes) {
  w.writeUInt32(1);                       // header uint32
  if (bytes && bytes.length > 0) w.writeBytes(bytes);
  // empty: only uint32(1); on read, no PNG -> empty
}

// ═══════════════════════════════════════════════════════════════════════════════
// Integer-key sorting helper
// ═══════════════════════════════════════════════════════════════════════════════

function cmpInt(a, b) { return parseInt(a[0]) - parseInt(b[0]); }
function cmpIntMinusFirst(a, b) {
  const ai = parseInt(a[0]), bi = parseInt(b[0]);
  if (ai === -1) return -1;
  if (bi === -1) return  1;
  return ai - bi;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QMap / QMultiMap — various key/value type combinations
// ═══════════════════════════════════════════════════════════════════════════════

// audit ext F2.8: section counters are read as int32 (signed) — negative = corrupt
// file, NOT an "empty section". uint32 counters (QMap/QList) cannot be negative; corrupted
// huge values end in a controlled ReadBuffer bounds-check error anyway (audit A7).
function _datCounter(n) {
  if (n < 0) { const err = new Error('arkmap: corrupt .dat (negative section count)'); err.code = 'DAT_NEGATIVE_COUNT'; throw err; }
  return n;
}

// QMap<QInt, QInt> — e.g. envColors, xmaxForZ etc.
function readQMapII(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) { const k = r.readInt32(), v = r.readInt32(); o[k] = v; }
  return o;
}
function writeQMapII(w, o) {
  const e = Object.entries(o || {}).sort(cmpInt);
  w.writeUInt32(e.length);
  for (const [k, v] of e) { w.writeInt32(parseInt(k)); w.writeInt32(v); }
}

// QMap<QInt, QString> — e.g. areaNames (with key -1 first)
function readQMapIS(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) { const k = r.readInt32(), v = readQString(r); o[k] = v; }
  return o;
}
function writeQMapIS(w, o) {
  const e = Object.entries(o || {}).sort(cmpIntMinusFirst);
  w.writeUInt32(e.length);
  for (const [k, v] of e) { w.writeInt32(parseInt(k)); writeQString(w, v); }
}

// QMap<QInt, QColor> — e.g. mCustomEnvColors
function readQMapIC(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) { const k = r.readInt32(), v = readQColor(r); o[k] = v; }
  return o;
}
function writeQMapIC(w, o) {
  const e = Object.entries(o || {}).sort(cmpInt);
  w.writeUInt32(e.length);
  for (const [k, v] of e) { w.writeInt32(parseInt(k)); writeQColor(w, v); }
}

// audit T5/F1: safe key insertion into a plain-object map — "__proto__" via
// defineProperty (a plain assignment is silently ignored in JS; the key vanished without a trace).
// enumerable:true is REQUIRED: JSON.stringify, Object.entries and .arkmap/.dat writes must
// see the key; writable/configurable:true so the editor can overwrite it later.
function _setMapKey(o, k, v) {
  if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  else o[k] = v;
}

// QMap<QString, QUInt> — e.g. mpRoomDbHashToRoomId
function readQMapSU(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) { const k = readQString(r), v = r.readUInt32(); _setMapKey(o, k, v); }
  return o;
}
function writeQMapSU(w, o) {
  const e = Object.entries(o || {}).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  w.writeUInt32(e.length);
  for (const [k, v] of e) { writeQString(w, k); w.writeUInt32(v); }
}

// QMap<QString, QString> — e.g. userData, mUserData
function readQMapSS(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) { const k = readQString(r), v = readQString(r); _setMapKey(o, k, v); }
  return o;
}
function writeQMapSS(w, o) {
  const e = Object.entries(o || {}).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  w.writeUInt32(e.length);
  for (const [k, v] of e) { writeQString(w, k); writeQString(w, v); }
}

// QMap<QString, QInt> — e.g. exitWeights, doors, mRoomIdHash
function readQMapSI(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) { const k = readQString(r), v = r.readInt32(); _setMapKey(o, k, v); }
  return o;
}
function writeQMapSI(w, o) {
  const e = Object.entries(o || {}).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  w.writeUInt32(e.length);
  for (const [k, v] of e) { writeQString(w, k); w.writeInt32(v); }
}

// QMap<QString, QUInt> — customLinesStyle
function readQMapSU2(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) { const k = readQString(r), v = r.readUInt32(); _setMapKey(o, k, v); }  // Arc 41 (v1.50.3): __proto__-safe (readQMapSU2)
  return o;
}
function writeQMapSU2(w, o) {
  const e = Object.entries(o || {}).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  w.writeUInt32(e.length);
  for (const [k, v] of e) { writeQString(w, k); w.writeUInt32(v); }
}

// QMap<QString, QBool> — customLinesArrow
function readQMapSB(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) { const k = readQString(r), v = !!r.readInt8(); _setMapKey(o, k, v); }  // Arc 41 (v1.50.3): __proto__-safe
  return o;
}
function writeQMapSB(w, o) {
  const e = Object.entries(o || {}).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  w.writeUInt32(e.length);
  for (const [k, v] of e) { writeQString(w, k); w.writeInt8(v ? 1 : 0); }
}

// QMap<QString, QColor> — customLinesColor
function readQMapSC(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) { const k = readQString(r), v = readQColor(r); _setMapKey(o, k, v); }  // Arc 41 (v1.50.3): __proto__-safe (readQMapSC)
  return o;
}
function writeQMapSC(w, o) {
  const e = Object.entries(o || {}).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  w.writeUInt32(e.length);
  for (const [k, v] of e) { writeQString(w, k); writeQColor(w, v); }
}

// QMap<QString, QList<QPoint>> — customLines
function readQMapSLP(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) {
    const k = readQString(r);
    const cnt = r.readUInt32();
    const pts = [];
    for (let j = 0; j < cnt; j++) pts.push(readQPoint(r));
    o[k] = pts;
  }
  return o;
}
function writeQMapSLP(w, o) {
  const e = Object.entries(o || {}).sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  w.writeUInt32(e.length);
  for (const [k, pts] of e) {
    writeQString(w, k);
    const p = pts || [];
    w.writeUInt32(p.length);
    for (const pt of p) writeQPoint(w, pt);
  }
}

// QMultiMap<QUInt, QString> — rawSpecialExits
function readQMMUS(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) {
    const k = r.readInt32(), v = readQString(r);  // audit T4/W2: key = room id (int32, signed)
    if (!o[k]) o[k] = [];
    o[k].push(v);
  }
  return o;
}
function writeQMMUS(w, o) {
  // reversed object entries — identical to the original
  const entries = Object.entries(o || {}).reverse();
  let total = 0;
  const pairs = [];
  for (const [k, arr] of entries) {
    for (const v of arr) { pairs.push([parseInt(k), v]); total++; }
  }
  w.writeUInt32(total);
  for (const [k, v] of pairs) { w.writeInt32(k); writeQString(w, v); }  // audyt T4/W2
}

// QMultiMap<QInt, QPair<QInt,QInt>> — mAreaExits
function readQMMIPP(r) {
  const n = r.readUInt32(), o = {};
  for (let i = 0; i < n; i++) {
    const k = r.readInt32(), v1 = r.readInt32(), v2 = r.readInt32();
    if (!o[k]) o[k] = [];
    o[k].push([v1, v2]);
  }
  return o;
}
function writeQMMIPP(w, o) {
  const entries = Object.entries(o || {}).reverse();
  let total = 0;
  const triples = [];
  for (const [k, arr] of entries) {
    for (const [v1, v2] of arr) { triples.push([parseInt(k), v1, v2]); total++; }
  }
  w.writeUInt32(total);
  for (const [k, v1, v2] of triples) { w.writeInt32(k); w.writeInt32(v1); w.writeInt32(v2); }
}

// QList<QInt>
function readQListI(r) {
  const n = r.readUInt32(), a = [];
  for (let i = 0; i < n; i++) a.push(r.readInt32());
  return a;
}
function writeQListI(w, a) {
  const arr = a || [];
  w.writeUInt32(arr.length);
  for (const v of arr) w.writeInt32(v);
}

// QList<QUInt>
function readQListU(r) {
  const n = r.readUInt32(), a = [];
  for (let i = 0; i < n; i++) a.push(r.readUInt32());
  return a;
}
function writeQListU(w, a) {
  const arr = a || [];
  w.writeUInt32(arr.length);
  for (const v of arr) w.writeUInt32(v);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mudlet compound types
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Mudlet DAT format versions — checked on read
//
//  v17 — xminForZ/ymaxForZ/etc., map mUserData
//  v18 — rooms as QSet, mRoomIdHash per profile
//  v19 — mSymbol as QString, mapSymbolFont inline
//  v20 — customLines lowercase keys, QColor instead of QList<int>  ← current production
//  v21 — specialExits new format (QMap<cmd,id>), mSpecialExitLocks separate,
//         mSymbolColor inline, labels in TArea, mLast2DMapZoom
//  v22 — room hidden field
//  v23+ — unknown: safe fallback, keep data without interpretation
//
// On write we always emit v20 (Mudlet's current production version).
// On read we support v17–v22 with all version gates.
// Files newer than MUDLET_DAT_MAX_SUPPORTED_VERSION are rejected with an error.
// ─────────────────────────────────────────────────────────────────────────────
const MUDLET_DAT_MIN_VERSION     = 17;   // minimum we support
const MUDLET_DAT_WRITE_VERSION   = 20;   // version we always write
const MUDLET_DAT_MAX_SUPPORTED_VERSION = 22;  // maximum we can read

// ─────────────────────────────────────────────────────────────────────────────
// readMudletArea(r, version)
// ─────────────────────────────────────────────────────────────────────────────
function readMudletArea(r, version) {
  const rooms     = readQListI(r);  // audit T4/W1: room id list = int32 (signed)
  const zLevels   = readQListI(r);
  const mAreaExits = readQMMIPP(r);
  const gridMode  = !!r.readInt8();
  const max_x = r.readInt32(), max_y = r.readInt32(), max_z = r.readInt32();
  const min_x = r.readInt32(), min_y = r.readInt32(), min_z = r.readInt32();
  const span      = readQVector(r);
  const xmaxForZ  = readQMapII(r);
  const ymaxForZ  = readQMapII(r);
  const xminForZ  = readQMapII(r);
  const yminForZ  = readQMapII(r);
  const pos       = readQVector(r);
  const isZone    = !!r.readInt8();
  const zoneAreaRef = r.readInt32();

  // v21+: mLast2DMapZoom stored inline before userData
  let mLast2DMapZoom = null;
  if (version >= 21) {
    mLast2DMapZoom = r.readDouble();
  }

  const userData  = readQMapSS(r);

  // v21+: labels embedded in the area (previously global after areaCount)
  let areaLabels = null;
  if (version >= 21) {
    const labelCount = _datCounter(r.readInt32());  // audyt ext F2.8
    areaLabels = [];
    for (let i = 0; i < labelCount; i++) {
      areaLabels.push(readMudletLabel(r, version));
    }
  }

  return {
    rooms, zLevels, mAreaExits, gridMode,
    max_x, max_y, max_z, min_x, min_y, min_z,
    span, xmaxForZ, ymaxForZ, xminForZ, yminForZ,
    pos, isZone, zoneAreaRef,
    mLast2DMapZoom, // null for v17-v20 (read from userData fallback by Mudlet)
    userData,
    areaLabels,    // null for v17-v20 (labels are global)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// writeMudletArea — always writes in v20 format
// ─────────────────────────────────────────────────────────────────────────────
function writeMudletArea(w, a) {
  writeQListI(w,  a.rooms      ?? []);  // audit T4/W1: room id list = int32 (signed)
  writeQListI(w,  a.zLevels    ?? []);
  writeQMMIPP(w,  a.mAreaExits ?? {});
  w.writeInt8(a.gridMode ? 1 : 0);
  w.writeInt32(a.max_x ?? 0);  w.writeInt32(a.max_y ?? 0);  w.writeInt32(a.max_z ?? 0);
  w.writeInt32(a.min_x ?? 0);  w.writeInt32(a.min_y ?? 0);  w.writeInt32(a.min_z ?? 0);
  writeQVector(w, a.span       ?? [0, 0, 0]);
  writeQMapII(w,  a.xmaxForZ   ?? {});
  writeQMapII(w,  a.ymaxForZ   ?? {});
  writeQMapII(w,  a.xminForZ   ?? {});
  writeQMapII(w,  a.yminForZ   ?? {});
  writeQVector(w, a.pos        ?? [0, 0, 0]);
  w.writeInt8(a.isZone ? 1 : 0);
  w.writeInt32(a.zoneAreaRef   ?? 0);
  // v20: userData (mLast2DMapZoom goes to userData["system.fallback_map2DZoom"] if needed)
  const ud = { ...(a.userData ?? {}) };
  if (a.mLast2DMapZoom != null && !ud['system.fallback_map2DZoom']) {
    // If data came from v21+ we have the zoom inline — write it as a fallback for v20
    ud['system.fallback_map2DZoom'] = String(a.mLast2DMapZoom);
  }
  writeQMapSS(w, ud);
  // v20: labels are NOT here — they are written globally after mRoomIdHash
}

// ─────────────────────────────────────────────────────────────────────────────
// readMudletRoom(r, version)
// ─────────────────────────────────────────────────────────────────────────────
function readMudletRoom(r, version) {
  const area        = r.readInt32();
  const x           = r.readInt32(), y = r.readInt32(), z = r.readInt32();
  const north       = r.readInt32(), northeast = r.readInt32();
  const east        = r.readInt32(), southeast = r.readInt32();
  const south       = r.readInt32(), southwest = r.readInt32();
  const west        = r.readInt32(), northwest = r.readInt32();
  const up          = r.readInt32(), down      = r.readInt32();
  const inn         = r.readInt32(), out       = r.readInt32();
  const environment = r.readInt32();
  const weight      = Math.max(1, r.readInt32());  // Mudlet enforces min=1
  const name        = readQString(r);
  const isLocked    = !!r.readInt8();

  // v22+: hidden (room invisible on the map)
  let hidden = false;
  if (version >= 22) {
    hidden = !!r.readInt8();
  }

  // specialExits: format changed in v21
  let rawSpecialExits = {};   // old format (v6-v20): QMultiMap<int, "0cmd"/"1cmd">
  let mSpecialExits   = {};   // cmd → roomId
  let mSpecialExitLocks = []; // locked (old: roomId list, v21+: cmd list)

  if (version >= 21) {
    // v21+: QMap<QString, int>  cmd → roomId  (locks separate as QSet<QString> at the end)
    const newSpecialExits = readQMapSI(r);
    mSpecialExits = newSpecialExits;
    // Reconstruct rawSpecialExits so v20 writes keep the old layout
    for (const [cmd, tid] of Object.entries(newSpecialExits)) {
      rawSpecialExits[tid] = rawSpecialExits[tid] ?? [];
      rawSpecialExits[tid].push('0' + cmd); // locks are added after mSpecialExitLocks is read
    }
  } else {
    // v6-v20: QMultiMap<int, QString>  roomId → "0cmd"/"1cmd"
    rawSpecialExits = readQMMUS(r);
    for (const [tidStr, cmds] of Object.entries(rawSpecialExits)) {
      const tid = parseInt(tidStr);
      for (const cmd of cmds) {
        const locked = cmd.startsWith('1');
        mSpecialExits[cmd.slice(1)] = tid;
        if (locked) mSpecialExitLocks.push(tid);
      }
    }
  }

  // symbol: format changed in v19
  let symbol = '';
  if (version >= 19) {
    symbol = readQString(r);
  } else {
    // v9-v18: old qint8 (ASCII)
    const oldChar = r.readInt8();
    if (oldChar > 32) symbol = String.fromCharCode(oldChar);
  }

  // v21+: mSymbolColor inline as QColor
  let symbolColor = null;
  if (version >= 21) {
    symbolColor = readQColor(r);
  }

  const userData = readQMapSS(r);

  // If v19-v20: symbolColor may be in userData as a fallback
  if (version < 21 && userData['system.fallback_symbol_color']) {
    // Left in userData — Mudlet handles it itself on load
  }

  // customLines: format changed in v20 (lowercase keys, QColor instead of QList<int>)
  let customLines = {}, customLinesArrow = {}, customLinesColor = {}, customLinesStyle = {};
  if (version >= 20) {
    customLines      = readQMapSLP(r);
    customLinesArrow = readQMapSB(r);
    customLinesColor = readQMapSC(r);
    customLinesStyle = readQMapSU2(r);
  } else if (version >= 11) {
    // v11-v19: uppercase keys, QList<int> for colors, QString for style
    const oldLines = readQMapSLP(r);
    for (const [k, v] of Object.entries(oldLines)) {
      customLines[k.toLowerCase()] = v;
    }
    const oldArrow = readQMapSB(r);
    for (const [k, v] of Object.entries(oldArrow)) {
      customLinesArrow[k.toLowerCase()] = v;
    }
    // old color: QMap<QString, QList<int>>
    const n = r.readUInt32();
    for (let i = 0; i < n; i++) {
      const k = readQString(r);
      const cnt = r.readUInt32();
      const rgb = [];
      for (let j = 0; j < cnt; j++) rgb.push(r.readInt32());
      if (rgb.length >= 3) {
        customLinesColor[k.toLowerCase()] = { spec:1, alpha:255, r:rgb[0], g:rgb[1], b:rgb[2], pad:0 };
      }
    }
    // old style: QMap<QString, QString>
    const styleMap = { 'dot line': 3, 'dash line': 2, 'dash dot line': 4, 'dash dot dot line': 5 };
    const ns = r.readUInt32();
    for (let i = 0; i < ns; i++) {
      const k = readQString(r);
      const sv = readQString(r);
      customLinesStyle[k.toLowerCase()] = styleMap[sv] ?? 1;
    }
    // Fix missing colors (Mudlet inserts Qt::red for missing ones)
    for (const k of Object.keys(customLines)) {
      if (!customLinesColor[k]) {
        customLinesColor[k] = { spec:1, alpha:255, r:255, g:0, b:0, pad:0 };
      }
    }
  }

  // v21+: mSpecialExitLocks as QSet<QString>
  if (version >= 21) {
    const lockSet = readQSetS(r);
    mSpecialExitLocks = [...lockSet];
    // Update rawSpecialExits with the lock info
    for (const cmd of lockSet) {
      const tid = mSpecialExits[cmd];
      if (tid != null && rawSpecialExits[tid]) {
        rawSpecialExits[tid] = rawSpecialExits[tid].map(c =>
          c === '0' + cmd ? '1' + cmd : c
        );
      }
    }
  }

  const exitLocks   = readQListI(r);

  let stubs = [];
  if (version >= 13) {
    stubs = readQListI(r);
  }

  let exitWeights = {}, doors = {};
  if (version >= 16) {
    exitWeights = readQMapSI(r);
    doors       = readQMapSI(r);
  }

  return {
    area, x, y, z,
    north, northeast, east, southeast, south, southwest, west, northwest,
    up, down, in: inn, out,
    environment, weight, name, isLocked, hidden,
    rawSpecialExits, mSpecialExits, mSpecialExitLocks,
    symbol, symbolColor, userData,
    customLines, customLinesArrow, customLinesColor, customLinesStyle,
    exitLocks, stubs, exitWeights, doors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// writeMudletRoom — always writes in v20 format
// ─────────────────────────────────────────────────────────────────────────────
function writeMudletRoom(w, room) {
  w.writeInt32(room.area        ?? 0);
  w.writeInt32(room.x ?? 0); w.writeInt32(room.y ?? 0); w.writeInt32(room.z ?? 0);
  w.writeInt32(room.north       ?? -1); w.writeInt32(room.northeast  ?? -1);
  w.writeInt32(room.east        ?? -1); w.writeInt32(room.southeast  ?? -1);
  w.writeInt32(room.south       ?? -1); w.writeInt32(room.southwest  ?? -1);
  w.writeInt32(room.west        ?? -1); w.writeInt32(room.northwest  ?? -1);
  w.writeInt32(room.up          ?? -1); w.writeInt32(room.down       ?? -1);
  w.writeInt32(room.in          ?? -1); w.writeInt32(room.out        ?? -1);
  w.writeInt32(room.environment ?? 0);
  w.writeInt32(Math.max(1, room.weight ?? 1));
  writeQString(w,   room.name    ?? '');
  w.writeInt8(room.isLocked ? 1 : 0);
  // v20: specialExits in the old QMultiMap<int,"0cmd"/"1cmd"> format
  // If data came from v21+ we have mSpecialExits+mSpecialExitLocks — reconstruct rawSpecialExits
  let raw = room.rawSpecialExits ?? {};
  if (!raw || Object.keys(raw).length === 0) {
    if (room.mSpecialExits && Object.keys(room.mSpecialExits).length > 0) {
      const lockSet = new Set(room.mSpecialExitLocks ?? []);
      raw = {};
      for (const [cmd, tid] of Object.entries(room.mSpecialExits)) {
        raw[tid] = raw[tid] ?? [];
        raw[tid].push((lockSet.has(cmd) ? '1' : '0') + cmd);
      }
    }
  }
  writeQMMUS(w, raw);
  writeQString(w,   room.symbol  ?? '');
  // v20: symbolColor goes to userData as system.fallback_symbol_color
  const ud = { ...(room.userData ?? {}) };
  if (room.symbolColor && room.symbolColor.spec > 0 && !ud['system.fallback_symbol_color']) {
    const c = room.symbolColor;
    ud['system.fallback_symbol_color'] = `#${((c.r<<16)|(c.g<<8)|c.b).toString(16).padStart(6,'0')}`;
  }
  if (room.hidden && !ud['system.hidden']) ud['system.hidden'] = '1';  // audyt T3/W4
  writeQMapSS(w,    ud);
  writeQMapSLP(w,   room.customLines      ?? {});
  writeQMapSB(w,    room.customLinesArrow ?? {});
  writeQMapSC(w,    room.customLinesColor ?? {});
  writeQMapSU2(w,   room.customLinesStyle ?? {});
  writeQListI(w,    room.exitLocks        ?? []);
  writeQListI(w,    room.stubs            ?? []);
  writeQMapSI(w,    room.exitWeights      ?? {});
  writeQMapSI(w,    room.doors            ?? {});
}

// ─────────────────────────────────────────────────────────────────────────────
// readMudletLabel(r, version) / writeMudletLabel
// ─────────────────────────────────────────────────────────────────────────────
function readMudletLabel(r, version) {
  const id        = r.readInt32();
  const pos       = readQVector(r);
  if (version < 21) {
    // v11-v20: two unused QPointF (2xdouble each) — skip bytes
    r.readDouble(); r.readDouble();
  }
  const sizeW     = r.readDouble();
  const sizeH     = r.readDouble();
  const text      = readQString(r);
  const fgColor   = readQColor(r);
  const bgColor   = readQColor(r);
  const pixMap    = readQPixMap(r);
  const noScaling = !!r.readInt8();
  const showOnTop = !!r.readInt8();
  return { id, pos, size: [sizeW, sizeH], text, fgColor, bgColor, pixMap, noScaling, showOnTop };
}

function writeMudletLabel(w, lbl) {
  const DEF_COLOR = { spec: 1, alpha: 255, r: 0, g: 0, b: 0, pad: 0 };
  w.writeInt32(lbl.id ?? 0);
  writeQVector(w, lbl.pos     ?? [0, 0, 0]);
  // v20: one unused QPointF (2xdouble) — dummy
  w.writeDouble(0.0); w.writeDouble(0.0);
  w.writeDouble(lbl.size?.[0] ?? 0.0);
  w.writeDouble(lbl.size?.[1] ?? 0.0);
  writeQString(w, lbl.text    ?? '');
  writeQColor(w,  lbl.fgColor ?? DEF_COLOR);
  writeQColor(w,  lbl.bgColor ?? DEF_COLOR);
  writeQPixMap(w, lbl.pixMap);
  w.writeInt8(lbl.noScaling  ? 1 : 0);
  w.writeInt8(lbl.showOnTop  ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// QSet<QString> — used in v21+ for mSpecialExitLocks
// ─────────────────────────────────────────────────────────────────────────────
function readQSetS(r) {
  const n = r.readUInt32();
  const s = new Set();
  for (let i = 0; i < n; i++) s.add(readQString(r));
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reads a Mudlet map.dat file from an ArrayBuffer.
 * Supports versions 17-22. Files newer than MUDLET_DAT_MAX_SUPPORTED_VERSION
 * return an error with .unsupportedVersion = true.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {object} raw map object
 */
function readMudletDat(arrayBuffer) {
  const r = new ReadBuffer(arrayBuffer);

  const version = r.readInt32();

  // Check version — reject files too new for us to read
  if (version > MUDLET_DAT_MAX_SUPPORTED_VERSION) {
    return {
      error: true,
      unsupportedVersion: true,
      version,
      message: `Mudlet DAT version ${version} — supported up to version ${MUDLET_DAT_MAX_SUPPORTED_VERSION}.`,
    };
  }

  if (version < MUDLET_DAT_MIN_VERSION) {
    return {
      error: true,
      unsupportedVersion: true,
      version,
      message: `Mudlet DAT version ${version} is too old — supported from version ${MUDLET_DAT_MIN_VERSION}.`,
    };
  }

  const envColors            = readQMapII(r);
  const areaNames            = readQMapIS(r);
  const mCustomEnvColors     = readQMapIC(r);
  const mpRoomDbHashToRoomId = readQMapSU(r);
  const mUserData            = readQMapSS(r);
  const mapSymbolFont        = readQFont(r);
  const mapFontFudgeFactor   = r.readDouble();
  const useOnlyMapFont       = !!r.readInt8();

  // MudletAreas
  const importWarnings = [];  // audit ext F2.9/F2.10: import warnings (duplicates, lost records)
  const areas = {};
  const areaCount = _datCounter(r.readInt32());  // audyt ext F2.8
  for (let i = 0; i < areaCount; i++) {
    const areaId = r.readInt32();
    // audit ext F2.9: duplicate area id -> warning (last-wins, unchanged), NOT a throw
    // Arc 37: `!== undefined` instead of hasOwnProperty — keys are int32 from readInt32(),
    // the prototype chain plays no role (identical behavior, cheaper in the hot loop).
    if (areas[areaId] !== undefined)
      importWarnings.push(`duplicate area id #${areaId} — kept the last record`);
    areas[areaId] = readMudletArea(r, version);
  }

  // mRoomIdHash
  const mRoomIdHash = readQMapSI(r);

  // Labels:
  // v11-v20: global after mRoomIdHash — (lblAreaCount, labelCount, areaId, labels[])
  // v21+:    embedded in each area (already read in readMudletArea)
  const labels = {};
  if (version < 21) {
    const lblAreaCount = _datCounter(r.readInt32());  // audyt ext F2.8
    for (let i = 0; i < lblAreaCount; i++) {
      const lblCount = _datCounter(r.readInt32());  // audyt ext F2.8
      const areaId   = r.readInt32();
      labels[areaId] = [];
      for (let j = 0; j < lblCount; j++) {
        labels[areaId].push(readMudletLabel(r, version));
      }
    }
  } else {
    // Move labels from areas into the global map (for internal compatibility)
    for (const [areaId, area] of Object.entries(areas)) {
      if (area.areaLabels && area.areaLabels.length > 0) {
        labels[areaId] = area.areaLabels;
      }
    }
  }

  // MudletRooms — until the end of the buffer
  const rooms = {};
  while (r.remaining() > 0) {
    const roomId = r.readInt32();
    // audit ext F2.9: duplicate room id -> warning (last-wins, unchanged), NOT a throw
    // Arc 37: `!== undefined` as above — int32 keys, the prototype chain plays no role.
    if (rooms[roomId] !== undefined)
      importWarnings.push(`duplicate room id #${roomId} — kept the last record`);
    rooms[roomId] = readMudletRoom(r, version);
  }

  return {
    version, envColors, areaNames, mCustomEnvColors, mpRoomDbHashToRoomId, mUserData,
    mapSymbolFont, mapFontFudgeFactor, useOnlyMapFont,
    areas, mRoomIdHash, labels, rooms, importWarnings,
  };
}

/**
 * Writes a raw map object to the Mudlet map.dat v20 binary format.
 * Always writes in MUDLET_DAT_WRITE_VERSION (20) — the current production standard.
 * @param {object} dat
 * @returns {Uint8Array}
 */
function writeMudletDat(dat) {
  const w = new WriteBuffer();

  // Always write in production version v20
  w.writeInt32(MUDLET_DAT_WRITE_VERSION);
  writeQMapII(w,  dat.envColors            ?? {});
  writeQMapIS(w,  dat.areaNames            ?? {});
  writeQMapIC(w,  dat.mCustomEnvColors     ?? {});
  writeQMapSU(w,  dat.mpRoomDbHashToRoomId ?? {});
  writeQMapSS(w,  dat.mUserData            ?? {});
  writeQFont(w,   dat.mapSymbolFont        ?? null);
  w.writeDouble(dat.mapFontFudgeFactor     ?? 1.0);
  w.writeInt8(dat.useOnlyMapFont ? 1 : 0);

  // MudletAreas — sorted ascending by areaId
  const areaEntries = Object.entries(dat.areas ?? {}).sort(cmpInt);
  w.writeInt32(areaEntries.length);
  for (const [areaId, area] of areaEntries) {
    w.writeInt32(parseInt(areaId));
    writeMudletArea(w, area);
  }

  // mRoomIdHash
  writeQMapSI(w, dat.mRoomIdHash ?? {});

  // Labels — in v20 global after mRoomIdHash
  // Collect from dat.labels AND from areas (if v21+ data has areaLabels)
  const allLabels = { ...(dat.labels ?? {}) };
  for (const [areaId, area] of Object.entries(dat.areas ?? {})) {
    if (area.areaLabels && area.areaLabels.length > 0 && !allLabels[areaId]) {
      allLabels[areaId] = area.areaLabels;
    }
  }
  // Keep only areas with at least 1 label
  const lblEntries = Object.entries(allLabels).filter(([, arr]) => arr && arr.length > 0);
  w.writeInt32(lblEntries.length);
  for (const [areaId, lblArr] of lblEntries) {
    const arr = lblArr ?? [];
    w.writeInt32(arr.length);
    w.writeInt32(parseInt(areaId));
    for (const lbl of arr) writeMudletLabel(w, lbl);
  }

  // MudletRooms — in reverse order (identical to the original Mudlet)
  const roomEntries = Object.entries(dat.rooms ?? {}).reverse();
  for (const [roomId, room] of roomEntries) {
    w.writeInt32(parseInt(roomId));
    writeMudletRoom(w, room);
  }

  return w.toUint8Array();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper utilities for base64 conversion (label pixmaps)
// ═══════════════════════════════════════════════════════════════════════════════

function uint8ToBase64(bytes) {
  if (!bytes || bytes.length === 0) return '';
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToUint8(b64) {
  if (!b64) return new Uint8Array(0);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export { readMudletDat, writeMudletDat, MUDLET_DAT_MAX_SUPPORTED_VERSION, MUDLET_DAT_WRITE_VERSION, uint8ToBase64, base64ToUint8 };

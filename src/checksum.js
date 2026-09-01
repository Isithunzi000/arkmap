// MAINTAINED module — forked from the generated extraction; logic has deliberately
// diverged from the source app, so scripts/extract.mjs no longer rewrites this file.
// Origin: Isithunzi000/arkadia-web_standalone-arkmap_studio/arkmap_studio.html @ 24bd9022895753779758e5c58286565c76d85d19 (lines 4799-5552)
// Divergence: EN internal invariant message in _CanonBuf (H0.3).

// ── checksum.js ──────────────────────────────────────────────────────────────
// Hierarchiczne sumy kontrolne XXH3-64 (alg v4) dla integralności pliku .arkmap
// Struktura: plik → obszary → pokoje
// Zapis (koperta v2): top-level checksums = { alg:'v4', file, meta, areas:{id→hex16}, rooms:{id→hex16} }
// Kodowanie kanoniczne wg spec: tests/checksums/CANONICAL_V4.md
// Weryfikacja wyłącznie alg 'v4'; brak sum → cicho; inny alg → GŁOŚNE ostrzeżenie (algMismatch).
// ─────────────────────────────────────────────────────────────────────────────

// _stripRoomDefaults(room) — usuwa puste kontenery i wartości domyślne z obiektu pokoju.
// Modyfikuje room in-place. Używane przez _serializeMap (na klonie).
// Odpowiada spec §6 omission convention: optional fields omitted when carrying no information.
function _stripRoomDefaults(room) {
  // Empty containers → omit
  if (room.exits && !Object.keys(room.exits).length)                     delete room.exits;
  if (room.doors && !Object.keys(room.doors).length)                     delete room.doors;
  if (room.exit_weights && !Object.keys(room.exit_weights).length)       delete room.exit_weights;
  if (room.custom_lines && !Object.keys(room.custom_lines).length)       delete room.custom_lines;
  if (room.special_exits && !Object.keys(room.special_exits).length)     delete room.special_exits;
  if (room.user_data && !Object.keys(room.user_data).length)             delete room.user_data;
  if (Array.isArray(room.stubs) && !room.stubs.length)                   delete room.stubs;
  if (Array.isArray(room.exit_locks) && !room.exit_locks.length)         delete room.exit_locks;
  if (Array.isArray(room.special_exit_locks) && !room.special_exit_locks.length) delete room.special_exit_locks;
  if (Array.isArray(room.tags) && !room.tags.length)                     delete room.tags;
  // Default values → omit
  if (room.weight === 1)      delete room.weight;
  if (room.locked === false)  delete room.locked;
  if (room.hidden === false)  delete room.hidden;  // audyt T3/W4: domyślne false nie wchodzi do CRC/eksportu
  if (room.symbol === '')     delete room.symbol;
  if (room.name === '')       delete room.name;
  if (room.notes === '')      delete room.notes;
  // Internal field not in spec — safety net for CRC consistency
  delete room.area;
  // CL inner defaults per spec §10
  if (room.custom_lines) {
    for (const cl of Object.values(room.custom_lines)) {
      if (cl.style === null || cl.style === 'solid') delete cl.style;
      if (cl.arrow === null || cl.arrow === false)    delete cl.arrow;
    }
  }
  return room;
}


// ====XXH3-64-BEGIN====
// XXH3-64 (seed 0), czysty JS. Rdzen na parach u32 [hi,lo] (Number/Math.imul) — zero BigInt
// w goracej sciezce; BigInt tylko na wyjsciu xxh3_64 (kontrakt API zachowany).
// Bajtowo identyczny z portem referencji xxHash v0.8.3 — piny: tests/checksums/xxh3_golden.js
// (vectors_v4.json, oracle Python) + fuzz rownowaznosci z referencja BigInt:
// tests/checksums/xxh3_fuzz_equiv.js (referencja: tests/checksums/xxh3.js).
const XXH3_SECRET = Uint8Array.from([
  0xb8, 0xfe, 0x6c, 0x39, 0x23, 0xa4, 0x4b, 0xbe, 0x7c, 0x01, 0x81, 0x2c, 0xf7, 0x21, 0xad, 0x1c,
  0xde, 0xd4, 0x6d, 0xe9, 0x83, 0x90, 0x97, 0xdb, 0x72, 0x40, 0xa4, 0xa4, 0xb7, 0xb3, 0x67, 0x1f,
  0xcb, 0x79, 0xe6, 0x4e, 0xcc, 0xc0, 0xe5, 0x78, 0x82, 0x5a, 0xd0, 0x7d, 0xcc, 0xff, 0x72, 0x21,
  0xb8, 0x08, 0x46, 0x74, 0xf7, 0x43, 0x24, 0x8e, 0xe0, 0x35, 0x90, 0xe6, 0x81, 0x3a, 0x26, 0x4c,
  0x3c, 0x28, 0x52, 0xbb, 0x91, 0xc3, 0x00, 0xcb, 0x88, 0xd0, 0x65, 0x8b, 0x1b, 0x53, 0x2e, 0xa3,
  0x71, 0x64, 0x48, 0x97, 0xa2, 0x0d, 0xf9, 0x4e, 0x38, 0x19, 0xef, 0x46, 0xa9, 0xde, 0xac, 0xd8,
  0xa8, 0xfa, 0x76, 0x3f, 0xe3, 0x9c, 0x34, 0x3f, 0xf9, 0xdc, 0xbb, 0xc7, 0xc7, 0x0b, 0x4f, 0x1d,
  0x8a, 0x51, 0xe0, 0x4b, 0xcd, 0xb4, 0x59, 0x31, 0xc8, 0x9f, 0x7e, 0xc9, 0xd9, 0x78, 0x73, 0x64,
  0xea, 0xc5, 0xac, 0x83, 0x34, 0xd3, 0xeb, 0xc3, 0xc5, 0x81, 0xa0, 0xff, 0xfa, 0x13, 0x63, 0xeb,
  0x17, 0x0d, 0xdd, 0x51, 0xb7, 0xf0, 0xda, 0x49, 0xd3, 0x16, 0x55, 0x26, 0x29, 0xd4, 0x68, 0x9e,
  0x2b, 0x16, 0xbe, 0x58, 0x7d, 0x47, 0xa1, 0xfc, 0x8f, 0xf8, 0xb8, 0xd1, 0x7a, 0xd0, 0x31, 0xce,
  0x45, 0xcb, 0x3a, 0x8f, 0x95, 0x16, 0x04, 0x28, 0xaf, 0xd7, 0xfb, 0xca, 0xbb, 0x4b, 0x40, 0x7e,
]);

// u64 jako para [hi, lo] (u32, u32). Stale 64-bit rozlozone na slowa:
const _P1H = 0x9E3779B1, _P1L = 0x85EBCA87;                 // _P64_1
const _P2H = 0xC2B2AE3D, _P2L = 0x27D4EB4F;                 // _P64_2
const _P3H = 0x165667B1, _P3L = 0x9E3779F9;                 // _P64_3
const _P4H = 0x85EBCA77, _P4L = 0xC2B2AE63;                 // _P64_4
const _P5H = 0x27D4EB2F, _P5L = 0x165667C5;                 // _P64_5
const _P32_1 = 0x9E3779B1, _P32_2 = 0x85EBCA77, _P32_3 = 0xC2B2AE3D;
const _MX1H = 0x16566791, _MX1L = 0x9E3779F9;               // _MX1
const _MX2H = 0x9FB21C65, _MX2L = 0x1E98DF25;               // _MX2

function _r32(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
const _swap32 = w => ((w >>> 24) | ((w >>> 8) & 0xFF00) | ((w << 8) & 0xFF0000) | (w << 24)) >>> 0;

// Rejestry robocze na poziomie modulu — zero alokacji w goracej petli.
// Kontrakt: funkcje zwracaja rejestr, wynik wazny do nastepnego wywolania dowolnej z nich.
const _LL = [0, 0], _LH = [0, 0], _HL = [0, 0], _HH = [0, 0];
const _MF = [0, 0];                                          // wynik _mul128fold / _mix16B
const _T64A = [0, 0];                                        // wynik _mul64into
const _ACC = [0, 0], _ACC2 = [0, 0];                         // akumulatory sciezek dlugosci
const _ACC8 = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]; // _hashLong

// 32x32 -> 64 dokladnie (limby 16-bit, wszystkie posrednie < 2^53)
function _umul32into(t, a, b) {
  const aL = a & 0xFFFF, aH = a >>> 16, bL = b & 0xFFFF, bH = b >>> 16;
  const w0 = aL * bL;
  const tt = aH * bL + (w0 >>> 16);                          // < 2^32 + 2^16
  const w1 = aL * bH + (tt & 0xFFFF);                        // < 2^32 + 2^16
  t[1] = ((w1 << 16) | (w0 & 0xFFFF)) >>> 0;
  t[0] = (aH * bH + Math.floor(tt / 65536) + Math.floor(w1 / 65536)) >>> 0;
}
// 64x64 -> 128 -> fold: (hi64 ^ lo64) iloczynu; wynik w _MF
function _mul128fold(aH, aL, bH, bL) {
  _umul32into(_LL, aL, bL);
  _umul32into(_LH, aL, bH);
  _umul32into(_HL, aH, bL);
  _umul32into(_HH, aH, bH);
  const s1 = _LL[0] + _LH[1] + _HL[1];                       // < 3*2^32
  const p1 = s1 >>> 0;
  const c1 = Math.floor(s1 / 4294967296);
  const s2 = _LH[0] + _HL[0] + _HH[1] + c1;
  const p2 = s2 >>> 0;
  const c2 = Math.floor(s2 / 4294967296);
  const p3 = (_HH[0] + c2) >>> 0;
  _MF[0] = (p3 ^ p1) >>> 0;
  _MF[1] = (p2 ^ _LL[1]) >>> 0;
  return _MF;
}
// acc += [pH, pL] (in place)
function _add64into(acc, pH, pL) {
  const s = acc[1] + pL;
  acc[1] = s >>> 0;
  acc[0] = (acc[0] + pH + (s >= 4294967296 ? 1 : 0)) >>> 0;
}
// t = (h,l) * (mH,mL) mod 2^64 (rejestr docelowy, zero alokacji)
function _mul64into(t, h, l, mH, mL) {
  _umul32into(_LL, l, mL);
  const mid = (Math.imul(h, mL) + Math.imul(l, mH)) >>> 0;
  t[0] = (_LL[0] + mid) >>> 0; t[1] = _LL[1];
}
function _avalancheIp(p) {
  let h = p[0], l = p[1];
  l ^= h >>> 5;                                              // h ^= h >> 37
  _mul64into(_T64A, h, l, _MX1H, _MX1L); h = _T64A[0]; l = _T64A[1];
  l ^= h;                                                    // h ^= h >> 32
  p[0] = h >>> 0; p[1] = l >>> 0;
}
function _avalanche64Ip(p) {
  let h = p[0], l = p[1];
  l ^= h >>> 1;                                              // h ^= h >> 33
  _mul64into(_T64A, h, l, _P2H, _P2L); h = _T64A[0]; l = _T64A[1];
  const s0 = h >>> 29, s1 = ((l >>> 29) | (h << 3)) >>> 0;   // h ^= h >> 29
  h = (h ^ s0) >>> 0; l = (l ^ s1) >>> 0;
  _mul64into(_T64A, h, l, _P3H, _P3L); h = _T64A[0]; l = _T64A[1];
  l ^= h;                                                    // h ^= h >> 32
  p[0] = h >>> 0; p[1] = l >>> 0;
}
function _rrmxmxIp(p, len) {
  let h = p[0], l = p[1];
  // h ^= rotl(h,49) ^ rotl(h,24)
  const r1h = ((l << 17) | (h >>> 15)) >>> 0, r1l = ((h << 17) | (l >>> 15)) >>> 0;
  const r2h = ((h << 24) | (l >>> 8)) >>> 0,  r2l = ((l << 24) | (h >>> 8)) >>> 0;
  h = (h ^ r1h ^ r2h) >>> 0; l = (l ^ r1l ^ r2l) >>> 0;
  _mul64into(_T64A, h, l, _MX2H, _MX2L); h = _T64A[0]; l = _T64A[1];
  // h ^= (h >> 35) + len
  let sl = (h >>> 3) + len;                                  // h >> 35 = [0, h>>>3]
  const carry = sl >= 4294967296 ? 1 : 0;
  h = (h ^ carry) >>> 0; l = (l ^ (sl >>> 0)) >>> 0;
  _mul64into(_T64A, h, l, _MX2H, _MX2L); h = _T64A[0]; l = _T64A[1];
  const t0 = h >>> 28, t1 = ((l >>> 28) | (h << 4)) >>> 0;   // h ^= h >> 28
  p[0] = (h ^ t0) >>> 0; p[1] = (l ^ t1) >>> 0;
}
function _mix16B(input, ioff, soff) {                        // wynik w _MF
  const aH = _r32(input, ioff + 4) ^ _r32(XXH3_SECRET, soff + 4);
  const aL = _r32(input, ioff) ^ _r32(XXH3_SECRET, soff);
  const bH = _r32(input, ioff + 12) ^ _r32(XXH3_SECRET, soff + 12);
  const bL = _r32(input, ioff + 8) ^ _r32(XXH3_SECRET, soff + 8);
  return _mul128fold(aH, aL, bH, bL);
}

// bitflipy i pusty skrot liczone z sekretu raz, przy ladowaniu (stale modulu)
const _BF1H = (_r32(XXH3_SECRET, 28) ^ _r32(XXH3_SECRET, 36)) >>> 0, _BF1L = (_r32(XXH3_SECRET, 24) ^ _r32(XXH3_SECRET, 32)) >>> 0;
const _BF2H = (_r32(XXH3_SECRET, 44) ^ _r32(XXH3_SECRET, 52)) >>> 0, _BF2L = (_r32(XXH3_SECRET, 40) ^ _r32(XXH3_SECRET, 48)) >>> 0;
const _BF3H = (_r32(XXH3_SECRET, 12) ^ _r32(XXH3_SECRET, 20)) >>> 0, _BF3L = (_r32(XXH3_SECRET, 8) ^ _r32(XXH3_SECRET, 16)) >>> 0;
const _BF4L = (_r32(XXH3_SECRET, 0) ^ _r32(XXH3_SECRET, 4)) >>> 0;
const _EMPTY64 = (() => {
  const p = [(_r32(XXH3_SECRET, 60) ^ _r32(XXH3_SECRET, 68)) >>> 0, (_r32(XXH3_SECRET, 56) ^ _r32(XXH3_SECRET, 64)) >>> 0];
  _avalanche64Ip(p);
  return p;
})();

function _len0to16(input, len) {
  if (len > 8) {
    const loH = (_r32(input, 4) ^ _BF1H) >>> 0, loL = (_r32(input, 0) ^ _BF1L) >>> 0;
    const hiH = (_r32(input, len - 4) ^ _BF2H) >>> 0, hiL = (_r32(input, len - 8) ^ _BF2L) >>> 0;
    const mf = _mul128fold(loH, loL, hiH, hiL);
    // acc = len + swap64(lo) + hi + mf
    _ACC[0] = 0; _ACC[1] = len;
    _add64into(_ACC, _swap32(loL), _swap32(loH));
    _add64into(_ACC, hiH, hiL);
    _add64into(_ACC, mf[0], mf[1]);
    _avalancheIp(_ACC);
    return _ACC;
  }
  if (len >= 4) {
    _ACC[0] = (_r32(input, 0) ^ _BF3H) >>> 0;               // input64: hi = input1, lo = input2
    _ACC[1] = (_r32(input, len - 4) ^ _BF3L) >>> 0;
    _rrmxmxIp(_ACC, len);
    return _ACC;
  }
  if (len) {
    const c1 = input[0], c2 = input[len >> 1], c3 = input[len - 1];
    const combined = ((c1 << 16) | (c2 << 24) | c3 | (len << 8)) >>> 0;
    _ACC[0] = 0; _ACC[1] = (combined ^ _BF4L) >>> 0;
    _avalanche64Ip(_ACC);
    return _ACC;
  }
  _ACC[0] = _EMPTY64[0]; _ACC[1] = _EMPTY64[1];
  return _ACC;
}

function _len17to128(input, len) {
  _mul64into(_ACC, 0, len, _P1H, _P1L);                    // acc = len * _P64_1
  let m;
  if (len > 32) {
    if (len > 64) {
      if (len > 96) {
        m = _mix16B(input, 48, 96);   _add64into(_ACC, m[0], m[1]);
        m = _mix16B(input, len - 64, 112); _add64into(_ACC, m[0], m[1]);
      }
      m = _mix16B(input, 32, 64);     _add64into(_ACC, m[0], m[1]);
      m = _mix16B(input, len - 48, 80); _add64into(_ACC, m[0], m[1]);
    }
    m = _mix16B(input, 16, 32);       _add64into(_ACC, m[0], m[1]);
    m = _mix16B(input, len - 32, 48); _add64into(_ACC, m[0], m[1]);
  }
  m = _mix16B(input, 0, 0);           _add64into(_ACC, m[0], m[1]);
  m = _mix16B(input, len - 16, 16);   _add64into(_ACC, m[0], m[1]);
  _avalancheIp(_ACC);
  return _ACC;
}

function _len129to240(input, len) {
  const nbRounds = Math.floor(len / 16);
  _mul64into(_ACC, 0, len, _P1H, _P1L);
  let m;
  for (let i = 0; i < 8; i++) {
    m = _mix16B(input, 16 * i, 16 * i); _add64into(_ACC, m[0], m[1]);
  }
  m = _mix16B(input, len - 16, 136 - 17);
  _ACC2[0] = m[0]; _ACC2[1] = m[1];
  _avalancheIp(_ACC);
  for (let i = 8; i < nbRounds; i++) {
    m = _mix16B(input, 16 * i, 16 * (i - 8) + 3); _add64into(_ACC2, m[0], m[1]);
  }
  _add64into(_ACC, _ACC2[0], _ACC2[1]);
  _avalancheIp(_ACC);
  return _ACC;
}

function _accumulate512(acc, input, ioff, soff) {
  for (let lane = 0; lane < 8; lane++) {
    const o = ioff + lane * 8, s = soff + lane * 8;
    const dvH = _r32(input, o + 4), dvL = _r32(input, o);
    const kH = dvH ^ _r32(XXH3_SECRET, s + 4), kL = dvL ^ _r32(XXH3_SECRET, s);
    const a1 = acc[lane ^ 1];
    _add64into(a1, dvH, dvL);
    _umul32into(_LL, kL, kH);                                // lo32(k) * hi32(k) -> 64
    const a0 = acc[lane];
    _add64into(a0, _LL[0], _LL[1]);
  }
}
function _scramble(acc, soff) {
  for (let lane = 0; lane < 8; lane++) {
    const p = acc[lane];
    let h = p[0], l = p[1];
    l ^= h >>> 15;                                           // a ^= a >> 47
    h = (h ^ _r32(XXH3_SECRET, soff + lane * 8 + 4)) >>> 0;
    l = (l ^ _r32(XXH3_SECRET, soff + lane * 8)) >>> 0;
    _mul64into(_T64A, h, l, 0, _P32_1);                    // a *= _P32_1 (32-bit)
    p[0] = _T64A[0]; p[1] = _T64A[1];
  }
}
function _hashLong(input, len) {
  const acc = _ACC8;
  acc[0][0] = 0;    acc[0][1] = _P32_3;
  acc[1][0] = _P1H; acc[1][1] = _P1L;
  acc[2][0] = _P2H; acc[2][1] = _P2L;
  acc[3][0] = _P3H; acc[3][1] = _P3L;
  acc[4][0] = _P4H; acc[4][1] = _P4L;
  acc[5][0] = 0;    acc[5][1] = _P32_2;
  acc[6][0] = _P5H; acc[6][1] = _P5L;
  acc[7][0] = 0;    acc[7][1] = _P32_1;
  const nbStripesPerBlock = 16;                              // (192 - 64) / 8
  const blockLen = 1024;                                     // 64 * nbStripesPerBlock
  const nbBlocks = Math.floor((len - 1) / blockLen);
  for (let n = 0; n < nbBlocks; n++) {
    const base = n * blockLen;
    for (let s = 0; s < nbStripesPerBlock; s++) {
      _accumulate512(acc, input, base + s * 64, s * 8);
    }
    _scramble(acc, 192 - 64);
  }
  const base = nbBlocks * blockLen;
  const nbStripes = Math.floor(((len - 1) - base) / 64);
  for (let s = 0; s < nbStripes; s++) {
    _accumulate512(acc, input, base + s * 64, s * 8);
  }
  _accumulate512(acc, input, len - 64, 192 - 64 - 7);        // LASTACC_START = 7
  _mul64into(_ACC, 0, len, _P1H, _P1L);
  for (let i = 0; i < 4; i++) {
    const s = 11 + 16 * i;
    const aH = acc[2 * i][0] ^ _r32(XXH3_SECRET, s + 4), aL = acc[2 * i][1] ^ _r32(XXH3_SECRET, s);
    const bH = acc[2 * i + 1][0] ^ _r32(XXH3_SECRET, s + 12), bL = acc[2 * i + 1][1] ^ _r32(XXH3_SECRET, s + 8);
    const m = _mul128fold(aH, aL, bH, bL);
    _add64into(_ACC, m[0], m[1]);
  }
  _avalancheIp(_ACC);
  return _ACC;
}

// _xxh3pair(bytes, len?) -> rejestr [hi, lo] (u32, u32); wynik wazny do nastepnego wywolania.
// len < bytes.length: hash tylko prefixu (goraca sciezka czyta wprost ze wspolnego bufora, bez subarray).
function _xxh3pair(bytes, len) {
  if (len === undefined) len = bytes.length;
  if (len <= 16) return _len0to16(bytes, len);
  if (len <= 128) return _len17to128(bytes, len);
  if (len <= 240) return _len129to240(bytes, len);
  return _hashLong(bytes, len);
}
// tablica 2-znakowych bajtow hex — _pairHex64 bez padStart (pomiar: ~10x szybciej)
const _HEXB = new Array(256);
for (let i = 0; i < 256; i++) _HEXB[i] = (i < 16 ? '0' : '') + i.toString(16);
function _hex32(w) {
  return _HEXB[w >>> 24] + _HEXB[(w >>> 16) & 255] + _HEXB[(w >>> 8) & 255] + _HEXB[w & 255];
}
function _pairHex64(p) {
  return _hex32(p[0]) + _hex32(p[1]);
}
// xxh3_64(bytes: Uint8Array) -> BigInt (unsigned 64-bit), seed 0 — kontrakt bez zmian
function xxh3_64(bytes) {
  const p = _xxh3pair(bytes);
  return (BigInt(p[0]) << 32n) | BigInt(p[1]);
}
function xxh3_64hex(bytes) {
  return _pairHex64(_xxh3pair(bytes));
}
// ====XXH3-64-END====

// ====CANONICAL-V4-BEGIN====
// Kanoniczne kodowanie binarne v4 — spec normatywny: tests/checksums/CANONICAL_V4.md
const _V4_DIR_ORDER = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'up', 'down', 'in', 'out'];
const _V4_DIR_SET = new Set(_V4_DIR_ORDER);
const _CANON_NAN_BYTES = Uint8Array.from([0, 0, 0, 0, 0, 0, 0xF8, 0x7F]); // quiet-NaN 7ff8000000000000
const _canonAB = new ArrayBuffer(8);
const _canonF8 = new Uint8Array(_canonAB);
const _canonDv = new DataView(_canonAB);
const _canonTe = new TextEncoder();

class _CanonBuf {
  constructor() { this.b = new Uint8Array(4096); this.n = 0; this._busy = false; this.dv = new DataView(this.b.buffer); }
  // Straznik zagniezdzenia: reset w trakcie trwania innego kodowania nadpisalby bufor.
  // Wejsciowe enkodery (pokoj/obszar/plik) robia reset() + release() w finally.
  reset() {
    if (this._busy) throw new Error('_CanonBuf: nested use (reset during encoding)');
    this._busy = true; this.n = 0;
  }
  release() { this._busy = false; }
  _cap(k) {
    if (this.n + k > this.b.length) {
      let c = this.b.length * 2;
      while (c < this.n + k) c *= 2;
      const nb = new Uint8Array(c);
      nb.set(this.b.subarray(0, this.n));
      this.b = nb;
      this.dv = new DataView(nb.buffer);
    }
  }
  u8(v) { if (this.n + 1 > this.b.length) this._cap(1); this.b[this.n++] = v & 0xFF; }
  u32(v) {
    if (this.n + 4 > this.b.length) this._cap(4);
    this.dv.setUint32(this.n, v >>> 0, true);
    this.n += 4;
  }
  i32(v) { this.u32(v | 0); }
  f64(v) {
    if (typeof v !== 'number' || Number.isNaN(v)) { this._cap(8); this.b.set(_CANON_NAN_BYTES, this.n); this.n += 8; return; } // undefined/nie-liczba → kanoniczny NaN (payload deterministyczny niezależnie od provenancji obiektu)
    if (v === 0) v = 0;                                            // -0 → +0
    if (this.n + 8 > this.b.length) this._cap(8);
    this.dv.setFloat64(this.n, v, true); this.n += 8;
  }
  str(s) {
    if (this.n + 4 + s.length * 3 > this.b.length) this._cap(4 + s.length * 3);
    const b = this.b, o = this.n + 4;
    let i = 0;
    for (; i < s.length; i++) {                                    // ASCII: bajty === kodowanie UTF-8
      const c = s.charCodeAt(i);
      if (c > 0x7F) break;
      b[o + i] = c;
    }
    if (i === s.length) {
      this.dv.setUint32(this.n, s.length, true);
      this.n = o + s.length;
      return;
    }
    const w = _canonTe.encodeInto(s, b.subarray(o)).written;
    this.dv.setUint32(this.n, w, true);
    this.n = o + w;
  }
  u64raw(p) {                                                      // surowy hash XXH3-64 (para [hi,lo]) jako 8 B LE — do rollupów
    if (this.n + 8 > this.b.length) this._cap(8);
    this.dv.setUint32(this.n, p[1], true);
    this.dv.setUint32(this.n + 4, p[0], true);
    this.n += 8;
  }
  bytes() { return this.b.subarray(0, this.n); }
}
const _canonBuf = new _CanonBuf();

function _utf8cmp(a, b) {                                          // a, b: Uint8Array — porównanie bajtowe
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { if (a[i] !== b[i]) return a[i] - b[i]; }
  return a.length - b.length;
}
function _utf8SortArr(arr) {
  return arr.map(k => [k, _canonTe.encode(k)]).sort((p, q) => _utf8cmp(p[1], q[1])).map(p => p[0]);
}
// Klucze mapy kierunkowej: znane wg _V4_DIR_ORDER, potem nieznane UTF-8 bajtowo
function _canonDirKeys(m) {
  const out = [];
  for (const d of _V4_DIR_ORDER) if (m[d] !== undefined) out.push(d);
  let unk = null;
  for (const k in m) if (!_V4_DIR_SET.has(k)) (unk || (unk = [])).push(k);
  return unk ? out.concat(_utf8SortArr(unk)) : out;
}
// Lista kierunków (array): jak wyżej
function _canonDirList(arr) {
  const out = _V4_DIR_ORDER.filter(d => arr.includes(d));
  const unk = arr.filter(k => !_V4_DIR_SET.has(k));
  return unk.length ? out.concat(_utf8SortArr(unk)) : out;
}

function _encodeLabelCanonical(B, lb) {
  B.i32(lb.id); B.f64(lb.x); B.f64(lb.y); B.i32(lb.z);
  B.f64(lb.width); B.f64(lb.height);
  B.str(lb.text ?? '');
  // tolerancja na uszkodzone pliki (verifyChecksums biegnie przed dialogiem walidacji):
  // brakujace fg/bg kodowane jako [0,0,0] — deterministycznie, walidator i tak je odrzuci
  const fg = Array.isArray(lb.fg_color) ? lb.fg_color : [0, 0, 0];
  const bg = Array.isArray(lb.bg_color) ? lb.bg_color : [0, 0, 0];
  // v4: liczba skladowych + wszystkie kanaly (alfa objeta) — konwencja jak w _encodeColorsCanonical
  B.u32(fg.length); for (const c of fg) B.i32(c | 0);
  B.u32(bg.length); for (const c of bg) B.i32(c | 0);
  B.u8(lb.show_on_top ? 1 : 0);
  B.u8(lb.no_scaling ? 1 : 0);
  const pm = lb.pixmap;
  if (pm === undefined || pm === null || pm === '') B.u8(0);
  else { B.u8(1); B.str(pm); }
}

// _encodeRoomCanonical(room) — kanoniczne bajty pokoju (prefix 'r4'). Bez klonowania.
function _encodeRoomCanonical(room) {
  const B = _canonBuf; B.reset();
  try { _encodeRoomBody(B, room); return B.bytes(); } finally { B.release(); }
}
function _encodeRoomBody(B, room) {
  if (B.n + 22 > B.b.length) B._cap(22);                         // 'r4' + id/x/y/z/env — jedna paczka
  { const b = B.b, dv = B.dv; let n = B.n;
    b[n] = 0x72; b[n + 1] = 0x34;                                    // 'r4'
    dv.setUint32(n + 2, room.id, true); dv.setUint32(n + 6, room.x, true);
    dv.setUint32(n + 10, room.y, true); dv.setUint32(n + 14, room.z, true);
    dv.setUint32(n + 18, room.env, true);
    B.n = n + 22; }
  if (room.weight !== undefined && room.weight !== 1) B.i32(room.weight);
  if (room.locked) B.u8(1);
  if (room.hidden) B.u8(1);
  if (room.symbol) B.str(room.symbol);
  if (room.name)   B.str(room.name);
  if (room.notes)  B.str(room.notes);

  const exits = room.exits;
  if (exits) {
    const ks = _canonDirKeys(exits);
    if (ks.length) {
      B.u32(ks.length);
      for (const k of ks) { B.str(k); B.i32(exits[k]); }
    }
  }
  const locks = room.exit_locks;
  if (locks && locks.length) {
    const ks = _canonDirList(locks);
    B.u32(ks.length);
    for (const k of ks) B.str(k);
  }
  const doors = room.doors;
  if (doors) {
    const ks = _canonDirKeys(doors);
    if (ks.length) {
      B.u32(ks.length);
      for (const k of ks) { B.str(k); B.str(doors[k]); }
    }
  }
  const stubs = room.stubs;
  if (stubs && stubs.length) {
    const ks = _canonDirList(stubs);
    B.u32(ks.length);
    for (const k of ks) B.str(k);
  }
  const se = room.special_exits;
  if (se && Object.keys(se).length) {
    const ks = _utf8SortArr(Object.keys(se));
    B.u32(ks.length);
    for (const k of ks) { B.str(k); B.i32(se[k]); }
  }
  const sel = room.special_exit_locks;
  if (sel && sel.length) {
    const ks = _utf8SortArr(sel);
    B.u32(ks.length);
    for (const k of ks) B.str(k);
  }
  const ew = room.exit_weights;
  if (ew && Object.keys(ew).length) {
    const ks = _canonDirKeys(ew);
    B.u32(ks.length);
    for (const k of ks) { B.str(k); B.i32(ew[k]); }
  }
  const cl = room.custom_lines;
  if (cl && Object.keys(cl).length) {
    const ks = _utf8SortArr(Object.keys(cl));
    B.u32(ks.length);
    for (const k of ks) {
      const e = cl[k];
      B.str(k);
      const pts = e.points || [];
      B.u32(pts.length);                                           // [] = supresor — licznik 0
      for (const pt of pts) { B.f64(pt[0]); B.f64(pt[1]); }
      const color = e.color;
      if (color !== undefined && color !== null) {
        B.u8(1); B.i32(color[0]); B.i32(color[1]); B.i32(color[2]);
      }
      const style = (e.style === undefined || e.style === null) ? 'solid' : e.style;
      if (style !== 'solid') { B.u8(1); B.str(style); }
      if (e.arrow) B.u8(1);
    }
  }
  const tags = room.tags;
  if (tags && tags.length) {
    const ts = _utf8SortArr(tags);
    B.u32(ts.length);
    for (const t of ts) B.str(t);
  }
  const ud = room.user_data;
  if (ud && Object.keys(ud).length) {
    const ks = _utf8SortArr(Object.keys(ud));
    B.u32(ks.length);
    for (const k of ks) { B.str(k); B.str(ud[k]); }
  }
  const rh = room.hash;                                            // v4: hash pokoju z upstream (np. "45:28:0:Wyzima")
  if (typeof rh === 'string' && rh) B.str(rh);
}

// _encodeAreaCanonical(area, roomRawList) — 'a4'; roomRawList: BigInt[] w kolejności id pokoju rosnąco
function _encodeAreaCanonical(area, roomRawList) {
  const B = _canonBuf; B.reset();
  try { _encodeAreaBody(B, area, roomRawList); return B.bytes(); } finally { B.release(); }
}
function _encodeAreaBody(B, area, roomRawList) {
  B.u8(0x61); B.u8(0x34);                                          // 'a4'
  B.i32(area.id); B.str(area.name ?? '');
  // v4: pola obszaru wczesniej poza suma (presence-guard zgodny z konwencja pomijania w pliku)
  if (area.grid_mode !== undefined) B.u8(area.grid_mode ? 1 : 0);
  if (area.is_zone !== undefined) B.u8(area.is_zone ? 1 : 0);
  if (area.zone_area_ref !== undefined) B.i32(area.zone_area_ref);
  if (Array.isArray(area.pos)) { B.i32(area.pos[0]); B.i32(area.pos[1]); B.i32(area.pos[2]); }
  const labels = area.labels;
  if (labels && labels.length) {
    const sorted = [...labels].sort((a, b) => a.id - b.id);
    B.u32(sorted.length);
    for (const lb of sorted) _encodeLabelCanonical(B, lb);
  }
  const aud = area.user_data;
  if (aud && Object.keys(aud).length) {
    const ks = _utf8SortArr(Object.keys(aud));
    B.u32(ks.length);
    for (const k of ks) { B.str(k); B.str(aud[k]); }
  }
  B.u32(roomRawList.length);
  for (const h of roomRawList) B.u64raw(h);
}

function _encodeColorsCanonical(B, colors) {
  const env = (colors && colors.env_colors) || {};
  const ek = Object.keys(env).sort((a, b) => Number(a) - Number(b));
  B.u32(ek.length);
  for (const k of ek) { B.i32(Number(k)); B.i32(env[k]); }
  const ce = (colors && colors.custom_env_colors) || {};
  const ck = Object.keys(ce).sort((a, b) => Number(a) - Number(b));
  B.u32(ck.length);
  for (const k of ck) {
    const comps = ce[k];
    B.i32(Number(k)); B.u8(comps.length);
    for (const c of comps) B.i32(c);
  }
}

// _encodeFileCanonical(colors, areaRaw) — 'f4'; areaRaw: pary [id, BigInt] posortowane po id rosnąco.
// v4: bez globalnego rollupu pokoi — byl redundantny wzgledem rollupow obszarow (pokoj -> obszar -> plik).
function _encodeFileBody(B, colors, areaRaw) {
  B.u8(0x66); B.u8(0x34);                                        // 'f4'
  _encodeColorsCanonical(B, colors);
  B.u32(areaRaw.length);
  for (const [, h] of areaRaw) B.u64raw(h);
}
function _encodeFileCanonical(colors, areaRaw) {
  const B = _canonBuf; B.reset();
  try { _encodeFileBody(B, colors, areaRaw); return B.bytes(); } finally { B.release(); }
}

function _hex64(h) { return h.toString(16).padStart(16, '0'); }

// _hashRoomCanon(room) — encode do wspolnego bufora + hash bez subarray; zwraca rejestr _xxh3pair.
function _hashRoomCanon(room) {
  const B = _canonBuf; B.reset();
  try { _encodeRoomBody(B, room); return _xxh3pair(B.b, B.n); } finally { B.release(); }
}
function _hashFileCanon(colors, areaRaw) {
  const B = _canonBuf; B.reset();
  try { _encodeFileBody(B, colors, areaRaw); return _xxh3pair(B.b, B.n); } finally { B.release(); }
}

// ── Kodowanie obiektu meta (prefix 'm4') — checksums.meta, koperta v2 (D2) ──
// Generyczne kodowanie wartosci JSON: tagi typow, klucze obiektow w porzadku
// bajtowym UTF-8, rekurencja. Klucze z wartoscia undefined pomijane (jak w
// serializacji); undefined/null w tablicach kodowane jako null. Spec: CANONICAL_V4.md
// (sekcja „Meta object encoding"); wektory: tests/checksums/vectors_v4_meta.json.
const _V4_META_MAX_DEPTH = 60;   // jak _DELTA_MAX_DEPTH — glebokie meta → wyjatek → verifyError (nigdy RangeError)
function _encodeMetaValue(B, v, depth) {
  if (depth > _V4_META_MAX_DEPTH) throw new Error('meta-canon-depth');
  if (v === null || v === undefined) { B.u8(0); return; }
  const t = typeof v;
  if (t === 'boolean') { B.u8(v ? 2 : 1); return; }
  if (t === 'number') {
    if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) { B.u8(3); B.i32(v); }
    else { B.u8(4); B.f64(v); }
    return;
  }
  if (t === 'string') { B.u8(5); B.str(v); return; }
  if (t === 'object') {
    if (Array.isArray(v)) {
      B.u8(6); B.u32(v.length);
      for (const item of v) _encodeMetaValue(B, item, depth + 1);
      return;
    }
    const ks = _utf8SortArr(Object.keys(v).filter(k => v[k] !== undefined));
    B.u8(7); B.u32(ks.length);
    for (const k of ks) { B.str(k); _encodeMetaValue(B, v[k], depth + 1); }
    return;
  }
  B.u8(0);   // typy spoza JSON (function/symbol) — nie wystepuja po JSON.parse; deterministycznie jako null
}
// _encodeMetaBody(B, meta) — 'm4' + cialo obiektu top-level (meta jest zawsze obiektem)
function _encodeMetaBody(B, meta) {
  B.u8(0x6D); B.u8(0x34);                                        // 'm4'
  const m = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta : {};
  const ks = _utf8SortArr(Object.keys(m).filter(k => m[k] !== undefined));
  B.u32(ks.length);
  for (const k of ks) { B.str(k); _encodeMetaValue(B, m[k], 1); }
}
function _hashMetaCanon(meta) {
  const B = _canonBuf; B.reset();
  try { _encodeMetaBody(B, meta); return _xxh3pair(B.b, B.n); } finally { B.release(); }
}

// _computeV4Checksums(arkmap) — jeden wspólny przebieg liczenia sum alg v4.
// Read-only (bez klonowania, bez mutacji mapy). Zwraca dokładnie kształt top-level checksums
// (koperta v2: alg/file/meta/areas/rooms; meta = integrity meta, file = identity bez meta).
// Może rzucić na uszkodzonych danych — wyjątek łapie WYŁĄCZNIE verifyChecksums (ścieżka wczytania);
// ścieżki zapisu (addChecksums, baseInfo, delta) celowo fail-loud: wyjątek tam = bug aplikacji.
function _computeV4Checksums(arkmap) {
  const rooms = {}, areas = {};
  const sortedAreas = [...(arkmap.areas || [])].sort((a, b) => a.id - b.id);
  const areaRaw = [];

  for (const area of sortedAreas) {
    const sortedRooms = [...(area.rooms || [])].sort((a, b) => a.id - b.id);
    const roomRawList = [];
    for (const room of sortedRooms) {
      const raw = _hashRoomCanon(room);
      rooms[String(room.id)] = _pairHex64(raw);
      roomRawList.push([raw[0], raw[1]]);                            // kopia — rejestr wspoldzielony
    }
    const B = _canonBuf; B.reset();
    let aRaw;
    try { _encodeAreaBody(B, area, roomRawList); const p = _xxh3pair(B.b, B.n); aRaw = [p[0], p[1]]; } finally { B.release(); }
    areas[String(area.id)] = _pairHex64(aRaw);
    areaRaw.push([area.id, aRaw]);
  }

  return {
    alg: 'v4',
    file: _pairHex64(_hashFileCanon(arkmap.colors, areaRaw)),
    meta: _pairHex64(_hashMetaCanon(arkmap.meta)),
    areas, rooms,
  };
}

// addChecksums(arkmap) — stempluje meta.app_version (objete checksums.meta) i wstawia
// sumy v4 na TOP-LEVEL arkmap.checksums (koperta v2). In-place, zwraca arkmap.
// APP_VERSION moze nie istniec w kontekscie harnessow node (ekstrakcja blokow) — wtedy bez stempla.
function addChecksums(arkmap) {
  if (!arkmap.meta) arkmap.meta = {};
  if (typeof APP_VERSION !== 'undefined') arkmap.meta.app_version = APP_VERSION;
  arkmap.checksums = _computeV4Checksums(arkmap);
  return arkmap;
}

// verifyChecksums(arkmap) — weryfikacja hierarchiczna alg v4. NIGDY nie rzuca (biegnie przed
// dialogiem walidacji): uszkodzone dane → verifyError, a głos ma walidacja.
// Czyta sumy z TOP-LEVEL arkmap.checksums (koperta v2); meta.checksums (uklad v1) jest ignorowane
// — pliki v1 odrzuca wczesniej walidacja (format_version !== 2 = fatal).
// Zwraca: { present, ok, fileOk, metaOk?, badAreas:[{id,name}], badRooms:[{roomId,areaId,areaName}],
//           missingRooms:[id], missingAreas:[{id,name}], extraRooms:[klucz], extraAreas:[klucz],
//           computed? (pełny zestaw do reużycia), algMismatch?, verifyError? }
// metaOk — osobny, INFORMACYJNY sygnal integrity meta (D2); nie wchodzi do ok.
// Brak sekcji sum → present:false (cicho; świeże/zaimportowane pliki).
// Alg inny niż v4 → present:true, ok:false, algMismatch — GŁOŚNO: cichy skip byłby dziurą downgrade'ową.
function verifyChecksums(arkmap) {
  const empty = { badAreas: [], badRooms: [], missingRooms: [], missingAreas: [], extraRooms: [], extraAreas: [] };
  const stored = arkmap.checksums;
  if (!stored || !stored.file) return { present: false, ok: true, fileOk: true, ...empty };
  if (stored.alg !== 'v4') {
    return { present: true, ok: false, fileOk: false, algMismatch: String(stored.alg), ...empty };
  }

  let computed;
  try { computed = _computeV4Checksums(arkmap); }
  catch (e) { return { present: true, ok: false, fileOk: false, verifyError: true, ...empty }; }

  const badAreas = [], badRooms = [], missingRooms = [], missingAreas = [];
  const storedRooms = stored.rooms || {}, storedAreas = stored.areas || {};
  const sortedAreas = [...(arkmap.areas || [])].sort((a, b) => a.id - b.id);
  for (const area of sortedAreas) {
    const sidA = String(area.id);
    const storedA = storedAreas[sidA];
    if (!storedA) missingAreas.push({ id: area.id, name: area.name });
    else if (storedA !== computed.areas[sidA]) badAreas.push({ id: area.id, name: area.name });
    const sortedRooms = [...(area.rooms || [])].sort((a, b) => a.id - b.id);
    for (const room of sortedRooms) {
      const sid = String(room.id);
      const storedR = storedRooms[sid];
      if (!storedR) missingRooms.push(room.id);
      else if (storedR !== computed.rooms[sid]) badRooms.push({ roomId: room.id, areaId: area.id, areaName: area.name });
    }
  }
  // sieroty: wpisy w zapisanych słownikach bez obiektu w pliku (deterministyczny porządek bajtowy kluczy)
  const _keyOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const extraRooms = Object.keys(storedRooms).filter(id => !(id in computed.rooms)).sort(_keyOrder);
  const extraAreas = Object.keys(storedAreas).filter(id => !(id in computed.areas)).sort(_keyOrder);

  const fileOk = stored.file === computed.file;
  const ok = fileOk && !badAreas.length && !badRooms.length && !missingRooms.length
             && !missingAreas.length && !extraRooms.length && !extraAreas.length;
  // D2: integrity meta — informacyjnie, poza ok; undefined gdy plik nie niesie checksums.meta
  const metaOk = (typeof stored.meta === 'string') ? stored.meta === computed.meta : undefined;
  return { present: true, ok, fileOk, metaOk, badAreas, badRooms, missingRooms, missingAreas, extraRooms, extraAreas, computed };
}
// ====CANONICAL-V4-END====

export { xxh3_64, xxh3_64hex, addChecksums, verifyChecksums, _stripRoomDefaults };

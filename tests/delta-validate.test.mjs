// delta-validate: .arkdelta reader — fail-closed validation, integrity
// checksums, machine codes, i18n (EN default, PL byte-pinned to Studio),
// Ed25519 signature verification, base identity (H1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ARKDELTA_FORMAT, ARKDELTA_FORMAT_VERSION, ARKDELTA_MAX_OPS,
  validateDeltaText, verifyDeltaSignature, computeBaseInfo, deltaChecksums,
} from '../src/delta-validate.js';
import { stableStringify } from '../src/stable-stringify.js';
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle; // Node 18 has no globalThis.crypto
import { addChecksums } from '../src/checksum.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'demo.arkdelta');
const demoText = readFileSync(FIXTURE, 'utf8');
const demo = JSON.parse(demoText);

// minimal valid delta factory (1 op, correct checksums)
function makeDelta(ops, metaExtra) {
  const meta = Object.assign({ ops_count: ops.length, created: '2026-01-01T00:00:00Z' }, metaExtra);
  const d = { format: ARKDELTA_FORMAT, format_version: ARKDELTA_FORMAT_VERSION, meta, ops };
  d.checksums = deltaChecksums(meta, ops);
  return JSON.stringify(d);
}
const opSeq1 = { seq: 1, type: 'DELETE_ROOM', target: { roomId: 5, areaId: 1 }, payload: { room: { id: 5 } }, label: 'x' };

test('valid fixture passes, EN + PL, empty errors and codes', () => {
  for (const opts of [undefined, {}, { locale: 'en' }, { locale: 'pl' }, { locale: 'de' }]) {
    const r = validateDeltaText(demoText, opts);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.codes, []);
    assert.ok(r.delta && Array.isArray(r.delta.ops));
  }
});

test('codes are stable across locales, parallel to errors', () => {
  const broken = makeDelta([{ seq: 1, type: 'DELETE_ROOM', target: { areaId: 1 }, payload: {} }]);
  const en = validateDeltaText(broken);
  const pl = validateDeltaText(broken, { locale: 'pl' });
  assert.equal(en.ok, false);
  assert.deepEqual(en.codes, pl.codes);
  assert.equal(en.errors.length, en.codes.length);
  assert.notEqual(en.errors[0], pl.errors[0]); // same site, different language
});

test('PL byte-pins: Studio validator wording', () => {
  const pl = t => validateDeltaText(t, { locale: 'pl' }).errors[0];
  assert.equal(pl(''), 'Pusty plik.');
  assert.equal(pl('x'.repeat(9 * 1024 * 1024)), 'Plik za duży (limit 8 MB).');
  assert.equal(pl('{nope'), 'Nie można odczytać pliku — uszkodzony lub to nie jest plik kalki.');
  assert.equal(pl('{"a":1}'), 'To nie jest plik .arkdelta.');
  assert.equal(pl(JSON.stringify({ format: 'arkdelta', format_version: 2 })),
    'Nieobsługiwana wersja formatu kalki: 2 (ta wersja ArkMap Studio obsługuje: 3). Kalki w starym formacie nie są wczytywane — zapisz kalkę ponownie z logu zmian albo zaktualizuj ArkMap Studio. Plik nie został wczytany.');
  assert.equal(pl(JSON.stringify({ format: 'arkdelta', format_version: 3, meta: {}, ops: [], checksums: deltaChecksums({}, []), wtf: 1 })),
    'Plik .arkdelta zawiera pola spoza specyfikacji (wtf). Plik nie został wczytany.');
});

test('EN defaults for the same early-exit sites', () => {
  const en = t => validateDeltaText(t).errors[0];
  assert.equal(en(''), 'Empty file.');
  assert.equal(en('{nope'), 'Cannot read the file — corrupted or not a delta file.');
  assert.equal(en('{"a":1}'), 'This is not an .arkdelta file.');
});

test('checksum mismatch: aggregate + per-op localization (PL byte-pin)', () => {
  const d = JSON.parse(makeDelta([opSeq1, { ...opSeq1, seq: 2 }]));
  d.ops[1].label = 'tampered'; // break op 2 sum
  const r = validateDeltaText(JSON.stringify(d), { locale: 'pl' });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0], 'Plik .arkdelta jest uszkodzony — operacja #2 nie zgadza się z sumą kontrolną. Plik nie został wczytany.');
  assert.equal(r.codes[0], 'CHECKSUM_MISMATCH');
});

test('ops gate: missing list, too many ops, header count mismatch', () => {
  const d = JSON.parse(makeDelta([opSeq1]));
  delete d.ops; // stored sums describe ops -> checksum gate fires first
  const r1 = validateDeltaText(JSON.stringify(d));
  assert.equal(r1.codes[0], 'CHECKSUM_MISMATCH');

  const d1b = JSON.parse(makeDelta([opSeq1]));
  delete d1b.ops;
  d1b.checksums = deltaChecksums(d1b.meta, []); // sums recomputed consistently
  const r1b = validateDeltaText(JSON.stringify(d1b), { locale: 'pl' });
  assert.equal(r1b.codes[0], 'OPS_MISSING');
  assert.equal(r1b.errors[0], 'Plik uszkodzony — brak listy operacji.');

  const many = Array.from({ length: ARKDELTA_MAX_OPS + 1 }, (_, i) => ({ ...opSeq1, seq: i + 1 }));
  const r2 = validateDeltaText(makeDelta(many), { locale: 'pl' });
  assert.equal(r2.errors[0], 'Za dużo operacji (limit 5000).');

  const d3 = JSON.parse(makeDelta([opSeq1]));
  d3.meta.ops_count = 7;
  d3.checksums = deltaChecksums(d3.meta, d3.ops); // sums valid, count lies
  const r3 = validateDeltaText(JSON.stringify(d3), { locale: 'pl' });
  assert.equal(r3.ok, false);
  assert.ok(r3.errors.includes('Plik uszkodzony — liczba operacji w nagłówku (7) nie zgadza się z zawartością (1).'));
});

test('op-level errors: seq order, unknown type, missing fields (PL byte-pin)', () => {
  const r1 = validateDeltaText(makeDelta([{ ...opSeq1, seq: 9 }]), { locale: 'pl' });
  assert.ok(r1.errors.includes('operacja #9: numeracja nie jest po kolei.'));

  const r2 = validateDeltaText(makeDelta([{ ...opSeq1, type: 'BOOM' }]), { locale: 'pl' });
  assert.ok(r2.errors.includes('operacja #1: nieznany typ operacji "BOOM". Plik nie został wczytany.'));

  const r3 = validateDeltaText(makeDelta([{ seq: 1, type: 'MOVE_ROOM', target: {}, payload: {} }]), { locale: 'pl' });
  assert.ok(r3.errors.includes('operacja #1: niekompletne dane (brak: pokój).'));
  assert.ok(r3.errors.includes('operacja #1: niekompletne dane (brak: nowa pozycja X).'));

  const r4 = validateDeltaText(makeDelta([{ seq: 1, type: 'MOVE_ROOM', target: { roomId: 'abc' }, payload: { toX: 1, toY: 2, toZ: 0 } }]), { locale: 'pl' });
  assert.ok(r4.errors.includes('operacja #1: nieprawidłowe dane (pole: pokój).'));
});

test('op-level errors: bad dir, forbidden key, unknown key, strict sets', () => {
  const bad = (op) => validateDeltaText(makeDelta([op]), { locale: 'pl' });
  const r1 = bad({ seq: 1, type: 'DELETE_EXIT', target: { roomId: 1, dir: 'qq' }, payload: {} });
  assert.ok(r1.errors.includes('operacja #1: nieprawidłowy kierunek "qq".'));

  const r2 = bad(JSON.parse('{"seq":1,"type":"DELETE_EXIT","target":{"roomId":1,"dir":"e"},"payload":{},"__proto__":{}}'));
  // note: JSON __proto__ is an own property after parse — deep scan must catch it
  assert.ok(r2.errors.includes('operacja #1: niedozwolony klucz "__proto__".'));

  const r3 = bad({ seq: 1, type: 'DELETE_EXIT', target: { roomId: 1, dir: 'e', evil: 1 }, payload: {} });
  assert.ok(r3.errors.includes('operacja #1: nieznane pole "evil" — plik nie pochodzi z tej wersji ArkMap Studio. Plik nie został wczytany.'));
});

test('sid integrity: define-before-use, duplicates, ADD needs sid', () => {
  const addRoom = sid => ({ seq: 1, type: 'ADD_ROOM', target: { roomId: sid, areaId: 1 }, payload: { room: { id: sid, x: 0, y: 0, z: 0 } } });
  // ADD with a plain number instead of sid
  const r1 = validateDeltaText(makeDelta([{ ...addRoom('d:1'), target: { roomId: 42, areaId: 1 }, payload: { room: { id: 42 } } }]), { locale: 'pl' });
  assert.ok(r1.errors.includes('operacja #1: nowy obiekt musi mieć identyfikator kalki (np. d:1), nie zwykły numer.'));

  // use before definition
  const useOp = { seq: 1, type: 'ADD_EXIT', target: { sourceId: 'd:1', dir: 'e' }, payload: { targetId: 'd:2' } };
  const r2 = validateDeltaText(makeDelta([useOp]), { locale: 'pl' });
  assert.ok(r2.errors.some(e => e.includes('odwołanie do nieistniejącego obiektu kalki (d:1)')));

  // duplicate sid
  const dup = [addRoom('d:1'), { ...addRoom('d:1'), seq: 2 }];
  const r3 = validateDeltaText(makeDelta(dup), { locale: 'pl' });
  assert.ok(r3.errors.includes('operacja #2: zduplikowany identyfikator kalki (d:1).'));

  // happy path: define d:1, then use it
  const r4 = validateDeltaText(makeDelta([addRoom('d:1'), { seq: 2, type: 'ADD_EXIT', target: { sourceId: 'd:1', dir: 'e' }, payload: { targetId: 7 } }]));
  assert.equal(r4.ok, true);
});

test('validator never throws on hostile input', () => {
  const deep = JSON.stringify({ format: 'arkdelta', format_version: 3, meta: {}, ops: [],
    checksums: deltaChecksums({}, []) });
  for (const t of [null, undefined, 42, {}, [], deep]) {
    const r = validateDeltaText(t);
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(Array.isArray(r.errors) && Array.isArray(r.codes));
  }
  // deeply nested op (depth guard, controlled error instead of RangeError)
  let nest = { a: 0 };
  for (let i = 0; i < 80; i++) nest = { a: nest };
  const r = validateDeltaText(makeDelta([{ ...opSeq1, payload: { room: nest } }]), { locale: 'pl' });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0], 'zbyt głęboko zagnieżdżona struktura.');
});

test('signature: unsigned / claimed / bad / ok + idOk (WebCrypto E2E)', async () => {
  const base = JSON.parse(makeDelta([opSeq1]));
  // unsigned
  assert.deepEqual(await verifyDeltaSignature(base), { state: 'unsigned' });
  // claimed (author fields without sig)
  const claimed = JSON.parse(makeDelta([opSeq1], { author: 'Gandalf' }));
  assert.equal((await verifyDeltaSignature(claimed)).state, 'claimed');
  // ok: sign the payload with a real key
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pubHex = [...new Uint8Array(await subtle.exportKey('raw', kp.publicKey))].map(b => b.toString(16).padStart(2, '0')).join('');
  const signed = JSON.parse(makeDelta([opSeq1], { author: 'Gandalf', author_pubkey: pubHex }));
  const payload = 'arkdelta-v3:' + stableStringify(signed);
  const sig = await subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(payload));
  signed.checksums.sig = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  const okRes = await verifyDeltaSignature(signed);
  assert.equal(okRes.state, 'ok');
  assert.equal(okRes.idOk, true); // no declared author_id -> matches by construction
  assert.equal(okRes.author, 'Gandalf');
  // bad: flip one sig nibble
  const badSig = JSON.parse(JSON.stringify(signed));
  badSig.checksums.sig = (badSig.checksums.sig[0] === 'a' ? 'b' : 'a') + badSig.checksums.sig.slice(1);
  assert.equal((await verifyDeltaSignature(badSig)).state, 'bad');
  // bad: sig malformed
  const malformed = JSON.parse(JSON.stringify(signed));
  malformed.checksums.sig = 'zz';
  assert.equal((await verifyDeltaSignature(malformed)).state, 'bad');
});

test('computeBaseInfo: crc + version/revision + per-area sums', () => {
  const map = { format: 'arkmap', format_version: 2, meta: { map_name: 'T', user_data: { version: '1.2', revision: '3' } },
    colors: {}, areas: [{ id: 1, name: 'A', rooms: [{ id: 1, x: 0, y: 0, z: 0, exits: {} }] }] };
  addChecksums(map);
  const info = computeBaseInfo(map);
  assert.equal(typeof info.crc, 'string');
  assert.equal(info.version, '1.2');
  assert.equal(info.revision, '3');
  assert.deepEqual(Object.keys(info.areas), ['1']);
  // precomputed path returns identical identity
  assert.deepEqual(computeBaseInfo(map, map.checksums && { file: map.checksums.file, areas: map.checksums.areas }), info);
  assert.equal(computeBaseInfo(null), null);
});

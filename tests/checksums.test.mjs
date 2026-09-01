// Checksums v4 (XXH3-64 canonical encoding) against the external oracle vectors
// (reference encoder: Python/xxhash in the app repo, tests/checksums/oracle_v4.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { addChecksums, verifyChecksums } from '../src/checksum.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const VECTORS = JSON.parse(readFileSync(join(FIX, 'vectors_v4.json'), 'utf8'));
const VECTORS_META = JSON.parse(readFileSync(join(FIX, 'vectors_v4_meta.json'), 'utf8'));
const FIXTURE = JSON.parse(readFileSync(join(FIX, 'golden_fixture.arkmap'), 'utf8'));

const freshMap = () => JSON.parse(JSON.stringify(FIXTURE));

test('golden fixture end-to-end vs oracle', () => {
  const map = freshMap();
  addChecksums(map);
  const cs = map.checksums;
  assert.equal(cs.alg, 'v4');
  assert.equal(cs.file, VECTORS.golden.file.hash, 'file hash vs oracle');
  for (const [id, v] of Object.entries(VECTORS.golden.areas)) {
    assert.equal(cs.areas[id], v.hash, `area ${id} hash vs oracle`);
  }
  for (const [id, v] of Object.entries(VECTORS.golden.rooms)) {
    assert.equal(cs.rooms[id], v.hash, `room ${id} hash vs oracle`);
  }
  assert.equal(Object.keys(cs.rooms).length, 12);
  assert.equal(Object.keys(cs.areas).length, 2);
  assert.match(cs.file, /^[0-9a-f]{16}$/);
  assert.equal(map.meta.checksums, undefined, 'checksums live top-level (envelope v2)');
  assert.equal(cs.meta, VECTORS_META.golden.meta.hash, 'meta hash (m4) vs oracle');
  assert.equal(FIXTURE.format_version, 2);
});

test('verifyChecksums: freshly summed map verifies ok', () => {
  const map = freshMap();
  addChecksums(map);
  const res = verifyChecksums(map);
  assert.equal(res.present, true);
  assert.equal(res.ok, true);
  assert.equal(res.fileOk, true);
  assert.equal(res.metaOk, true);
  assert.deepEqual(res.badAreas, []);
  assert.deepEqual(res.badRooms, []);
});

test('verifyChecksums: tampered room is detected', () => {
  const map = freshMap();
  addChecksums(map);
  map.areas.find(a => a.id === 1).rooms.find(r => r.id === 1).name = 'TAMPERED';
  const res = verifyChecksums(map);
  assert.equal(res.ok, false);
  assert.equal(res.fileOk, false);
  // badRooms entries are { roomId, areaId, areaName }
  assert.ok(res.badRooms.some(r => r.roomId === 1 && r.areaId === 1), 'room 1 flagged with context');
  assert.ok(res.badAreas.some(a => a.id === 1), 'area 1 flagged');
});

test('map without checksums: present=false', () => {
  const res = verifyChecksums(freshMap());
  assert.equal(res.present, false);
});

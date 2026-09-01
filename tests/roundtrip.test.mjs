// End-to-end: create -> validate -> save -> load -> convert both ways -> validate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadArkmap, saveArkmap, createEmptyMap,
  datToArkmap, arkmapToDat,
  validate, verifyChecksums, checkSuppressorsInMap, isArkadiaMap,
  FORMAT, FORMAT_VERSION, CHECKSUM_ALG, MUDLET_DAT_READ_MAX, MUDLET_DAT_WRITE_VERSION,
} from '../src/index.js';

function twoRoomMap() {
  const map = createEmptyMap('Testland');
  map.areas = [{
    id: 1, name: 'Testland',
    rooms: [
      { id: 1, x: 0, y: 0, z: 0, env: 1, exits: { e: 2 }, special_exits: {}, weight: 1 },
      { id: 2, x: 1, y: 0, z: 0, env: 1, exits: { w: 1 }, special_exits: {}, weight: 1, name: 'Karczma' },
    ],
    labels: [],
  }];
  return map;
}

test('createEmptyMap passes validate with zero errors', () => {
  const res = validate(createEmptyMap());
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

test('constants are exported and sane', () => {
  assert.equal(FORMAT, 'arkmap');
  assert.equal(FORMAT_VERSION, 2);
  assert.equal(CHECKSUM_ALG, 'v4');
  assert.equal(MUDLET_DAT_READ_MAX, 22);
  assert.equal(MUDLET_DAT_WRITE_VERSION, 20);
});

test('save -> load roundtrip is stable and verifies', () => {
  const text1 = saveArkmap(twoRoomMap());
  const { map, validation, checksums } = loadArkmap(text1);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(checksums.ok, true);
  // determinism: saving the loaded map again yields identical text
  assert.equal(saveArkmap(map), text1);
});

test('arkmap -> dat -> arkmap preserves rooms, exits, names', () => {
  const buf = arkmapToDat(twoRoomMap());
  assert.ok(buf instanceof Uint8Array);
  const back = datToArkmap(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.equal(validate(back).ok, true, JSON.stringify(validate(back).errors));
  const rooms = back.areas.flatMap(a => a.rooms);
  assert.equal(rooms.length, 2);
  assert.equal(rooms.find(r => r.id === 2).name, 'Karczma');
  assert.deepEqual(rooms.find(r => r.id === 1).exits, { e: 2 });
  assert.equal(back.areas[0].name, 'Testland');
});

test('checkSuppressorsInMap: clean map has no missing suppressors', () => {
  assert.equal(checkSuppressorsInMap(twoRoomMap()).length, 0);
});

test('isArkadiaMap: signature-env heuristic (>=2 signature envs)', () => {
  const map = twoRoomMap();
  map.areas[0].rooms[0].env = 257; // one signature env: not enough
  assert.equal(isArkadiaMap(map, null), false);
  map.areas[0].rooms[1].env = 258; // second signature env: Arkadia
  assert.equal(isArkadiaMap(map, null), true);
  assert.equal(isArkadiaMap(twoRoomMap(), null), false);
});

test('loadArkmap rejects non-map JSON', () => {
  assert.throws(() => loadArkmap('[1,2,3]'), /not a map object/);
  assert.throws(() => loadArkmap('not json'), SyntaxError);
});

// dat error paths: EN messages + machine codes (H0.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMudletDat } from '../src/mudlet-dat.js';
import { datToArkmap } from '../src/dat-to-arkmap.js';
import { validate } from '../src/validate.js';

function i32buf(...words) {
  const b = new ArrayBuffer(words.length * 4);
  const dv = new DataView(b);
  words.forEach((w, i) => dv.setInt32(i * 4, w, false));
  return b;
}

// minimal valid v20 stream prefix up to the MudletAreas section count:
// version + 5 empty QMaps + null QFont + fontFudge(double) + onlyFont(int8)
function prefixToAreaCount() {
  const bytes = [];
  const i32 = (v) => bytes.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const u8 = (v) => bytes.push(v & 255);
  const u16 = (v) => bytes.push((v >>> 8) & 255, v & 255);
  const f64 = () => { for (let k = 0; k < 8; k++) bytes.push(0); };
  i32(20);                       // version
  for (let k = 0; k < 5; k++) i32(0);   // envColors, areaNames, customEnvColors, hashToRoomId, userData
  i32(-1); i32(-1);              // QFont family + style: null QStrings
  f64(); i32(0); u8(0); u16(0); u8(0); u8(0); u8(0); u16(0); u8(0); i32(0); i32(0); u8(0); u8(0); // QFont body
  f64();                         // mapFontFudgeFactor
  u8(0);                         // useOnlyMapFont
  return bytes;
}

test('dat: truncated file throws EN message with code DAT_TRUNCATED', () => {
  assert.throws(() => readMudletDat(i32buf(20, 0x7fffffff)), (e) => {
    assert.equal(e.code, 'DAT_TRUNCATED');
    assert.match(e.message, /^arkmap: corrupt or truncated \.dat: read of \d+ B at offset \d+, file is \d+ B$/);
    return true;
  });
});

test('dat: negative section count throws EN message with code DAT_NEGATIVE_COUNT', () => {
  const bytes = prefixToAreaCount();
  bytes.push(255, 255, 255, 255); // areaCount = -1
  assert.throws(() => readMudletDat(new Uint8Array(bytes).buffer), (e) => {
    assert.equal(e.code, 'DAT_NEGATIVE_COUNT');
    assert.equal(e.message, 'arkmap: corrupt .dat (negative section count)');
    return true;
  });
});

test('dat: unsupported version throws EN message with code DAT_UNSUPPORTED_VERSION', () => {
  assert.throws(() => datToArkmap(i32buf(23)), (e) => {
    assert.equal(e.code, 'DAT_UNSUPPORTED_VERSION');
    assert.equal(e.message, 'Mudlet DAT version 23 — supported up to version 22.');
    return true;
  });
  assert.throws(() => datToArkmap(i32buf(16)), (e) => {
    assert.equal(e.code, 'DAT_UNSUPPORTED_VERSION');
    assert.equal(e.message, 'Mudlet DAT version 16 is too old — supported from version 17.');
    return true;
  });
});

test('validate: special exit duplicating a direction warns in EN with code', () => {
  const map = { areas: [{ id: 1, name: 'A', rooms: [
    { id: 1, x: 0, y: 0, z: 0, exits: { e: 2 }, special_exits: { e: 2 } },
    { id: 2, x: 1, y: 0, z: 0, exits: { w: 1 } },
  ] }] };
  const res = validate(map);
  const w = res.warnings.find((x) => x.code === 'SPECIAL_EXIT_OVERLAPS_EXIT');
  assert.ok(w, 'warning present');
  assert.match(w.msg, /^special exit command "e" duplicates a regular direction/);
  assert.ok(!/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(w.msg), 'warning is English');
});

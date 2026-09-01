// validate() i18n: { path, code, msg } shape, EN default, PL catalog (H0.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validate } from '../src/validate.js';
import { LOCALES } from '../src/locale.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'validate.js');

function brokenMap() {
  return {
    format: 'arkmap',
    format_version: 2,
    meta: { map_name: 'T', symbol_font: undefined, symbol_font_fudge_factor: 1, use_only_map_font: true },
    colors: {},
    areas: [{ id: 1, name: 'A', rooms: [
      { id: 1, x: 0, y: 0, z: 0, exits: { e: 99, q: 2 }, special_exits: { e: 2 }, doors: { e: 'barred' }, exit_weights: { z: 1 } },
      { id: 2, x: 1, y: 0, z: 0, exits: {} },
    ] }],
  };
}

test('validate: errors carry { path, code, msg }, default English', () => {
  const res = validate(brokenMap());
  assert.equal(res.ok, false);
  assert.ok(res.errors.length >= 5);
  for (const e of [...res.errors, ...res.warnings]) {
    assert.equal(typeof e.path, 'string');
    assert.equal(typeof e.code, 'string');
    assert.equal(typeof e.msg, 'string');
    assert.ok(!/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(e.msg), `EN msg has PL diacritics: ${e.msg}`);
  }
  const fonts = res.errors.find(e => e.path === 'meta.symbol_font');
  assert.deepEqual(fonts, { path: 'meta.symbol_font', code: 'REQUIRED', msg: 'required' });
  const dir = res.errors.find(e => e.code === 'INVALID_DIRECTION');
  assert.equal(dir.msg, '"q" is not a valid direction');
  const nf = res.errors.find(e => e.code === 'TARGET_NOT_FOUND');
  assert.equal(nf.msg, 'target roomId 99 does not exist');
});

test('validate: locale pl switches messages to Polish, codes stay stable', () => {
  const en = validate(brokenMap());
  const pl = validate(brokenMap(), { locale: 'pl' });
  assert.deepEqual(en.errors.map(e => e.code), pl.errors.map(e => e.code));
  assert.deepEqual(en.errors.map(e => e.path), pl.errors.map(e => e.path));
  const plDir = pl.errors.find(e => e.code === 'INVALID_DIRECTION');
  assert.equal(plDir.msg, '"q" nie jest prawidłowym kierunkiem');
  const plNf = pl.errors.find(e => e.code === 'TARGET_NOT_FOUND');
  assert.equal(plNf.msg, 'docelowy roomId 99 nie istnieje');
  const plDoor = pl.errors.find(e => e.code === 'INVALID_DOOR_VALUE');
  assert.equal(plDoor.msg, 'musi być "open", "closed" albo "locked"');
});

test('validate: unknown locale falls back to English', () => {
  const res = validate(brokenMap(), { locale: 'de' });
  const dir = res.errors.find(e => e.code === 'INVALID_DIRECTION');
  assert.equal(dir.msg, '"q" is not a valid direction');
});

test('validate: PL warning byte-pinned to Studio wording', () => {
  const map = { areas: [{ id: 1, name: 'A', rooms: [
    { id: 1, x: 0, y: 0, z: 0, exits: { e: 2 }, special_exits: { e: 2 } },
    { id: 2, x: 1, y: 0, z: 0, exits: { w: 1 } },
  ] }] };
  const res = validate(map, { locale: 'pl' });
  const w = res.warnings.find(x => x.code === 'SPECIAL_EXIT_OVERLAPS_EXIT');
  assert.equal(w.msg, 'komenda specjalnego wyjścia "e" pokrywa się z normalnym kierunkiem — drzwi, wagi i custom lines używają wspólnego klucza, co może powodować niejednoznaczność danych');
});

test('validate: every code used in validate.js exists in both catalogs', () => {
  const src = readFileSync(SRC, 'utf8');
  const used = new Set([...src.matchAll(/err\([^)]*?, '([A-Z0-9_]+)', loc/g)].map(m => m[1]));
  assert.ok(used.size >= 30, `expected >= 30 codes, got ${used.size}`);
  for (const code of used) {
    assert.equal(typeof LOCALES.en['val.' + code], 'string', `en missing val.${code}`);
    assert.equal(typeof LOCALES.pl['val.' + code], 'string', `pl missing val.${code}`);
  }
  // no orphan val.* keys in the catalogs
  for (const loc of ['en', 'pl']) {
    for (const key of Object.keys(LOCALES[loc])) {
      if (key.startsWith('val.')) assert.ok(used.has(key.slice(4)), `orphan catalog key ${key}`);
    }
  }
});

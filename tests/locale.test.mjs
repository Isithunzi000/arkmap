// locale.test.mjs — message catalogs: mechanism, plural rules, key
// completeness, EN purity, PL output pins (Studio parity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, resolveLocale, translate, plural } from '../src/locale.js';

test('resolveLocale: only exact "pl" selects Polish, everything else → en', () => {
  assert.equal(resolveLocale('pl'), 'pl');
  assert.equal(resolveLocale('en'), 'en');
  assert.equal(resolveLocale(undefined), 'en');
  assert.equal(resolveLocale('PL'), 'en');
  assert.equal(resolveLocale('de'), 'en');
  assert.equal(resolveLocale(''), 'en');
  assert.equal(resolveLocale(null), 'en');
});

test('translate: EN default, PL on request, params stringified', () => {
  assert.equal(translate('diff.addRoom', { name: 'Polana', id: 6401 }),
    'Add room "Polana" (#6401)');
  assert.equal(translate('diff.addRoom', { name: 'Polana', id: 6401 }, 'pl'),
    'Dodanie pokoju "Polana" (#6401)');
  assert.equal(translate('diff.addRoom', { name: 'Polana', id: 6401 }, 'de'),
    'Add room "Polana" (#6401)');   // unknown locale → EN
});

test('translate: missing param left as placeholder, no params → raw template', () => {
  assert.equal(translate('diff.delExit', { dir: 'n' }), 'Delete exit n from #{id}');
  assert.equal(translate('diff.editExits'), 'Edit exits in room "{name}" (#{id})');
});

test('translate: unknown key throws; plural-form key rejected as message', () => {
  assert.throws(() => translate('diff.nope'), /unknown message key/);
  assert.throws(() => translate('words.room'), /not a message key/);
});

test('plural: English one/other', () => {
  assert.equal(plural('en', 1, 'words.room'), 'room');
  assert.equal(plural('en', 0, 'words.room'), 'rooms');
  assert.equal(plural('en', 2, 'words.room'), 'rooms');
  assert.equal(plural(undefined, 5, 'words.room'), 'rooms');
});

test('plural: Polish one/few/many incl. 12–14 exception', () => {
  assert.equal(plural('pl', 1, 'words.room'), 'pokój');
  assert.equal(plural('pl', 2, 'words.room'), 'pokoje');
  assert.equal(plural('pl', 3, 'words.room'), 'pokoje');
  assert.equal(plural('pl', 4, 'words.room'), 'pokoje');
  assert.equal(plural('pl', 5, 'words.room'), 'pokoi');
  assert.equal(plural('pl', 11, 'words.room'), 'pokoi');
  assert.equal(plural('pl', 12, 'words.room'), 'pokoi');
  assert.equal(plural('pl', 14, 'words.room'), 'pokoi');
  assert.equal(plural('pl', 22, 'words.room'), 'pokoje');
  assert.equal(plural('pl', 25, 'words.room'), 'pokoi');
  assert.equal(plural('pl', 112, 'words.room'), 'pokoi');
  assert.equal(plural('pl', 122, 'words.room'), 'pokoje');
  assert.throws(() => plural('pl', 1, 'words.nope'), /unknown plural forms key/);
});

test('catalog completeness: every PL key exists in EN (drift guard)', () => {
  for (const k of Object.keys(LOCALES.pl)) {
    assert.ok(LOCALES.en[k] !== undefined, `PL key missing in EN: ${k}`);
  }
  // same value shapes on both sides (string ↔ string, object ↔ object)
  for (const k of Object.keys(LOCALES.pl)) {
    assert.equal(typeof LOCALES.pl[k], typeof LOCALES.en[k], `shape mismatch: ${k}`);
  }
});

test('EN purity: no Polish diacritics anywhere in the English catalog', () => {
  const scan = (v) => (typeof v === 'string' ? v : Object.values(v).join(' '));
  for (const [k, v] of Object.entries(LOCALES.en)) {
    assert.ok(!/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(scan(v)), `PL diacritics in EN value: ${k}`);
  }
});

// PL output pins — byte-identical to ArkMap Studio's current labels.
// If Studio's wording ever changes on purpose, update the pins in the same commit.
test('PL pins: Studio-exact label templates', () => {
  assert.equal(LOCALES.pl['diff.delArea'], 'Usunięcie obszaru "{name}"');
  assert.equal(LOCALES.pl['diff.addCL'], 'Dodano CL dir={dir} w pokoju "{name}" (#{id})');
  assert.equal(LOCALES.pl['diff.delSuppressor'], 'Usunięcie pustej custom line dir={dir} w pokoju "{name}" (#{id})');
  assert.equal(LOCALES.pl['diff.addExit'], 'Dodanie wyjścia {dir} → #{target} (z #{id})');
  assert.equal(LOCALES.pl['diff.moveRoomToArea'], 'Przeniesienie pokoju "{name}" (#{id}) do obszaru "{areaName}"');
  assert.equal(LOCALES.pl['diff.resizeLabel'], 'Resize etykiety "{name}" (#{id})');
});

test('PL pin: paintBatch full render incl. deliberate 2–4 grammar fix', () => {
  // Studio prints "Malowanie — N pokoi" for every n > 1 (grammar bug);
  // this package renders the correct few-form for 2–4 (documented in locale.js).
  assert.equal(translate('diff.paintBatch', { n: 1, rooms: plural('pl', 1, 'words.room') }, 'pl'), 'Malowanie — 1 pokój');
  assert.equal(translate('diff.paintBatch', { n: 3, rooms: plural('pl', 3, 'words.room') }, 'pl'), 'Malowanie — 3 pokoje');
  assert.equal(translate('diff.paintBatch', { n: 7, rooms: plural('pl', 7, 'words.room') }, 'pl'), 'Malowanie — 7 pokoi');
  assert.equal(translate('diff.paintBatch', { n: 3, rooms: plural('en', 3, 'words.room') }), 'Recolor — 3 rooms');
});

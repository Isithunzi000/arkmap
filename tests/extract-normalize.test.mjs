// extract.mjs normalizeLogic: comment/formatting-insensitive projection (H0.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLogic } from '../scripts/extract.mjs';

test('normalize: line and block comments are dropped', () => {
  const a = 'const x = 1; // leading comment\n/* block */ const y = 2;';
  const b = 'const x = 1;\nconst y = 2; // trailing';
  assert.equal(normalizeLogic(a), normalizeLogic(b));
});

test('normalize: comment-only difference inside code passes', () => {
  const pl = 'function f() {\n  // polski komentarz\n  return 1 + 2;\n}';
  const en = 'function f() {\n  // English comment, different length\n  return 1 + 2;\n}';
  assert.equal(normalizeLogic(pl), normalizeLogic(en));
});

test('normalize: code difference is detected', () => {
  const a = 'function f() { return 1 + 2; }';
  const b = 'function f() { return 1 + 3; }';
  assert.notEqual(normalizeLogic(a), normalizeLogic(b));
});

test('normalize: whitespace/formatting difference passes', () => {
  const a = 'const o = {a:1,b:2};';
  const b = 'const o = {\n  a: 1,\n  b: 2\n};';
  assert.equal(normalizeLogic(a), normalizeLogic(b));
});

test('normalize: strings with comment-like content stay intact', () => {
  const a = "const s = 'not // a comment'; const t = \"nor /* one */\";";
  const b = "const s = 'not // a comment';\nconst t = \"nor /* one */\"; // real comment";
  assert.equal(normalizeLogic(a), normalizeLogic(b));
  const c = "const s = 'changed // text'; const t = \"nor /* one */\";";
  assert.notEqual(normalizeLogic(a), normalizeLogic(c));
});

test('normalize: template literals with ${} expressions', () => {
  const a = 'const m = `area #${id} (${name || \'x\'}): ${n} rooms`; // c1';
  const b = 'const m = `area #${ id } (${ name || \'x\' }): ${ n } rooms`;';
  // inside ${} whitespace collapses identically; literal parts differ -> differ
  const c = 'const m = `area #${id} (${name || \'x\'}): ${n} pokoi`;';
  assert.equal(normalizeLogic(a), normalizeLogic(b.replace(/\$\{ /g, '${').replace(/ \}/g, '}')));
  assert.notEqual(normalizeLogic(a), normalizeLogic(c));
});

test('normalize: regex literals survive, comment after regex dropped', () => {
  const a = "const re = /a\\/\\*b[c/]d/; // komentarz";
  const b = "const re = /a\\/\\*b[c/]d/;";
  assert.equal(normalizeLogic(a), normalizeLogic(b));
});

test('normalize: division is not mistaken for regex', () => {
  const a = 'const q = a / b / c; // dzielenie';
  const b = 'const q = a / b / c;';
  assert.equal(normalizeLogic(a), normalizeLogic(b));
});

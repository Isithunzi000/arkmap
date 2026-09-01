// search-index.test.mjs — token-indexed room search (parity rules with the
// ArkMap Studio planner search: name=2 / area=1 / id=999, ord tie-break, top 25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex, searchIndexed } from '../src/search-index.js';

function mkMap() {
  return {
    areas: [
      { id: 1, name: 'Obszar Testowy', rooms: [
        { id: 1, x: 0, y: 0, z: 0, name: 'Rynek Glowny' },
        { id: 2, x: 1, y: 0, z: 0, name: 'Karczma pod Smokiem' },
        { id: 3, x: 2, y: 0, z: 0 },
        { id: 4, x: 3, y: 0, z: 0, name: 'Smocza Jama' },
      ] },
      { id: 2, name: 'Ujemny obszar', rooms: [
        { id: 10, x: 0, y: 0, z: 0, name: 'Rynek Poboczny' },
        { id: 11, x: 1, y: 0, z: 0, name: 'Karczma u Wuja' },
      ] },
    ],
  };
}

test('index: tokens from room names and area names', () => {
  const idx = buildSearchIndex(mkMap());
  assert.ok(idx.tok.get('karczma').n.includes(2));
  assert.ok(idx.tok.get('karczma').n.includes(11));
  assert.ok(idx.tok.get('obszar').a.includes(1));   // area token hit
  assert.ok(idx.tok.get('ujemny').a.includes(10));
  assert.equal(idx.ord.get(1), 0);
  assert.equal(idx.ord.get(11), 5);
});

test('score: word in room name = 2, in area name = 1', () => {
  const idx = buildSearchIndex(mkMap());
  const hits = searchIndexed(idx, 'karczma');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].score, 2);
  assert.deepEqual(hits.map(h => h.roomId), [2, 11]);   // ord tie-break
  const area = searchIndexed(idx, 'ujemny');
  assert.equal(area.length, 2);
  assert.ok(area.every(h => h.score === 1));
});

test('multi-word: intersect + cumulative score, name beats area', () => {
  const idx = buildSearchIndex(mkMap());
  const hits = searchIndexed(idx, 'rynek obszar');
  // rooms 1 i 10: 'rynek' w nazwie (2) + 'obszar' w area (1) = 3
  assert.deepEqual(hits.map(h => h.roomId), [1, 10]);
  assert.equal(hits[0].score, 3);
});

test('id query scores 999 and wins over name hits', () => {
  const idx = buildSearchIndex(mkMap());
  const hits = searchIndexed(idx, '11');
  assert.equal(hits[0].roomId, 11);
  assert.equal(hits[0].score, 999);
});

test('parseInt quirk parity: "11abc" still id-matches room 11', () => {
  const idx = buildSearchIndex(mkMap());
  const hits = searchIndexed(idx, '11abc');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].roomId, 11);
  assert.equal(hits[0].score, 999);
});

test('unnamed room gets #id as display name', () => {
  const idx = buildSearchIndex(mkMap());
  const hits = searchIndexed(idx, '3');
  assert.equal(hits[0].name, '#3');
  assert.equal(hits[0].areaName, 'Obszar Testowy');
});

test('empty / no-match / null inputs fail closed', () => {
  const idx = buildSearchIndex(mkMap());
  assert.deepEqual(searchIndexed(idx, ''), []);
  assert.deepEqual(searchIndexed(idx, '   '), []);
  assert.deepEqual(searchIndexed(idx, 'nie ma takiego'), []);
  assert.deepEqual(searchIndexed(null, 'rynek'), []);
  assert.deepEqual(searchIndexed(idx, 'rynek karczma smokiem nieistnieje'), []);
});

test('limit: results cut at 25 by default, custom limit honored', () => {
  const rooms = [];
  for (let i = 1; i <= 40; i++) rooms.push({ id: i, x: i, y: 0, z: 0, name: 'Kopia Pokoju' });
  const idx = buildSearchIndex({ areas: [{ id: 1, name: 'A', rooms }] });
  assert.equal(searchIndexed(idx, 'kopia').length, 25);
  assert.equal(searchIndexed(idx, 'kopia', 5).length, 5);
});

test('determinism: identical input -> identical output, twice', () => {
  const idx = buildSearchIndex(mkMap());
  const a = JSON.stringify(searchIndexed(idx, 'rynek obszar'));
  const b = JSON.stringify(searchIndexed(buildSearchIndex(mkMap()), 'rynek obszar'));
  assert.equal(a, b);
});

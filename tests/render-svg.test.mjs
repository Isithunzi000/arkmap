// render-svg.test.mjs — true-vector SVG rendering: structure, determinism,
// escaping, scope filters, route overlays, markers, cross-area arrows,
// map labels; svgToPng/renderPng node guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSvg } from '../src/render-svg.js';
import { svgToPng, renderPng } from '../src/render-png.js';

function mkMap() {
  return {
    areas: [
      { id: 1, name: 'A1', rooms: [
        { id: 1, x: 0, y: 0, z: 0, env: 1, name: 'Pokoj <jeden> & "coś"', exits: { e: 2 } },
        { id: 2, x: 1, y: 0, z: 0, env: 2, name: 'Dwa', exits: { w: 1, n: 3 } },
        { id: 3, x: 1, y: 1, z: 1, env: 3 },
      ] },
      { id: 2, name: 'A2', rooms: [
        { id: 10, x: 5, y: 5, z: 0, env: 1 },
      ] },
    ],
  };
}

test('structure: svg header, background, deduped exits, room rects', () => {
  const svg = renderSvg(mkMap(), { areaId: 1, z: 0 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/);
  assert.ok(svg.endsWith('</svg>'));
  assert.equal((svg.match(/<rect /g) || []).length, 3);   // background + 2 rooms
  assert.equal((svg.match(/<line /g) || []).length, 2);   // 1<->2 dedup + stub n->3 (same area, other level — Studio parity: no arrow)
  assert.ok(svg.includes('<g stroke="#565e6b" stroke-width="0.14">'), 'exit group present');
  assert.ok(!svg.includes('<polygon'), 'no arrow for same-area cross-level exit');
});

test('exit dedup: shared edge emitted exactly once', () => {
  const svg = renderSvg(mkMap(), { areaId: 1, z: 0 });
  const full = svg.match(/<line x1="0" y1="0" x2="1" y2="0"\/>/g) || [];
  assert.equal(full.length, 1);
});

test('determinism: identical output on repeated renders', () => {
  const a = renderSvg(mkMap(), { areaId: 'all', z: null });
  const b = renderSvg(mkMap(), { areaId: 'all', z: null });
  assert.equal(a, b);
});

test('scope filters: areaId and z select disjoint room sets', () => {
  const all = renderSvg(mkMap());
  assert.equal((all.match(/<rect /g) || []).length, 5);   // bg + 4 rooms
  const z1 = renderSvg(mkMap(), { areaId: 1, z: 1 });
  assert.equal((z1.match(/<rect /g) || []).length, 2);    // bg + room 3
  const a2 = renderSvg(mkMap(), { areaId: 2, z: null });
  assert.equal((a2.match(/<rect /g) || []).length, 2);    // bg + room 10
  const empty = renderSvg(mkMap(), { areaId: 999 });
  assert.match(empty, /^<svg /);
  assert.ok(!empty.includes('<line'));
});

test('labels: room names escaped for XML', () => {
  const svg = renderSvg(mkMap(), { areaId: 1, z: 0, labels: true });
  assert.ok(svg.includes('Pokoj &lt;jeden&gt; &amp; &quot;coś&quot;'));
  assert.ok(!svg.includes('<jeden>'));
  const noLabels = renderSvg(mkMap(), { areaId: 1, z: 0 });
  assert.ok(!noLabels.includes('<text'));
});

test('routes: solid walking segments, dashed hop segments', () => {
  const svg = renderSvg(mkMap(), {
    areaId: 1, z: 0,
    routes: [{ path: [1, 2], hops: [{ name: 'ferry' }] }, { path: [2, 1] }],
  });
  const solid = svg.match(/stroke="#f87171"/g) || [];
  const dashed = svg.match(/stroke-dasharray="0.7 0.7" stroke="#fbbf24"/g) || [];
  assert.equal(solid.length, 1);    // 2->1 walking
  assert.equal(dashed.length, 1);   // 1->2 hop
});

test('routes: out-of-scope rooms are skipped segment-wise', () => {
  const svg = renderSvg(mkMap(), { areaId: 1, z: 0, routes: [{ path: [2, 3] }] });
  assert.ok(!svg.includes('stroke="#f87171"'));   // room 3 is z=1 — no segment
});

test('markers: ring + label on in-scope rooms only', () => {
  const svg = renderSvg(mkMap(), {
    areaId: 1, z: 0,
    markers: [{ id: 1, color: '#60a5fa', label: '1' }, { id: 3, color: '#f87171' }, { id: 999 }],
  });
  assert.match(svg, /stroke="#60a5fa" stroke-width="0.22"\/>/);
  assert.ok(svg.includes('>1</text>'));
  assert.ok(!svg.includes('#f87171'));   // room 3 out of scope — marker skipped
});

test('svgToPng: fails closed outside the browser', async () => {
  await assert.rejects(() => svgToPng('<svg/>'), /needs a browser/);
});

// --- cross-area arrows ------------------------------------------------------

function mkCrossMap() {
  return {
    areas: [
      { id: 1, name: 'Start', rooms: [
        { id: 1, x: 0, y: 0, z: 0, env: 1, exits: { e: 2, n: 10, s: 999 }, special_exits: { 'zejdz pod most': 20 } },
        { id: 2, x: 1, y: 0, z: 0, env: 1, exits: { w: 1 } },
      ] },
      { id: 2, name: 'Cel', rooms: [
        { id: 10, x: 0, y: 5, z: 0, env: 5 },
        { id: 20, x: 3, y: 3, z: 0, env: 2 },
      ] },
    ],
  };
}

test('cross-area exits: arrows with heads, env colors and area-name titles', () => {
  const svg = renderSvg(mkCrossMap(), { areaId: 1 });
  assert.equal((svg.match(/<polygon /g) || []).length, 2);        // exit n->10 + special ->20
  assert.ok(svg.includes('<title>Cel (#10)</title>'), 'normal exit arrow title');
  assert.ok(svg.includes('<title>Cel (#20)</title>'), 'special exit arrow title');
  assert.match(svg, /<g stroke="rgb\(\d+,\d+,\d+\)" fill="rgb\(/, 'arrow colored by target env');
});

test('cross-area arrows: unknown target stays a gray stub', () => {
  const svg = renderSvg(mkCrossMap(), { areaId: 1 });
  assert.ok(svg.includes('<g stroke="#565e6b" stroke-width="0.14">'), 'gray stub group present');
  assert.ok(!svg.includes('<title>area 999'), 'no arrow for unknown room');
  // exactly one gray stub (s->999); the in-scope 1<->2 line shares the group
  const grp = svg.split('<g stroke="#565e6b" stroke-width="0.14">')[1].split('</g>')[0];
  assert.equal((grp.match(/<line /g) || []).length, 2);
});

test('cross-area arrows: full scope renders plain lines, no arrows', () => {
  const svg = renderSvg(mkCrossMap(), { areaId: 'all', z: null });
  assert.ok(!svg.includes('<polygon'), 'no arrows when everything is in scope');
});

// --- map labels -------------------------------------------------------------

function mkLabelMap() {
  return {
    areas: [
      { id: 1, name: 'A1', rooms: [{ id: 1, x: 0, y: 0, z: 0, env: 1 }],
        labels: [
          { id: 1, x: -1, y: 2, z: 0, width: 6, height: 1.5, text: 'Rynek', fg_color: [255, 255, 50], bg_color: [0, 0, 0, 0] },
          { id: 2, x: -1, y: 4, z: 1, width: 4, height: 1.2, text: 'Pietro', fg_color: [10, 10, 10] },
          { id: 3, x: 0, y: 5, z: 0, width: 3, height: 2, pixmap: 'aGVsbG8=' },
          { id: 4, x: 0, y: 8, z: 0, width: 4, height: 1.2, text: 'Gora', show_on_top: true },
        ] },
    ],
  };
}

test('mapLabels: off by default, no label output', () => {
  const svg = renderSvg(mkLabelMap(), { areaId: 1 });
  assert.ok(!svg.includes('Rynek') && !svg.includes('<image'), 'labels require mapLabels: true');
});

test('mapLabels: text with fg color and outline; dark colors boosted', () => {
  const z0 = renderSvg(mkLabelMap(), { areaId: 1, z: 0, mapLabels: true });
  assert.ok(z0.includes('>Rynek</text>'));
  assert.ok(z0.includes('fill="rgb(255,255,50)"'), 'fg color applied');
  assert.ok(z0.includes('paint-order="stroke"'), 'readability outline');
  const z1 = renderSvg(mkLabelMap(), { areaId: 1, z: 1, mapLabels: true });
  assert.ok(z1.includes('>Pietro</text>'));
  assert.ok(z1.includes('fill="rgb(200,200,80)"'), 'dark fg boosted for readability');
  assert.ok(!z0.includes('Pietro') && !z1.includes('Rynek'), 'z filter both ways');
});

test('mapLabels: pixmap embedded as data URI image', () => {
  const svg = renderSvg(mkLabelMap(), { areaId: 1, z: 0, mapLabels: true });
  assert.ok(svg.includes('<image x="0" y="-5" width="3" height="2" href="data:image/png;base64,aGVsbG8="/>'));
});

test('mapLabels: show_on_top renders above the room rects', () => {
  const svg = renderSvg(mkLabelMap(), { areaId: 1, z: 0, mapLabels: true });
  const roomIdx = svg.indexOf('<rect x="-0.36"');
  const topIdx = svg.indexOf('>Gora</text>');
  assert.ok(roomIdx > -1 && topIdx > roomIdx, 'top label after rooms');
  const underIdx = svg.indexOf('>Rynek</text>');
  assert.ok(underIdx > -1 && underIdx < roomIdx, 'plain label under rooms');
});

test('renderPng: fails closed outside the browser', async () => {
  await assert.rejects(() => renderPng(mkMap(), {}), /needs a browser/);
});

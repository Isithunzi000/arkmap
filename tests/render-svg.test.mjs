// render-svg.test.mjs — true-vector SVG rendering: structure, determinism,
// escaping, scope filters, route overlays, markers; svgToPng node guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSvg } from '../src/render-svg.js';
import { svgToPng } from '../src/render-png.js';

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
  assert.equal((svg.match(/<line /g) || []).length, 2);   // 1<->2 dedup + stub n->3 (out of z scope)
  assert.ok(svg.includes('<g stroke="#565e6b" stroke-width="0.14">'), 'exit group present');
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

// render-svg.test.mjs — true-vector SVG rendering on the shared Studio-parity
// render model: structure, determinism, escaping, scope filters, exit lines
// (edge-to-edge, one-way dashed + head), custom lines / suppressors, doors,
// stubs, cross-area arrows, grid, room details (inner triangles, symbols, ✦),
// map labels, route overlays, markers; svgToPng/renderPng node guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSvg } from '../src/render-svg.js';
import { svgToPng, renderPng } from '../src/render-png.js';
import { ROOM_HALF, ROOM_UNITS, LINE_CSS, ONE_WAY_FILL, DOOR_CSS, CL_DEFAULT_CSS, CROSS_UNKNOWN_CSS } from '../src/render-model.js';

const fmt = (n) => { const r = Math.round(n * 100) / 100; return String(Object.is(r, -0) ? 0 : r); };

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

test('structure: svg header, background, room rects', () => {
  const svg = renderSvg(mkMap(), { areaId: 1, z: 0 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/);
  assert.ok(svg.endsWith('</svg>'));
  assert.equal((svg.match(/<rect /g) || []).length, 3);   // background + 2 rooms
  // Studio room: ROOM_UNITS square, LINE_CSS border
  assert.ok(svg.includes(`width="${fmt(ROOM_UNITS)}" height="${fmt(ROOM_UNITS)}"`), 'room size 0.65');
  assert.ok(svg.includes(`stroke="${LINE_CSS}" stroke-width="${fmt(0.4875 / 18)}"`), 'Studio room border');
});

test('exits: two-way edge-to-edge, emitted once; cross-level same-area = nothing', () => {
  const svg = renderSvg(mkMap(), { areaId: 1, z: 0 });
  const edge = `<line x1="${fmt(ROOM_HALF)}" y1="0" x2="${fmt(1 - ROOM_HALF)}" y2="0" stroke="${LINE_CSS}"`;
  assert.equal((svg.match(new RegExp(edge.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1, 'deduped edge-to-edge line');
  // 2 n-> 3 (same area, z=1 out of scope): Studio draws nothing for crossZ
  const exitLines = svg.match(new RegExp(`<line [^>]*stroke="${LINE_CSS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || [];
  assert.equal(exitLines.length, 1, 'only the 1<->2 line; nothing toward other level');
  assert.ok(!svg.includes('<polygon'), 'no arrow for same-area cross-level exit');
});

test('one-way exit: dashed line to target center + red head at midpoint', () => {
  const map = { areas: [{ id: 1, name: 'A', rooms: [
    { id: 1, x: 0, y: 0, z: 0, env: 1, exits: { s: 2 } },
    { id: 2, x: 0, y: -2, z: 0, env: 1, exits: {} },
  ] }] };
  const svg = renderSvg(map, { areaId: 1, z: 0 });
  assert.ok(svg.includes('stroke-dasharray="0.11 0.06"'), 'one-way dash [max(2,z*1.8), max(1,z*0.9)] px @ zoom 1');
  assert.ok(svg.includes(`fill="${ONE_WAY_FILL}" stroke="${LINE_CSS}"`), 'red head with light outline');
  // line ends at the target CENTER (0, 2 in screen coords)
  assert.ok(svg.includes('x2="0" y2="2"'), 'one-way aims at target center');
});

test('custom lines: polyline from room center, Studio dash styles; suppressor hides exit', () => {
  const map = { areas: [{ id: 1, name: 'A', rooms: [
    { id: 1, x: 0, y: 0, z: 0, env: 1,
      exits: { e: 2, w: 3 },
      special_exits: { 'wespnij sie': 4 },
      custom_lines: {
        e: { color: [255, 0, 0], style: 'dash', points: [[1, 0], [2, 1]] },
        w: { points: [] },
        'wespnij sie': { color: [255, 0, 0], style: 'dot', points: [[-1, 0]] },
      } },
    { id: 2, x: 2, y: 0, z: 0, env: 1, exits: { w: 1 } },
    { id: 3, x: -2, y: 0, z: 0, env: 1, exits: { e: 1 } },
    { id: 4, x: -5, y: 0, z: 0, env: 1 },
  ] }] };
  const svg = renderSvg(map, { areaId: 1, z: 0 });
  const polys = svg.match(/<polyline /g) || [];
  assert.equal(polys.length, 2, 'two custom lines (suppressor excluded)');
  assert.ok(svg.includes('<polyline points="0,0 1,0 2,-1"'), 'CL from room center, screen Y negated');
  assert.ok(svg.includes('stroke="rgb(255,0,0)"'), 'CL color from data');
  assert.ok(svg.includes('stroke-dasharray="0.44 0.22"'), 'dash style s=max(1,z*2) @ zoom 1');
  assert.ok(svg.includes('stroke-dasharray="0.11 0.11"'), 'dot style');
  // suppressor: exit 1.w has a custom line with empty points -> no w line at all
  assert.ok(!svg.includes(`x1="${fmt(-ROOM_HALF)}"`), 'suppressed exit not drawn');
  // default CL color when missing
  const map2 = { areas: [{ id: 1, rooms: [
    { id: 1, x: 0, y: 0, z: 0, env: 1, exits: { e: 2 }, custom_lines: { e: { points: [[2, 0]] } } },
    { id: 2, x: 3, y: 0, z: 0, env: 1, exits: { w: 1 } },
  ] }] };
  assert.ok(renderSvg(map2, { areaId: 1 }).includes(`stroke="${CL_DEFAULT_CSS}"`), 'default CL color #aaaaff');
});

test('doors: DOOR_RGB square at the exit midpoint (normal and custom lines)', () => {
  const map = { areas: [{ id: 1, rooms: [
    { id: 1, x: 0, y: 0, z: 0, env: 1, exits: { e: 2 }, doors: { e: 2 } },
    { id: 2, x: 2, y: 0, z: 0, env: 1, exits: { w: 1 } },
    { id: 3, x: 0, y: 3, z: 0, env: 1, exits: { s: 4 }, doors: { s: 1 }, custom_lines: { s: { points: [[0, 2]] } } },
    { id: 4, x: 0, y: 5, z: 0, env: 1 },
  ] }] };
  const svg = renderSvg(map, { areaId: 1, z: 0 });
  assert.ok(svg.includes(`stroke="${DOOR_CSS.closed}"`), 'closed door color on exit line');
  assert.ok(svg.includes(`stroke="${DOOR_CSS.open}"`), 'open door color on custom line');
  assert.ok(svg.includes(`width="${fmt(ROOM_UNITS / 2)}" height="${fmt(ROOM_UNITS / 2)}"`), 'door square side rs/2');
});

test('stubs: drawn from room.stubs data only', () => {
  const map = { areas: [{ id: 1, rooms: [
    { id: 1, x: 0, y: 0, z: 0, env: 1, stubs: ['n'] },
  ] }] };
  const svg = renderSvg(map, { areaId: 1, z: 0 });
  assert.ok(svg.includes(`<line x1="0" y1="${fmt(-ROOM_HALF)}" x2="0" y2="${fmt(-ROOM_HALF - 0.5)}" stroke="${LINE_CSS}"`), 'stub from edge, 0.5 units, up-screen');
});

test('cross-area exits: env-colored arrows; unknown target is orange', () => {
  const map = { areas: [
    { id: 1, name: 'Start', rooms: [{ id: 1, x: 0, y: 0, z: 0, env: 1, exits: { n: 10, s: 999 } }] },
    { id: 2, name: 'Cel', rooms: [{ id: 10, x: 0, y: 5, z: 0, env: 5 }] },
  ], colors: { custom_env_colors: { 5: [9, 8, 7] } } };
  const svg = renderSvg(map, { areaId: 1, z: 0 });
  assert.ok(svg.includes('<title>Cel (#10)</title>'), 'known target area title');
  assert.ok(svg.includes('stroke="rgb(9,8,7)"'), 'arrow colored by target env');
  assert.ok(svg.includes(`stroke="${CROSS_UNKNOWN_CSS}"`), 'unknown target orange');
  assert.ok(svg.includes('<title>unknown (#999)</title>'));
});

test('grid: world-aligned 1-unit grid at Studio alpha for zoom 1', () => {
  const svg = renderSvg(mkMap(), { areaId: 1, z: 0 });
  assert.ok(svg.includes('<g stroke="rgba(255,255,255,0.035)"'), 'grid group with zoom-1 alpha');
});

test('env -1 falls back to Studio DEFAULT_ROOM_RGB', () => {
  const map = { areas: [{ id: 1, rooms: [{ id: 1, x: 0, y: 0, z: 0, env: -1 }] }] };
  assert.ok(renderSvg(map, { areaId: 1 }).includes('fill="rgb(114,1,0)"'), 'unknown env = dark red, not gray');
});

test('room details: inner u/d/i/o triangles, symbol glyph, special-exit ✦', () => {
  const map = { areas: [{ id: 1, rooms: [
    { id: 1, x: 0, y: 0, z: 0, env: 2, exits: { up: 2 }, symbol: 'S', special_exits: { x: 9 } },
    { id: 2, x: 0, y: 1, z: 1, env: 2 },
  ] }] };
  const svg = renderSvg(map, { areaId: 1, z: 0 });
  assert.ok(svg.includes('<polygon'), 'inner triangle for up exit');
  assert.ok(svg.includes('rgba(225,255,255,0.6)'), 'triangle fill = symbolFill alpha 0.6');
  assert.ok(svg.includes('>S</text>'), 'symbol glyph rendered');
  assert.ok(svg.includes('>✦</text>'), 'special-exit marker rendered');
  // up/down never produce exit lines (grid lines use a different stroke)
  const exitLines2 = svg.match(new RegExp(`<line [^>]*stroke="${LINE_CSS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || [];
  assert.equal(exitLines2.length, 0, 'no exit lines for udio exits');
});

test('hidden rooms: faded alpha (default), dashed border variant n/a in static export', () => {
  const map = { areas: [{ id: 1, rooms: [
    { id: 1, x: 0, y: 0, z: 0, env: 1, user_data: { 'system.fallback_hidden': 'true' } },
  ] }] };
  const svg = renderSvg(map, { areaId: 1, z: 0 });
  assert.ok(svg.includes('opacity="0.35"'), 'hidden room faded');
});

test('determinism: identical output on repeated renders', () => {
  const a = renderSvg(mkMap(), { areaId: 'all', z: null });
  const b = renderSvg(mkMap(), { areaId: 'all', z: null });
  assert.equal(a, b);
});

test('scope filters: areaId and z select disjoint room sets', () => {
  const map = { areas: [
    { id: 1, rooms: [{ id: 1, x: 0, y: 0, z: 0, env: 1 }, { id: 2, x: 1, y: 0, z: 1, env: 1 }] },
    { id: 2, rooms: [{ id: 10, x: 5, y: 5, z: 0, env: 1 }] },
  ] };
  const all = renderSvg(map);
  assert.equal((all.match(/<rect /g) || []).length, 4);   // bg + 3 rooms
  const z1 = renderSvg(map, { areaId: 1, z: 1 });
  assert.equal((z1.match(/<rect /g) || []).length, 2);    // bg + room 2
  const a2 = renderSvg(map, { areaId: 2, z: null });
  assert.equal((a2.match(/<rect /g) || []).length, 2);    // bg + room 10
  const empty = renderSvg(map, { areaId: 999 });
  assert.match(empty, /^<svg /);
  assert.ok(!empty.includes('<line'));
});

test('labels: room names escaped for XML', () => {
  const svg = renderSvg(mkMap(), { areaId: 1, z: 0, labels: true });
  assert.ok(svg.includes('Pokoj &lt;jeden&gt; &amp; &quot;coś&quot;'));
  assert.ok(!svg.includes('<jeden>'));
  const noLabels = renderSvg(mkMap(), { areaId: 1, z: 0 });
  assert.ok(!noLabels.includes('Pokoj'));
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

test('markers: ring + label on in-scope rooms only', () => {
  const svg = renderSvg(mkMap(), {
    areaId: 1, z: 0,
    markers: [{ id: 1, color: '#60a5fa', label: '1' }, { id: 999 }],
  });
  assert.match(svg, /stroke="#60a5fa" stroke-width="0.22"\/>/);
  assert.ok(svg.includes('>1</text>'));
});

// --- map labels -------------------------------------------------------------

function mkLabelMap() {
  return {
    areas: [
      { id: 1, name: 'A1', rooms: [{ id: 1, x: 0, y: 0, z: 0, env: 1 }],
        labels: [
          { id: 1, x: -1, y: 2, z: 0, width: 6, height: 1.5, text: 'Rynek', fg_color: [255, 255, 50], bg_color: [0, 0, 0, 200] },
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

test('mapLabels: text with fg color and halo; dark colors boosted; NO bg rect (Studio parity)', () => {
  const z0 = renderSvg(mkLabelMap(), { areaId: 1, z: 0, mapLabels: true });
  assert.ok(z0.includes('>Rynek</text>'));
  assert.ok(z0.includes('fill="rgb(255,255,50)"'), 'fg color applied');
  assert.ok(z0.includes('paint-order="stroke"'), 'readability halo');
  assert.ok(!z0.includes('<rect x="-1" y="-2"'), 'Studio draws no label background rect');
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
  const roomIdx = svg.indexOf(`fill="${'rgb(0,0,0)'}`) > -1 ? svg.indexOf('width="0.65"') : svg.indexOf('width="0.65"');
  const topIdx = svg.indexOf('>Gora</text>');
  assert.ok(roomIdx > -1 && topIdx > roomIdx, 'top label after rooms');
  const underIdx = svg.indexOf('>Rynek</text>');
  assert.ok(underIdx > -1 && underIdx < roomIdx, 'plain label under rooms');
});

test('svgToPng / renderPng: fail closed outside the browser', async () => {
  await assert.rejects(() => svgToPng('<svg/>'), /needs a browser/);
  await assert.rejects(() => renderPng(mkMap(), {}), /needs a browser/);
});

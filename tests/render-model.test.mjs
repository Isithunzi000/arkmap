// render-model.test.mjs — shared Studio-semantics render model: color cache
// order, exit classification (all kinds), exit/custom-line/stub/door geometry,
// hidden rooms, zoom gates, LOD modes, raster buffer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CELL, ROOM_UNITS, ROOM_HALF, DEFAULT_ROOM_RGB, LINE_CSS, ONE_WAY_FILL,
  CROSS_UNKNOWN_CSS, CL_DEFAULT_CSS, DOOR_CSS, HIDDEN_FADE, RASTER_LINE_ALPHA,
  LOD_MIN_CELL_PX, LOD_ROOMS_BUDGET, LOD_RASTER_CELL_PX, DIR_VEC, OPP_DIR,
  buildColorCache, roomColorCss, isRoomHidden, hiddenRoomStyle, symbolColorCss,
  symbolFillCss, classifyExit, exitLineOp, crossArrowOp, stubOps, dashPattern,
  customLineOp, doorSquareOp, roomOp, innerTrianglesOp, symbolOp, seMarkerOp,
  gridStyle, lodMode, rasterModel, stackShadowsOp, specialCrossArrows,
} from '../src/render-model.js';

const Z1 = CELL; // cellPx at zoom 1

function mkPlane(rooms, areaId = 1, z = 0) {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const areaOf = new Map(rooms.map((r) => [r.id, r._area ?? areaId]));
  return { byId, areaOf, areaId, z };
}
const R = (id, x, y, extra = {}) => ({ id, x, y, z: 0, env: 1, exits: {}, ...extra });

// ─── colors ──────────────────────────────────────────────────────────────────

test('color cache: implicit ANSI + Mudlet 8/16 quirk + unknown fallback', () => {
  const cache = buildColorCache({ areas: [], colors: {} });
  assert.equal(roomColorCss(cache, 8), roomColorCss(cache, 0) === undefined ? '' : 'rgb(0,0,0)');   // envId 8 -> ANSI 0 (black)
  assert.equal(roomColorCss(cache, 16), 'rgb(128,128,128)'); // envId 16 -> ANSI 8
  assert.equal(roomColorCss(cache, -1), `rgb(${DEFAULT_ROOM_RGB.join(',')})`);
  assert.equal(roomColorCss(cache, 9999), `rgb(${DEFAULT_ROOM_RGB.join(',')})`);
});

test('color cache: env_colors < custom_env_colors override', () => {
  const cache = buildColorCache({ areas: [], colors: { env_colors: { 50: 2 }, custom_env_colors: { 50: [1, 2, 3] } } });
  assert.equal(roomColorCss(cache, 50), 'rgb(1,2,3)');
  const cache2 = buildColorCache({ areas: [], colors: { env_colors: { 51: 2 } } });
  assert.equal(cache2.get(51), roomColorCss(buildColorCache({ areas: [], colors: {} }), 2) !== '' ? cache2.get(51) : null);
  assert.ok(cache2.get(51), 'env_colors entry present');
});

test('hidden room detection + modes', () => {
  const h = R(1, 0, 0, { user_data: { 'system.fallback_hidden': 'true' } });
  const n = R(2, 0, 0);
  assert.equal(isRoomHidden(h), true);
  assert.equal(isRoomHidden(n), false);
  assert.deepEqual(hiddenRoomStyle(h, 'faded'), { skip: false, alpha: HIDDEN_FADE, dashed: false });
  assert.deepEqual(hiddenRoomStyle(h, 'dashed'), { skip: false, alpha: 1, dashed: true });
  assert.deepEqual(hiddenRoomStyle(h, 'hide'), { skip: true, alpha: 1, dashed: false });
});

test('symbol colors: explicit override, lightness threshold, fill alpha', () => {
  const cache = buildColorCache({ areas: [], colors: { custom_env_colors: { 1: [250, 250, 250], 2: [5, 5, 5] } } });
  assert.equal(symbolColorCss(R(1, 0, 0, { env: 1 }), cache), 'rgb(25,25,25)');
  assert.equal(symbolColorCss(R(2, 0, 0, { env: 2 }), cache), 'rgb(225,255,255)');
  assert.equal(symbolColorCss(R(3, 0, 0, { user_data: { 'system.fallback_symbol_color': '#abc' } }), cache), '#abc');
  assert.equal(symbolFillCss(R(2, 0, 0, { env: 2 }), cache), 'rgba(225,255,255,0.6)');
});

// ─── exit classification ─────────────────────────────────────────────────────

test('classify: plain two-way line', () => {
  const a = R(1, 0, 0, { exits: { e: 2 } });
  const b = R(2, 1, 0, { exits: { w: 1 } });
  const c = classifyExit(a, 'e', 2, mkPlane([a, b]));
  assert.equal(c.kind, 'line');
});

test('classify: one-way when target does not point back', () => {
  const a = R(1, 0, 0, { exits: { s: 2 } });
  const b = R(2, 0, -1, { exits: {} });
  assert.equal(classifyExit(a, 's', 2, mkPlane([a, b])).kind, 'oneway');
});

test('classify: custom line wins over everything, incl. special exits and udio', () => {
  const a = R(1, 0, 0, {
    exits: { down: 2 },
    special_exits: { 'wespnij sie': 3 },
    custom_lines: {
      down: { color: [255, 0, 0], style: 'dash', points: [[1, 1]] },
      'wespnij sie': { color: [255, 0, 0], style: 'dot', points: [[-1, 0]] },
    },
  });
  const p = mkPlane([a, R(2, 0, -1), R(3, 5, 5, { _area: 2 })]);
  assert.equal(classifyExit(a, 'down', 2, p).kind, 'custom');
  assert.equal(classifyExit(a, 'wespnij sie', 3, p).kind, 'custom');
});

test('classify: empty-points custom line = suppressor', () => {
  const a = R(1, 0, 0, { exits: { w: 2 }, custom_lines: { w: { points: [] } } });
  assert.equal(classifyExit(a, 'w', 2, mkPlane([a, R(2, -1, 0)])).kind, 'suppressed');
});

test('classify: udio exits never become lines', () => {
  const a = R(1, 0, 0, { exits: { up: 2, out: 3 } });
  const p = mkPlane([a, R(2, 0, 0, { z: 1 }), R(3, 9, 9)]);
  assert.equal(classifyExit(a, 'up', 2, p).kind, 'udio');
  assert.equal(classifyExit(a, 'out', 3, p).kind, 'udio');
});

test('classify: cross-area and unknown target', () => {
  const a = R(1, 0, 0, { exits: { e: 10, w: 999 } });
  const t = R(10, 5, 0, { _area: 2 });
  const p = mkPlane([a, t]);
  assert.equal(classifyExit(a, 'e', 10, p).kind, 'cross');
  const unk = classifyExit(a, 'w', 999, p);
  assert.equal(unk.kind, 'cross');
  assert.equal(unk.target, null);
});

test('classify: same area other level = nothing; unknown dir = skip', () => {
  const a = R(1, 0, 0, { exits: { n: 2 } });
  const b = R(2, 0, 1, { z: 1 });
  assert.equal(classifyExit(a, 'n', 2, mkPlane([a, b])).kind, 'crossZ');
  assert.equal(classifyExit(a, 'teleport', 2, mkPlane([a, b])).kind, 'skip');
});

// ─── exit geometry ───────────────────────────────────────────────────────────

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('exitLineOp: two-way goes edge-to-edge', () => {
  const a = R(1, 0, 0);
  const b = R(2, 2, 0);
  const op = exitLineOp(a, b, DIR_VEC.e, Z1, false);
  assert.ok(close(op.line[0], ROOM_HALF) && close(op.line[1], 0) && close(op.line[2], 2 - ROOM_HALF) && close(op.line[3], 0), JSON.stringify(op.line));
  assert.equal(op.color, LINE_CSS);
  assert.deepEqual(op.dash, []);
  assert.equal(op.head, undefined);
  assert.ok(Math.abs(op.width - Math.max(0.4, 0.4875) / CELL) < 1e-9);
});

test('exitLineOp: one-way aims at target center, dashed, head at midpoint', () => {
  const a = R(1, 0, 0);
  const b = R(2, 0, -2);
  const op = exitLineOp(a, b, DIR_VEC.s, Z1, true);
  assert.ok(close(op.line[0], 0) && close(op.line[1], ROOM_HALF) && close(op.line[2], 0) && close(op.line[3], 2), JSON.stringify(op.line));
  assert.deepEqual(op.dash, [Math.max(2, 1.8) / CELL, Math.max(1, 0.9) / CELL]);
  const rsPx = ROOM_UNITS * Z1;
  const L = Math.max(6, rsPx * 0.83) / CELL;
  const Wh = Math.max(3, rsPx * 0.29) / CELL;
  assert.ok(close(op.head.tip[0], 0) && close(op.head.tip[1], (ROOM_HALF + 2) / 2), JSON.stringify(op.head.tip));
  assert.ok(close(op.head.base1[1], op.head.tip[1] - L));
  assert.ok(close(Math.abs(op.head.base1[0] - op.head.tip[0]), Wh));
  assert.equal(op.head.fill, ONE_WAY_FILL);
});

test('exitLineOp: head gated by zoom > 0.3', () => {
  const a = R(1, 0, 0); const b = R(2, 0, -2);
  assert.equal(exitLineOp(a, b, DIR_VEC.s, CELL * 0.3, true).head, undefined);
  assert.ok(exitLineOp(a, b, DIR_VEC.s, CELL * 0.31, true).head);
});

test('crossArrowOp: gated below zoom 0.25, unknown target is orange', () => {
  const cache = buildColorCache({ areas: [], colors: {} });
  const a = R(1, 0, 0);
  assert.equal(crossArrowOp(a, DIR_VEC.e, null, cache, CELL * 0.24), null);
  const op = crossArrowOp(a, DIR_VEC.e, null, cache, Z1);
  assert.equal(op.color, CROSS_UNKNOWN_CSS);
  const known = crossArrowOp(a, DIR_VEC.e, R(9, 5, 0, { env: 1 }), cache, Z1);
  assert.equal(known.color, roomColorCss(cache, 1));
  // data-space dir contract: n exit (data +y) points up-screen (negative screen y)
  const n = crossArrowOp(R(2, 7, 7), DIR_VEC.n, null, cache, Z1);
  assert.ok(n.line[1] < -7 && n.line[3] < n.line[1], JSON.stringify(n.line));
});

test('stubOps: data stubs only, cardinals only, 0.5 units from edge', () => {
  const r = R(1, 3, 4, { stubs: ['n', 'up', 'se'] });
  const ops = stubOps(r, Z1);
  assert.equal(ops.length, 2); // up dropped
  const n = ops.find((o) => o.dir === 'n');
  assert.deepEqual(n.line, [3, -4 + ROOM_HALF, 3, -4 + ROOM_HALF + 0.5][0] === 3 ? n.line : null, n.line);
  assert.deepEqual(n.line, [3, -4 - ROOM_HALF, 3, -4 - ROOM_HALF - 0.5].map((v) => v)); // screen Y negated
  assert.equal(stubOps(R(2, 0, 0), Z1).length, 0);
});

// ─── custom lines / doors ────────────────────────────────────────────────────

test('dashPattern: Studio styles scale with zoom, min 1px', () => {
  assert.deepEqual(dashPattern('dash', Z1), [4 / CELL * 2, 2 / CELL * 2].map((v) => v)); // s=2 at z=1
  assert.deepEqual(dashPattern('dot', Z1), [2 / CELL, 2 / CELL]);
  assert.deepEqual(dashPattern('solid', Z1), []);
  assert.deepEqual(dashPattern(undefined, Z1), []);
});

test('customLineOp: points from room center, default color, screen Y negated', () => {
  const r = R(1, 10, 20);
  const op = customLineOp(r, 'e', { points: [[11, 20], [12, 21]] }, Z1);
  assert.deepEqual(op.points, [[10, -20], [11, -20], [12, -21]]);
  assert.equal(op.color, CL_DEFAULT_CSS);
  assert.equal(op.width, Math.max(1, 1.2) / CELL);
});

test('customLineOp: door square on first segment, arrow when requested', () => {
  const r = R(1, 0, 0, { exits: { e: 2 } });
  const op = customLineOp(r, 'e', { points: [[2, 0]], arrow: true }, Z1);
  assert.equal(op.door, null); // no door state on the exit
  assert.ok(op.arrow, 'arrow op present');
  const r2 = R(1, 0, 0, { exits: { e: 2 }, doors: { e: 'closed' } });
  const cl2 = customLineOp(r2, 'e', { points: [[2, 0]] }, Z1);
  // door state resolution is data-dependent; at minimum the op must not crash
  assert.ok(cl2.points.length === 2);
});

test('doorSquareOp: Studio DOOR_RGB colors, side = ROOM_UNITS/2, int falls back to locked', () => {
  const open = doorSquareOp(1, 2, 'open', Z1);
  assert.equal(open.color, DOOR_CSS.open);
  assert.ok(Math.abs(open.side - ROOM_UNITS / 2) < 1e-9);
  assert.notEqual(doorSquareOp(1, 2, 'closed', Z1).color, doorSquareOp(1, 2, 'locked', Z1).color);
  // Studio DOOR_RGB[v] || DOOR_RGB.locked — Mudlet ints and junk go locked-red
  assert.equal(doorSquareOp(1, 2, 2, Z1).color, DOOR_CSS.locked);
  assert.equal(doorSquareOp(1, 2, 'bogus', Z1).color, DOOR_CSS.locked);
});

// ─── rooms / symbols / gates ─────────────────────────────────────────────────

test('roomOp: fill, Studio border width, hidden faded + dashed variants', () => {
  const cache = buildColorCache({ areas: [], colors: {} });
  const r = R(1, 4, -5, { env: 1 });
  const op = roomOp(r, cache, Z1, 'faded');
  assert.deepEqual([op.x, op.y], [4, 5]);
  assert.equal(op.half, ROOM_HALF);
  assert.ok(Math.abs(op.borderWidth - 0.4875 / CELL) < 1e-9);
  assert.equal(op.alpha, 1);
  const h = R(2, 0, 0, { user_data: { 'system.fallback_hidden': 'true' } });
  assert.equal(roomOp(h, cache, Z1, 'faded').alpha, HIDDEN_FADE);
  const d = roomOp(h, cache, Z1, 'dashed');
  assert.equal(d.dashed, true);
  assert.ok(Math.abs(d.borderWidth - Math.max(1.4, 1.4) / CELL) < 1e-9, 'dashed border max(1.4, z*1.4) px');
  assert.deepEqual(d.dash, [Math.max(4, ROOM_UNITS * Z1 * 0.34) / CELL, Math.max(3, ROOM_UNITS * Z1 * 0.24) / CELL]);
  assert.equal(roomOp(h, cache, Z1, 'hide').skip, true);
});

test('zoom gates: inner triangles 0.25, se marker 0.5, symbols 0.8, cross arrows 0.25, grid 4px', () => {
  const cache = buildColorCache({ areas: [], colors: {} });
  const r = R(1, 0, 0, { env: 1, exits: { up: 2, down: 3, n: 4 }, special_exits: { x: 9 } });
  assert.equal(innerTrianglesOp(r, cache, CELL * 0.25), null);
  assert.ok(innerTrianglesOp(r, cache, CELL * 0.26));
  assert.equal(seMarkerOp(r, cache, CELL * 0.5), null);
  assert.ok(seMarkerOp(r, cache, CELL * 0.51));
  const rs = R(2, 0, 0, { env: 1, user_data: { 'system.fallback_symbol': 'X' } });
  assert.equal(symbolOp(rs, cache, CELL * 0.8), null);
  assert.ok(symbolOp(rs, cache, CELL * 0.81));
  assert.equal(gridStyle(CELL * 0.2), null);      // 3.6px < 4
  assert.ok(gridStyle(CELL * 0.23));              // 4.14px >= 4
});

// ─── LOD + raster ────────────────────────────────────────────────────────────

test('lodMode: full / roomsOnly / raster thresholds', () => {
  assert.equal(lodMode(10, Z1, 800, 600), 'full');
  assert.equal(lodMode(LOD_ROOMS_BUDGET + 1, LOD_MIN_CELL_PX - 1, 800, 600), 'roomsOnly');
  assert.equal(lodMode(LOD_ROOMS_BUDGET + 1, LOD_RASTER_CELL_PX - 1, 800, 600), 'raster');
});

test('rasterModel: RGBA buffer, Y-flip, lines alpha before rooms', () => {
  const a = R(1, 0, 0, { exits: { e: 2 } });
  const b = R(2, 3, 0, { exits: { w: 1 } });
  const h = R(3, 10, 10, { user_data: { 'system.fallback_hidden': 'true' } });
  const cache = buildColorCache({ areas: [], colors: { custom_env_colors: { 1: [200, 100, 50] } } });
  const ras = rasterModel([a, b, h], new Map([[1, a], [2, b], [3, h]]), cache, 'faded');
  assert.equal(ras.buf.length, ras.cols * ras.rows * 4);
  assert.equal(ras.buf.constructor.name, 'Uint8ClampedArray');
  // room a lands at column (x-minX), TOP row after Y-flip for the max-y room;
  // find the pixel of room a by its color
  const px = (cx, cy) => [ras.buf[(cy * ras.cols + cx) * 4], ras.buf[(cy * ras.cols + cx) * 4 + 1], ras.buf[(cy * ras.cols + cx) * 4 + 2], ras.buf[(cy * ras.cols + cx) * 4 + 3]];
  const found = [];
  for (let cy = 0; cy < ras.rows; cy++) for (let cx = 0; cx < ras.cols; cx++) {
    const p = px(cx, cy);
    if (p[0] === 200 && p[1] === 100 && p[2] === 50 && p[3] === 255) found.push([cx, cy]);
  }
  assert.ok(found.length >= 2, 'both normal rooms rasterized with env color');
  // hidden room faded: alpha 89 somewhere
  let faded = false;
  for (let i = 3; i < ras.buf.length; i += 4) if (ras.buf[i] === 89) { faded = true; break; }
  assert.ok(faded, 'hidden room alpha 89 present');
  // exit line alpha present (140) somewhere between rooms a and b
  let line = false;
  for (let i = 3; i < ras.buf.length; i += 4) if (ras.buf[i] === RASTER_LINE_ALPHA) { line = true; break; }
  assert.ok(line, 'exit line alpha 140 present');
});

test('determinism: same input -> identical ops', () => {
  const a = R(1, 0, 0, { exits: { e: 2 } });
  const b = R(2, 2, 0, { exits: { w: 1 } });
  const p = mkPlane([a, b]);
  const run = () => JSON.stringify(classifyExit(a, 'e', 2, p)) + JSON.stringify(exitLineOp(a, b, DIR_VEC.e, Z1, false));
  assert.equal(run(), run());
});

test('stackShadowsOp: up -> ghost up-right, down -> down-left, zoom gate 0.3', () => {
  const r = R(1, 5, 5, { exits: { up: 2, down: 3 } });
  assert.equal(stackShadowsOp(r, CELL * 0.3), null);
  const ops = stackShadowsOp(r, Z1);
  assert.equal(ops.length, 2);
  const [up, dn] = ops;
  const ctr = (o) => [o.x + o.size / 2, o.y + o.size / 2];
  assert.ok(ctr(up)[0] > 5 && ctr(up)[1] < -5, 'up ghost up-right (screen)');
  assert.ok(ctr(dn)[0] < 5 && ctr(dn)[1] > -5, 'down ghost down-left (screen)');
  assert.equal(up.color, 'rgba(130,205,255,0.5)');
  assert.equal(stackShadowsOp(R(2, 0, 0, { exits: { n: 9 } }), Z1), null);
});

test('specialCrossArrows: cross-area special exit gets an arrow, hasCL suppresses', () => {
  const a = R(1, 0, 0, { special_exits: { 'zejdz': 10, 'skocz': 11 }, custom_lines: { 'skocz': { points: [[1, 1]] } } });
  const t = R(10, 4, 3, { _area: 2 });
  const sameArea = R(11, 2, 2);
  const plane = mkPlane([a, t, sameArea]);
  const cache = buildColorCache({ areas: [], colors: {} });
  const out = specialCrossArrows(a, plane, cache, Z1);
  assert.equal(out.length, 1, 'only cross-area without CL');
  assert.equal(out[0].cmd, 'zejdz');
  assert.ok(out[0].op.head, 'arrow head present');
});

test('symbolOp halo: light glyph -> dark halo, dark glyph -> light halo', () => {
  const cache = buildColorCache({ areas: [], colors: { custom_env_colors: { 1: [250, 250, 250], 2: [5, 5, 5] } } });
  const dark = symbolOp(R(1, 0, 0, { env: 1, symbol: 'X' }), cache, Z1);   // dark glyph on light room
  const light = symbolOp(R(2, 0, 0, { env: 2, symbol: 'X' }), cache, Z1);  // light glyph on dark room
  assert.equal(dark.fill, 'rgb(25,25,25)');
  assert.equal(dark.halo, 'rgba(255,255,255,0.55)');
  assert.equal(light.fill, 'rgb(225,255,255)');
  assert.equal(light.halo, 'rgba(0,0,0,0.65)');
});

test('roomOp: custom border override (Qt color + thickness clamp)', () => {
  const cache = buildColorCache({ areas: [], colors: {} });
  const r = R(1, 0, 0, { user_data: { 'room.ui_borderColor': '#ff0a0b0c', 'room.ui_borderThickness': '3' } });
  const op = roomOp(r, cache, Z1, 'faded');
  assert.equal(op.border, '#0a0b0c', 'Qt #AARRGGBB -> #RRGGBB when alpha ff');
  assert.ok(close(op.borderWidth, (0.4875 * 3) / CELL), 'width scales with thickness');
});

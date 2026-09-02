// render-model.js — ArkMap Studio map-rendering semantics as pure data.
//
// Hand-written module (not extracted from the standalone app). Implements the
// exact semantics of the Studio canvas renderer (drawExits / drawStubs /
// drawCustomLines / drawCLArrow / drawRooms / drawGrid / computeLodMode /
// _buildRoomsRaster, arkmap_studio.html @ 24bd902) as pure functions returning
// plain data in MAP UNITS (screen Y = negated data Y), so both render-svg.js
// (static vector export) and the demo viewer (interactive canvas) draw the
// same picture. Edit-mode-only Studio features (pending exits, selection
// halos, drag ghosts, CL drawing) are intentionally out of scope.
//
// Studio measures most things in screen px via cellPx = CELL * zoom; every
// formula here takes cellPx (px per map unit) and returns map units, so the
// output matches Studio at any zoom. For static export (SVG) pass
// cellPx = CELL (Studio zoom 1) and include every detail layer.
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// plain function/const declarations, single-line imports, one-line export list.

import { isArkadiaMap, ARKADIA_ENVS } from './arkadia.js';
import { ANSI_PAL } from './ansi-pal.js';

const CELL = 18;
const ROOM_UNITS = 0.65;                 // Studio ROOM_SIZE — room full size in map units
const ROOM_HALF = ROOM_UNITS / 2;        // 0.325
const DEFAULT_ROOM_RGB = [114, 1, 0];    // Studio DEFAULT_ROOM_RGB (unknown env)
const LINE_CSS = 'rgb(225,225,225)';
const ONE_WAY_FILL = 'rgb(155,10,10)';
const CROSS_UNKNOWN_CSS = '#ff9f4a';
const CL_DEFAULT_CSS = '#aaaaff';
// Door states in map data are ints (1 open, 2 closed, 3 locked); string keys
// accepted too. Colors mirror Studio DOOR_RGB.
const DOOR_CSS = {
  1: 'rgb(10,155,10)', 2: 'rgb(226,205,59)', 3: 'rgb(155,10,10)',
  open: 'rgb(10,155,10)', closed: 'rgb(226,205,59)', locked: 'rgb(155,10,10)',
};
const HIDDEN_FADE = 0.35;                // Studio HIDDEN_ROOM_FADE
const RASTER_LINE_ALPHA = 140;           // Studio _buildRoomsRaster exit-line alpha
const LOD_MIN_CELL_PX = 9;
const LOD_ROOMS_BUDGET = 200;
const LOD_RASTER_CELL_PX = 3;
const DIR_VEC = { n: [0, 1], ne: [1, 1], e: [1, 0], se: [1, -1], s: [0, -1], sw: [-1, -1], w: [-1, 0], nw: [-1, 1], up: [0, 0], down: [0, 0], in: [0, 0], out: [0, 0] };
const OPP_DIR = { n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e', nw: 'se' };
const UDIO_DIRS = ['up', 'down', 'in', 'out'];

function _css(rgb) { return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; }
function _u(px, cellPx) { return px / cellPx; }   // Studio screen px -> map units
// Studio clamps the room square to a 2px minimum: rs = max(2, ROOM_SIZE*cpx()).
// Every room-size-derived measure (edges, heads, doors, triangles, symbols,
// stubs) uses the clamped rs. Inactive at cellPx >= ~3.08.
function _rsPx(cellPx) { return Math.max(2, ROOM_UNITS * cellPx); }
function _rsUnits(cellPx) { return _rsPx(cellPx) / cellPx; }
// Studio _qtColorToCss (8117): Mudlet stores Qt #AARRGGBB, CSS reads #RRGGBBAA.
function _qtCss(value) {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{6})$/.exec(String(value).trim());
  if (!m) return value;
  return m[1].toLowerCase() === 'ff' ? ('#' + m[2]) : ('#' + m[2] + m[1]);
}

// ─── colors ─────────────────────────────────────────────────────────────────
// Studio buildColorCache (7221-7241): implicit ANSI 1-255 (Mudlet offset
// envId 8 -> ANSI 0, 16 -> ANSI 8) < ARKADIA_ENVS (Arkadia maps only)
// < env_colors (file) < custom_env_colors (file). Unknown env -> DEFAULT_ROOM_RGB.
function buildColorCache(map) {
  const cache = new Map();
  for (let eid = 1; eid <= 255; eid++) {
    const ansiIdx = eid === 8 ? 0 : eid === 16 ? 8 : eid;
    const rgb = ANSI_PAL[ansiIdx];
    if (rgb) cache.set(eid, _css(rgb));
  }
  if (isArkadiaMap(map, null)) {
    for (const [k, info] of Object.entries(ARKADIA_ENVS)) {
      if (info.rgb) cache.set(+k, _css(info.rgb));
    }
  }
  const colors = map?.colors || {};
  for (const [k, ansiIdx] of Object.entries(colors.env_colors || {})) {
    const rgb = ANSI_PAL[ansiIdx];
    if (rgb) cache.set(+k, _css(rgb));
  }
  for (const [k, v] of Object.entries(colors.custom_env_colors || {})) {
    cache.set(+k, _css(v));
  }
  return cache;
}

function roomColorCss(cache, env) {
  return cache.get(env) || _css(DEFAULT_ROOM_RGB);
}

function roomColorRgb(cache, env) {
  const css = roomColorCss(cache, env);
  const m = css.match(/\d+/g);
  return m ? [+m[0], +m[1], +m[2]] : [...DEFAULT_ROOM_RGB];
}

// Studio isRoomHidden (8139): user_data['system.fallback_hidden'] === 'true'
function isRoomHidden(room) {
  const v = room?.user_data?.['system.fallback_hidden'];
  return typeof v === 'string' && v.toLowerCase() === 'true';
}

// hiddenMode: 'faded' (Studio default) | 'dashed' | 'hide'
function hiddenRoomStyle(room, hiddenMode) {
  const mode = hiddenMode || 'faded';
  if (!isRoomHidden(room)) return { skip: false, alpha: 1, dashed: false };
  if (mode === 'hide') return { skip: true, alpha: 1, dashed: false };
  if (mode === 'dashed') return { skip: false, alpha: 1, dashed: true };
  return { skip: false, alpha: HIDDEN_FADE, dashed: false };
}

// Studio contrastColor (7305)
function contrastCss(cssColor) {
  let r = 0, g = 0, b = 0;
  const mRgb = String(cssColor).match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  const mHex = String(cssColor).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (mRgb) { r = +mRgb[1]; g = +mRgb[2]; b = +mRgb[3]; }
  else if (mHex) { r = parseInt(mHex[1], 16); g = parseInt(mHex[2], 16); b = parseInt(mHex[3], 16); }
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 140 ? '#111' : '#fff';
}

// Studio symbolColorFor (7321): explicit user_data override, else lightness
// (max+min)/2 of the room color > 0.41 -> dark glyph on light room
function symbolColorCss(room, cache) {
  const explicit = room?.user_data?.['system.fallback_symbol_color'];
  if (explicit) return explicit;
  const m = roomColorCss(cache, room?.env).match(/\d+/g);
  let rr = 0, gg = 0, bb = 0;
  if (m) { rr = +m[0]; gg = +m[1]; bb = +m[2]; }
  const light = (Math.max(rr, gg, bb) / 255 + Math.min(rr, gg, bb) / 255) / 2;
  return light > 0.41 ? 'rgb(25,25,25)' : 'rgb(225,255,255)';
}

// Studio symbolFillFor (7330): symbolColor with alpha 0.6 (inner exit triangles)
function symbolFillCss(room, cache) {
  const c = symbolColorCss(room, cache);
  const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},0.6)` : c;
}

// ─── exit classification ────────────────────────────────────────────────────
// plane: { byId: Map(id->room), areaOf: Map(id->areaId), areaId, z }
// Studio drawExits order (8418-8452), edit preview removed:
//   custom_lines[dir] wins first (drawCustomLines draws it for ANY dir,
//   including up/down and special exits; empty points = suppressor -> nothing),
//   then up/down/in/out never become lines, then cross-area/unknown target,
//   then same-area-other-Z (nothing), else a same-plane line (one-way when the
//   target does not point back through the opposite direction).
function classifyExit(room, dir, targetId, plane) {
  const vec = DIR_VEC[dir];
  const cl = room.custom_lines?.[dir] || null;
  const t = plane.byId.get(targetId) || null;
  if (cl) {
    return (cl.points && cl.points.length)
      ? { kind: 'custom', dir, targetId, cl, target: t }
      : { kind: 'suppressed', dir, targetId, target: t };
  }
  if (!vec) return { kind: 'skip', dir, targetId };
  if (!vec[0] && !vec[1]) return { kind: 'udio', dir, targetId, target: t };
  const sameArea = t ? plane.areaOf.get(targetId) === plane.areaId : false;
  if (!sameArea || !t) return { kind: 'cross', dir, targetId, vec, target: t };
  const sameZ = (t.z ?? 0) === plane.z;
  if (!sameZ) return { kind: 'crossZ', dir, targetId, target: t };
  const oneWay = !t.exits || t.exits[OPP_DIR[dir]] !== room.id;
  return { kind: oneWay ? 'oneway' : 'line', dir, targetId, vec, target: t };
}

// Studio edgePt (8361): cardinals edge-midpoint, diagonals corner.
// Screen coords: cx = room.x, cy = -room.y, screen vec = [vec[0], -vec[1]].
function edgePoint(cx, cy, half, svec) {
  return [cx + svec[0] * half, cy + svec[1] * half];
}

// Studio exit line width: max(0.4, zoom*0.4875) px, zoom = cellPx/CELL
function lineWidthUnits(cellPx) {
  return _u(Math.max(0.4, (cellPx / CELL) * 0.4875), cellPx);
}

// Same-plane exit: { line } edge-to-edge; one-way adds dash + arrowhead.
// Studio (8452-8496): one-way aims at the target CENTER, dashed
// [max(2,z*1.8), max(1,z*0.9)], head at the line midpoint, L=max(6,rs*0.83),
// halfW=max(3,rs*0.29), fill ONE_WAY_FILL with LINE_CSS outline, head gated
// by zoom > 0.3 (line stays dashed below it).
function exitLineOp(room, target, vec, cellPx, oneWay) {
  const svec = [vec[0], -vec[1]];   // data-space dir -> screen (Y negated)
  const half = _rsUnits(cellPx) / 2;
  const [x1, y1] = edgePoint(room.x, -room.y, half, svec);
  let x2, y2;
  if (oneWay) { x2 = target.x; y2 = -target.y; }
  else { const p = edgePoint(target.x, -target.y, half, [-svec[0], -svec[1]]); x2 = p[0]; y2 = p[1]; }
  const op = { line: [x1, y1, x2, y2], width: lineWidthUnits(cellPx), color: LINE_CSS, dash: [] };
  if (!oneWay) return op;
  const z = cellPx / CELL;
  op.dash = [_u(Math.max(2, z * 1.8), cellPx), _u(Math.max(1, z * 0.9), cellPx)];
  if (z > 0.3) {
    const rsPx = _rsPx(cellPx);
    const L = _u(Math.max(6, rsPx * 0.83), cellPx);
    const Wh = _u(Math.max(3, rsPx * 0.29), cellPx);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const nx = -uy, ny = ux;
    const bx = mx - ux * L, by = my - uy * L;
    op.head = { tip: [mx, my], base1: [bx + nx * Wh, by + ny * Wh], base2: [bx - nx * Wh, by - ny * Wh], fill: ONE_WAY_FILL, outline: LINE_CSS };
  }
  return op;
}

// Studio drawCrossAreaArrows (8636-8667): from the room edge along the dir
// vector, tickLen = max(4, rs*0.9) px, width max(1, zoom) px, head
// hw = max(1.5, rs*0.35); colored by the TARGET room color, unknown target ->
// CROSS_UNKNOWN_CSS. Hidden below zoom 0.25 (cellPx < 4.5). Call only for
// classify 'cross' ops (custom lines suppress the arrow, see classifyExit).
function crossArrowOp(room, vec, target, cache, cellPx) {
  if (cellPx < CELL * 0.25) return null;
  const svec = [vec[0], -vec[1]];   // data-space dir -> screen (Y negated)
  const rsPx = _rsPx(cellPx);
  const tickLen = _u(Math.max(4, rsPx * 0.9), cellPx);
  const hw = _u(Math.max(1.5, rsPx * 0.35), cellPx);
  const [ex, ey] = edgePoint(room.x, -room.y, ROOM_HALF, svec);
  const ax = ex + svec[0] * tickLen, ay = ey + svec[1] * tickLen;
  const px = -svec[1], py = svec[0];
  const head = [
    [ax + svec[0] * hw * 1.2, ay + svec[1] * hw * 1.2],
    [ax - svec[0] * hw + px * hw * 0.8, ay - svec[1] * hw + py * hw * 0.8],
    [ax - svec[0] * hw - px * hw * 0.8, ay - svec[1] * hw - py * hw * 0.8],
  ];
  const color = target ? roomColorCss(cache, target.env) : CROSS_UNKNOWN_CSS;
  return { line: [ex, ey, ax, ay], width: _u(Math.max(1, cellPx / CELL), cellPx), head, color };
}

// Studio drawStubs (8544-8562): room.stubs from the DATA, cardinals only,
// from the room edge, length 0.5 map units, LINE_CSS, exit line width.
function stubOps(room, cellPx) {
  const out = [];
  for (const dir of room.stubs || []) {
    const vec = DIR_VEC[dir];
    if (!vec || (!vec[0] && !vec[1])) continue;
    const svec = [vec[0], -vec[1]];
    const [ex, ey] = edgePoint(room.x, -room.y, _rsUnits(cellPx) / 2, svec);
    out.push({ dir, line: [ex, ey, ex + svec[0] * 0.5, ey + svec[1] * 0.5], width: lineWidthUnits(cellPx), color: LINE_CSS });
  }
  return out;
}

// Studio setLineDash (8843-8852): s = max(1, zoom*2) px
function dashPattern(style, cellPx) {
  const s = Math.max(1, (cellPx / CELL) * 2);
  switch (style) {
    case 'dash': return [_u(s * 4, cellPx), _u(s * 2, cellPx)];
    case 'dot': return [_u(s, cellPx), _u(s, cellPx)];
    case 'dash_dot': return [_u(s * 8, cellPx), _u(s * 3, cellPx), _u(s, cellPx), _u(s * 3, cellPx)];
    case 'dash_dot_dot': return [_u(s * 8, cellPx), _u(s * 3, cellPx), _u(s, cellPx), _u(s * 3, cellPx), _u(s, cellPx), _u(s * 3, cellPx)];
    default: return [];
  }
}

// Studio drawCustomLines (8777-8812) + drawCLArrow (8813-8838):
// polyline from the room CENTER through all points, cl.color or
// CL_DEFAULT_CSS, width max(1, zoom*1.2) px; door square on the first
// segment midpoint; arrowhead at the last point when cl.arrow (length
// max(8, zoom*10) px, half-angle PI/6).
function customLineOp(room, dir, cl, cellPx) {
  const z = cellPx / CELL;
  const pts = [[room.x, -room.y]];
  for (const p of cl.points || []) pts.push([p[0], -p[1]]);
  const op = {
    points: pts,
    color: cl.color ? _css(cl.color) : CL_DEFAULT_CSS,
    width: _u(Math.max(1, z * 1.2), cellPx),
    dash: dashPattern(cl.style, cellPx),
    door: null,
    arrow: null,
  };
  const door = (room.doors || {})[dir];
  if (door && pts.length > 1) {
    op.door = doorSquareOp((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, door, cellPx);
  }
  if (cl.arrow && pts.length > 1) {
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    const aLen = _u(Math.max(8, z * 10), cellPx);
    const aW = Math.PI / 6;
    op.arrow = {
      tip: last,
      base1: [last[0] - aLen * Math.cos(ang - aW), last[1] - aLen * Math.sin(ang - aW)],
      base2: [last[0] - aLen * Math.cos(ang + aW), last[1] - aLen * Math.sin(ang + aW)],
      color: op.color,
    };
  }
  return op;
}

// Studio door square (8498-8504): DOOR_RGB outline square of side rs/2 px at
// the line midpoint, width max(1, zoom*0.8) px.
function doorSquareOp(mx, my, doorState, cellPx) {
  const z = cellPx / CELL;
  const side = _u(_rsPx(cellPx) / 2, cellPx);   // Studio: sq = rs/2 (clamped rs)
  return { cx: mx, cy: my, side, color: DOOR_CSS[doorState] || DOOR_CSS.locked, width: _u(Math.max(1, z * 0.8), cellPx) };
}

// ─── rooms ──────────────────────────────────────────────────────────────────
// Studio drawRooms (8179+): fill roomColor, border LINE_CSS with width
// max(0.4, zoom*0.4875) px (non-edit mode), hidden rooms faded (alpha 0.35)
// or dashed (light border); selection halos are edit-only (out of scope).
function roomOp(room, cache, cellPx, hiddenMode) {
  const hs = hiddenRoomStyle(room, hiddenMode);
  const z = cellPx / CELL;
  const rsPx = _rsPx(cellPx);
  // Studio ZAD6: per-room custom border wins over the default
  // (user_data room.ui_borderColor Qt #AARRGGBB, room.ui_borderThickness 1..10)
  const ud = room?.user_data || {};
  const bc = ud['room.ui_borderColor'] ? _qtCss(ud['room.ui_borderColor']) : null;
  let bt = parseInt(ud['room.ui_borderThickness'], 10);
  bt = Number.isFinite(bt) ? Math.min(10, Math.max(1, bt)) : null;
  let border = LINE_CSS, borderWidth;
  if (bc) { border = bc; borderWidth = _u(Math.max(hs.dashed ? 1.3 : 0.4, z * 0.4875 * (bt || 1)), cellPx); }
  else if (hs.dashed) borderWidth = _u(Math.max(1.4, z * 1.4), cellPx);
  else borderWidth = _u(Math.max(0.4, z * 0.4875), cellPx);
  return {
    x: room.x, y: -room.y, half: rsPx / 2 / cellPx,
    fill: roomColorCss(cache, room.env),
    border,
    borderWidth,
    alpha: hs.alpha,
    dashed: hs.dashed,
    dash: hs.dashed ? [_u(Math.max(4, rsPx * 0.34), cellPx), _u(Math.max(3, rsPx * 0.24), cellPx)] : [],
    skip: hs.skip,
  };
}

// Studio inner exit indicators (8300-8335): zoom > 0.25, only when the exit
// exists; triangle radius rs/5, ellipse 1.4 x 0.8, offsets +/-rs/4; fill
// symbolFillFor (alpha 0.6), outline = door color or symbolColorFor.
function innerTrianglesOp(room, cache, cellPx) {
  if (cellPx / CELL <= 0.25) return null;
  const z = cellPx / CELL;
  const ex = room.exits || {};
  const rsU = _rsUnits(cellPx);
  const R = rsU / 5;
  const off = rsU / 4;
  const cx = room.x, cy = -room.y;
  const polys = {
    up: [[cx, cy + off, 0]],
    down: [[cx, cy - off, Math.PI]],
    in: [[cx - off, cy, Math.PI / 2], [cx + off, cy, -Math.PI / 2]],
    out: [[cx - off, cy, -Math.PI / 2], [cx + off, cy, Math.PI / 2]],
  };
  const tris = [];
  for (const dir of UDIO_DIRS) {
    if (ex[dir] === undefined) continue;
    const door = (room.doors || {})[dir];
    const stroke = door ? (DOOR_CSS[door] || DOOR_CSS.locked) : symbolColorCss(room, cache);
    for (const [px, py, rot] of polys[dir]) {
      const v = [];
      for (let i = 0; i < 3; i++) {
        const a = (2 * Math.PI * i / 3) - Math.PI / 2;
        const qx = Math.cos(a) * R * 1.4, qy = Math.sin(a) * R * 0.8;
        v.push([px + qx * Math.cos(rot) - qy * Math.sin(rot), py + qx * Math.sin(rot) + qy * Math.cos(rot)]);
      }
      tris.push({ points: v, fill: symbolFillCss(room, cache), stroke, width: _u(Math.max(0.5, z * 0.6), cellPx) });
    }
  }
  return tris.length ? tris : null;
}

// Studio symbol block (8273-8296): symbol or user_data fallback; zoom > 0.8;
// Delwing sizing (0.6 em/char, wide glyphs 1.0); >2 chars fit-to-box; skip
// below 7 px; halo contrasting with the symbol color.
function symbolOp(room, cache, cellPx) {
  const z = cellPx / CELL;
  if (z <= 0.8) return null;
  const sym = room.symbol || room.user_data?.['system.fallback_symbol'] || '';
  if (!sym) return null;
  const rsPx = _rsPx(cellPx);
  const cps = [...sym];
  const symW = cps.reduce((a, ch) => a + (ch.codePointAt(0) > 0xFFFF ? 1.0 : 0.6), 0);
  let sizePx;
  if (cps.length > 2) sizePx = Math.min(Math.round(rsPx * 0.52), Math.floor(rsPx / symW));
  else sizePx = Math.max(7, Math.round(rsPx * (cps.length > 1 ? 0.52 : 0.7)));
  if (sizePx < 7) return null;
  const col = symbolColorCss(room, cache);
  // Studio: halo contrasts with the GLYPH (light glyph -> dark halo)
  const halo = contrastCss(col) === '#111' ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.55)';
  return {
    text: sym, x: room.x, y: -room.y,
    fontUnits: _u(sizePx, cellPx),
    fill: col, halo, haloWidth: _u(Math.max(1.5, sizePx * 0.18), cellPx),
  };
}

// Studio special-exit marker (8338-8352): ✦ at the room corner, zoom > 0.5,
// contrast color + halo. (Studio gates it behind the editorMarkers view
// toggle, which defaults to on.)
function seMarkerOp(room, cache, cellPx) {
  const z = cellPx / CELL;
  if (z <= 0.5) return null;
  if (!room.special_exits || !Object.keys(room.special_exits).length) return null;
  const rsPx = _rsPx(cellPx);
  const half = rsPx / 2 / cellPx;
  const mSz = Math.max(6, rsPx * 0.44);
  const mCol = contrastCss(roomColorCss(cache, room.env));
  const halo = mCol === '#fff' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.5)';
  return {
    text: '✦', x: room.x + half, y: -room.y - half,
    fontUnits: _u(Math.round(mSz), cellPx),
    fill: mCol, halo, haloWidth: _u(Math.max(1, mSz * 0.15), cellPx),
    anchor: 'end', baseline: 'top',   // Studio textAlign right / textBaseline top
  };
}

// ─── grid / LOD / raster ────────────────────────────────────────────────────
// Studio drawGrid (7550-7578): 1-unit grid, hidden below cellPx 4, alpha
// tiers 0.025 / 0.035 / 0.045 by cellPx 15/30, 1 px lines.
function gridStyle(cellPx) {
  if (cellPx < ROOM_UNITS * cellPx || cellPx < 4) return null;   // first clause never true — Studio parity
  const alpha = cellPx < 15 ? 0.025 : cellPx < 30 ? 0.035 : 0.045;
  return { alpha, widthPx: 1, stepUnits: 1 };
}

// Studio computeLodMode (7692-7697): full when cells are legible or the
// viewport holds few rooms; raster below LOD_RASTER_CELL_PX, else roomsOnly.
function lodMode(planeCount, cellPx, W, H) {
  if (cellPx >= LOD_MIN_CELL_PX) return 'full';
  const visCells = Math.ceil(W / cellPx) * Math.ceil(H / cellPx);
  if (Math.min(planeCount, visCells) <= LOD_ROOMS_BUDGET) return 'full';
  return cellPx < LOD_RASTER_CELL_PX ? 'raster' : 'roomsOnly';
}

// Studio _buildRoomsRaster (7722-7790): one cell per map unit; exit lines
// Bresenham between cell centers (alpha RASTER_LINE_ALPHA, 225,225,225) drawn
// BEFORE rooms so room cells cover line ends; u/d/i/o, custom-lined,
// suppressed and off-plane exits skipped; two-way pairs deduped from the
// lower id; one-way always; hidden rooms skipped in 'hide', alpha-blended in
// 'faded'. Y flipped (row 0 = top = maxY). Returns RGBA bytes (canvas order).
function rasterModel(planeRooms, byId, cache, hiddenMode) {
  const hMode = hiddenMode || 'faded';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of planeRooms) {
    if (r.x < minX) minX = r.x; if (r.x > maxX) maxX = r.x;
    if (r.y < minY) minY = r.y; if (r.y > maxY) maxY = r.y;
  }
  if (!planeRooms.length) { minX = -1; maxX = 1; minY = -1; maxY = 1; }
  const cols = maxX - minX + 1, rows = maxY - minY + 1;
  const buf = new Uint8ClampedArray(cols * rows * 4);
  const put = (cx, cy, r, g, b, a) => {
    const i = (cy * cols + cx) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const idSet = new Set();
  for (const r of planeRooms) idSet.add(r.id);
  for (const r of planeRooms) {
    if (hMode === 'hide' && isRoomHidden(r)) continue;
    const exits = r.exits || {};
    for (const [dir, targetId] of Object.entries(exits)) {
      const vec = DIR_VEC[dir];
      if (!vec || (!vec[0] && !vec[1])) continue;
      if (r.custom_lines && r.custom_lines[dir]) continue;
      if (!idSet.has(targetId)) continue;
      const t = byId.get(targetId);
      if (!t) continue;
      if (hMode === 'hide' && isRoomHidden(t)) continue;
      const oneWay = !t.exits || t.exits[OPP_DIR[dir]] !== r.id;
      if (!oneWay && r.id > targetId) continue;
      let x0 = r.x - minX, y0 = maxY - r.y, x1 = t.x - minX, y1 = maxY - t.y;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        put(x0, y0, 225, 225, 225, RASTER_LINE_ALPHA);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
  }
  for (const r of planeRooms) {
    const hidden = isRoomHidden(r);
    if (hidden && hMode === 'hide') continue;
    const [cr, cg, cb] = roomColorRgb(cache, r.env);
    put(r.x - minX, maxY - r.y, cr, cg, cb, (hidden && hMode === 'faded') ? 89 : 255);
  }
  return { minX, maxY, cols, rows, buf };
}

// Studio drawRooms pre-pass (8200-8226): "stack shadows" for multi-floor
// rooms — the SIGNAL is the exit direction (up/down), not the target's Z.
// zoom > 0.3; ghost square offset up-right (up) / down-left (down) by
// max(2, rs*0.22) px, stroke rgba(130,205,255, min(0.7, zoom*0.5)).
function stackShadowsOp(room, cellPx) {
  const z = cellPx / CELL;
  if (z <= 0.3) return null;
  const ex = room.exits || {};
  if (!exits_up_down(ex)) return null;
  const rsU = _rsUnits(cellPx);
  const half = rsU / 2;
  const off = _u(Math.max(2, _rsPx(cellPx) * 0.22), cellPx);
  const alpha = Math.min(0.7, z * 0.5);
  const width = _u(Math.max(0.5, z * 0.7), cellPx);
  const color = `rgba(130,205,255,${Math.round(alpha * 100) / 100})`;
  const out = [];
  const cx = room.x, cy = -room.y;
  if (ex.up) out.push({ x: cx - half + off, y: cy - half - off, size: rsU, color, width });
  if (ex.down) out.push({ x: cx - half - off, y: cy - half + off, size: rsU, color, width });
  return out.length ? out : null;
}
function exits_up_down(ex) { return !!(ex.up || ex.down); }

// Studio drawExits cross-area SPECIAL exits (8523-8540): a special exit to a
// KNOWN room in ANOTHER area gets a cross arrow aimed at the target coords,
// unless a custom line owns that command (hasCL). Same-area / unknown target:
// no arrow. Returns [{ cmd, targetId, target, op }].
function specialCrossArrows(room, plane, cache, cellPx) {
  const out = [];
  for (const [cmd, targetId] of Object.entries(room.special_exits || {})) {
    if (room.custom_lines && room.custom_lines[cmd]) continue;
    const target = plane.byId.get(targetId) || null;
    if (!target) continue;
    if (plane.areaOf.get(targetId) === plane.areaId) continue;
    const dx = target.x - room.x, dy = target.y - room.y;
    const len = Math.hypot(dx, dy);
    if (!len) continue;
    const op = crossArrowOp(room, [dx / len, dy / len], target, cache, cellPx);
    if (op) out.push({ cmd, targetId, target, op });
  }
  return out;
}

export { CELL, ROOM_UNITS, ROOM_HALF, DEFAULT_ROOM_RGB, LINE_CSS, ONE_WAY_FILL, CROSS_UNKNOWN_CSS, CL_DEFAULT_CSS, DOOR_CSS, HIDDEN_FADE, RASTER_LINE_ALPHA, LOD_MIN_CELL_PX, LOD_ROOMS_BUDGET, LOD_RASTER_CELL_PX, DIR_VEC, OPP_DIR, UDIO_DIRS, buildColorCache, roomColorCss, roomColorRgb, isRoomHidden, hiddenRoomStyle, contrastCss, symbolColorCss, symbolFillCss, classifyExit, edgePoint, lineWidthUnits, exitLineOp, crossArrowOp, stubOps, dashPattern, customLineOp, doorSquareOp, roomOp, innerTrianglesOp, symbolOp, seMarkerOp, gridStyle, lodMode, rasterModel, stackShadowsOp, specialCrossArrows };

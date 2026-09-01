// render-svg.js — true-vector SVG rendering of an arkmap map (no raster).
//
// Hand-written module (not extracted from the standalone app).
//
// renderSvg(mapObj, opts) -> SVG string. Deterministic by construction:
// rooms iterate in stored area/room order, numbers are rounded to 2 decimal
// places, no dates, no randomness. Geometry model mirrors the demo viewer:
// room = square of half-size 0.36 map units, exits = straight lines (short
// stubs for edges leaving the scope), screen Y is negated data Y. Edges
// between two in-scope rooms are emitted once (undirected dedup).
//
// opts:
//   areaId   'all' (default) | area id — scope filter
//   z        null (default = all levels) | level — scope filter
//   scale    px per map unit for the width/height attributes (default 20)
//   background  CSS color (default '#14171c')
//   labels   true => room names under rooms (default false)
//   routes   [{ path: roomId[], hops?: (hop|null)[] }] — overlay polylines;
//            hop segments (transports) dashed amber, walking solid red
//   markers  [{ id, color?, label? }] — rings (+ optional text) on rooms
//
// Colors follow the demo viewer: map.colors custom_env_colors / env_colors
// (ANSI palette), then ARKADIA_ENVS for Arkadia maps, then ansiPaletteRgb.
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// plain function/const declarations, single-line imports, one-line export list.

import { isArkadiaMap, ARKADIA_ENVS } from './arkadia.js';
import { ansiPaletteRgb, ANSI_PAL } from './ansi-pal.js';

const RENDER_ROOM_R = 0.36;   // room half-size in map units (Mudlet style)
const RENDER_PAD = 1;         // viewBox margin in map units

const _RENDER_DELTA = { n: [0, 1], ne: [1, 1], e: [1, 0], se: [1, -1], s: [0, -1], sw: [-1, -1], w: [-1, 0], nw: [-1, 1] };

function _renderEsc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function _renderFmt(n) {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function _renderEnvColor(env, mapObj) {
  if (env == null) return '#3a4150';
  const colors = mapObj?.colors;
  const custom = colors?.custom_env_colors?.[env];
  if (Array.isArray(custom)) return `rgb(${custom[0]},${custom[1]},${custom[2]})`;
  const ansiIdx = colors?.env_colors?.[env];
  if (ansiIdx != null && ANSI_PAL[ansiIdx]) { const c = ANSI_PAL[ansiIdx]; return `rgb(${c[0]},${c[1]},${c[2]})`; }
  if (mapObj && isArkadiaMap(mapObj, null) && ARKADIA_ENVS[env]) { const c = ARKADIA_ENVS[env].rgb; return `rgb(${c[0]},${c[1]},${c[2]})`; }
  const c = ansiPaletteRgb(env);
  return c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#3a4150';
}

function renderSvg(mapObj, opts) {
  const o = opts || {};
  const areaId = o.areaId === undefined ? 'all' : o.areaId;
  const z = o.z === undefined ? null : o.z;
  const scale = o.scale || 20;
  const bg = o.background || '#14171c';

  const rooms = [];
  const pos = new Map();   // roomId -> [sx, sy] (screen coords: y negated)
  for (const area of mapObj?.areas || []) {
    if (areaId !== 'all' && area.id !== areaId) continue;
    for (const room of area.rooms || []) {
      if (z !== null && (room.z ?? 0) !== z) continue;
      rooms.push(room);
      pos.set(room.id, [room.x, -room.y]);
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of rooms) {
    const [sx, sy] = pos.get(r.id);
    minX = Math.min(minX, sx - RENDER_ROOM_R); maxX = Math.max(maxX, sx + RENDER_ROOM_R);
    minY = Math.min(minY, sy - RENDER_ROOM_R); maxY = Math.max(maxY, sy + RENDER_ROOM_R);
  }
  if (!rooms.length) { minX = -RENDER_PAD; maxX = RENDER_PAD; minY = -RENDER_PAD; maxY = RENDER_PAD; }
  minX -= RENDER_PAD; maxX += RENDER_PAD; minY -= RENDER_PAD; maxY += RENDER_PAD;
  const w = maxX - minX, h = maxY - minY;

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${_renderFmt(minX)} ${_renderFmt(minY)} ${_renderFmt(w)} ${_renderFmt(h)}" width="${_renderFmt(w * scale)}" height="${_renderFmt(h * scale)}">`);
  out.push(`<rect x="${_renderFmt(minX)}" y="${_renderFmt(minY)}" width="${_renderFmt(w)}" height="${_renderFmt(h)}" fill="${bg}"/>`);

  // exits: full lines inside the scope (dedup undirected), stubs for edges leaving it
  const seen = new Set();
  const lines = [];
  for (const r of rooms) {
    const [sx, sy] = pos.get(r.id);
    for (const [dir, tgt] of Object.entries(r.exits || {})) {
      const t = pos.get(tgt);
      if (t) {
        const key = r.id < tgt ? r.id + '>' + tgt : tgt + '>' + r.id;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(`<line x1="${_renderFmt(sx)}" y1="${_renderFmt(sy)}" x2="${_renderFmt(t[0])}" y2="${_renderFmt(t[1])}"/>`);
      } else {
        const d = _RENDER_DELTA[dir];
        if (d) lines.push(`<line x1="${_renderFmt(sx)}" y1="${_renderFmt(sy)}" x2="${_renderFmt(sx + d[0] * 0.45)}" y2="${_renderFmt(sy - d[1] * 0.45)}"/>`);
      }
    }
  }
  if (lines.length) out.push(`<g stroke="#565e6b" stroke-width="0.14">${lines.join('')}</g>`);

  // rooms as squares
  const rects = [];
  for (const r of rooms) {
    const [sx, sy] = pos.get(r.id);
    rects.push(`<rect x="${_renderFmt(sx - RENDER_ROOM_R)}" y="${_renderFmt(sy - RENDER_ROOM_R)}" width="${_renderFmt(RENDER_ROOM_R * 2)}" height="${_renderFmt(RENDER_ROOM_R * 2)}" fill="${_renderEnvColor(r.env, mapObj)}" stroke="rgba(0,0,0,0.35)" stroke-width="0.05"/>`);
  }
  if (rects.length) out.push(`<g>${rects.join('')}</g>`);

  // optional room-name labels
  if (o.labels) {
    const texts = [];
    for (const r of rooms) {
      if (!r.name) continue;
      const [sx, sy] = pos.get(r.id);
      texts.push(`<text x="${_renderFmt(sx)}" y="${_renderFmt(sy + RENDER_ROOM_R + 0.55)}" font-size="0.5" fill="#dde3ea" text-anchor="middle" font-family="system-ui,sans-serif">${_renderEsc(r.name)}</text>`);
    }
    if (texts.length) out.push(`<g>${texts.join('')}</g>`);
  }

  // route overlays: walking solid red, transport hops dashed amber
  for (const route of o.routes || []) {
    const path = route?.path;
    if (!Array.isArray(path) || path.length < 2) continue;
    const segs = [];
    for (let i = 0; i + 1 < path.length; i++) {
      const a = pos.get(path[i]), b = pos.get(path[i + 1]);
      if (!a || !b) continue;
      const hop = route.hops?.[i];
      const dash = hop ? ` stroke-dasharray="0.7 0.7" stroke="#fbbf24"` : ` stroke="#f87171"`;
      segs.push(`<line x1="${_renderFmt(a[0])}" y1="${_renderFmt(a[1])}" x2="${_renderFmt(b[0])}" y2="${_renderFmt(b[1])}"${dash}/>`);
    }
    if (segs.length) out.push(`<g stroke-width="0.3" stroke-linecap="round">${segs.join('')}</g>`);
  }

  // markers: rings (+ optional labels) on rooms
  const rings = [];
  for (const m of o.markers || []) {
    const p = pos.get(m?.id);
    if (!p) continue;
    const col = m.color || '#fb923c';
    const rr = RENDER_ROOM_R + 0.14;
    let s = `<rect x="${_renderFmt(p[0] - rr)}" y="${_renderFmt(p[1] - rr)}" width="${_renderFmt(rr * 2)}" height="${_renderFmt(rr * 2)}" fill="none" stroke="${_renderEsc(col)}" stroke-width="0.22"/>`;
    if (m.label !== undefined && m.label !== null) {
      s += `<text x="${_renderFmt(p[0])}" y="${_renderFmt(p[1] - rr - 0.15)}" font-size="0.55" fill="${_renderEsc(col)}" text-anchor="middle" font-family="monospace">${_renderEsc(m.label)}</text>`;
    }
    rings.push(s);
  }
  if (rings.length) out.push(`<g>${rings.join('')}</g>`);

  out.push('</svg>');
  return out.join('\n');
}

export { renderSvg };

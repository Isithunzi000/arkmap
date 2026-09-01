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
//   mapLabels  true => area labels (text + pixmap images) from map data,
//            honouring show_on_top and the z filter (default false)
//   routes   [{ path: roomId[], hops?: (hop|null)[] }] — overlay polylines;
//            hop segments (transports) dashed amber, walking solid red
//   markers  [{ id, color?, label? }] — rings (+ optional text) on rooms
//
// Exits leaving the scope: a known target room (other area/level) gets an
// arrowhead colored by the target environment, with the target area name in
// <title>; an unknown target stays a plain gray stub. Special exits to known
// out-of-scope rooms get arrows pointing at the target coordinates.
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

// cross-area exit arrow: line from the room edge + filled head, colored by
// the target room environment, target area name in <title>. sv is the raw
// direction vector in screen coords (y already negated).
function _renderArrow(sx, sy, sv, color, title) {
  const len = Math.hypot(sv[0], sv[1]);
  if (!len) return '';
  const ux = sv[0] / len, uy = sv[1] / len;
  const tEdge = RENDER_ROOM_R / Math.max(Math.abs(ux), Math.abs(uy));   // ray-square intersection: cardinals edge-mid, diagonals corner
  const ex = sx + ux * tEdge, ey = sy + uy * tEdge;
  const tx = ex + ux * 0.45, ty = ey + uy * 0.45;                         // tip
  const hl = 0.22, hw = 0.12;
  const bx = tx - ux * hl, by = ty - uy * hl;
  const px = -uy, py = ux;
  const points = `${_renderFmt(tx)},${_renderFmt(ty)} ${_renderFmt(bx + px * hw)},${_renderFmt(by + py * hw)} ${_renderFmt(bx - px * hw)},${_renderFmt(by - py * hw)}`;
  return `<g stroke="${color}" fill="${color}"><title>${_renderEsc(title)}</title>`
    + `<line x1="${_renderFmt(ex)}" y1="${_renderFmt(ey)}" x2="${_renderFmt(tx)}" y2="${_renderFmt(ty)}" stroke-width="0.14"/>`
    + `<polygon points="${points}" stroke="none"/></g>`;
}

// one area label: text (fg color, dark outline, font fitted to the box —
// the same model as ArkMap Studio) or a pixmap image; bg rect when the
// background color carries an alpha channel > 0
function _renderMapLabel(lbl) {
  const W = lbl.width ?? 4, H = lbl.height ?? 1.2;
  const x = lbl.x ?? 0, y = -(lbl.y ?? 0);   // top-left in screen coords
  let s = '';
  const bgc = lbl.bg_color;
  if (Array.isArray(bgc) && bgc.length >= 4 && bgc[3] > 0) {
    s += `<rect x="${_renderFmt(x)}" y="${_renderFmt(y)}" width="${_renderFmt(W)}" height="${_renderFmt(H)}" fill="rgba(${bgc[0]},${bgc[1]},${bgc[2]},${_renderFmt(bgc[3] / 255)})"/>`;
  }
  if (lbl.text) {
    let fg = Array.isArray(lbl.fg_color) ? lbl.fg_color : [200, 200, 100];
    const bright = (fg[0] * 299 + fg[1] * 587 + fg[2] * 114) / 1000;
    if (bright < 60) fg = [200, 200, 80];
    const ratio = Math.min(0.75, W / Math.max(lbl.text.length / 2, 1));
    const fs = Math.max(0.1, Math.min(ratio, Math.max(H * 0.9, 0.1)));
    s += `<text x="${_renderFmt(x + W / 2)}" y="${_renderFmt(y + H / 2)}" font-size="${_renderFmt(fs)}" fill="rgb(${fg[0]},${fg[1]},${fg[2]})" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" paint-order="stroke" stroke="rgba(0,0,0,0.85)" stroke-width="${_renderFmt(fs * 0.12)}">${_renderEsc(lbl.text)}</text>`;
  } else if (lbl.pixmap) {
    s += `<image x="${_renderFmt(x)}" y="${_renderFmt(y)}" width="${_renderFmt(W)}" height="${_renderFmt(H)}" href="data:image/png;base64,${lbl.pixmap}"/>`;
  }
  return s;
}

function renderSvg(mapObj, opts) {
  const o = opts || {};
  const areaId = o.areaId === undefined ? 'all' : o.areaId;
  const z = o.z === undefined ? null : o.z;
  const scale = o.scale || 20;
  const bg = o.background || '#14171c';

  const rooms = [];
  const pos = new Map();        // roomId -> [sx, sy] (screen coords: y negated)
  const allRooms = new Map();   // roomId -> { room, areaId } — every area, for cross-scope arrows
  const areaNames = new Map();
  for (const area of mapObj?.areas || []) {
    areaNames.set(area.id, area.name || '');
    for (const room of area.rooms || []) allRooms.set(room.id, { room, areaId: area.id });
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

  // map labels below the rooms (show_on_top labels land in a later group)
  if (o.mapLabels) {
    const under = [];
    for (const area of mapObj?.areas || []) {
      if (areaId !== 'all' && area.id !== areaId) continue;
      for (const lbl of area.labels || []) {
        if (z !== null && lbl.z !== undefined && lbl.z !== z) continue;
        if (lbl.show_on_top || (!lbl.text && !lbl.pixmap)) continue;
        under.push(_renderMapLabel(lbl));
      }
    }
    if (under.length) out.push(`<g>${under.join('')}</g>`);
  }

  // exits: full lines inside the scope (dedup undirected), arrows for edges
  // leading to a known room outside the scope, stubs for unknown targets
  const seen = new Set();
  const lines = [];
  const arrows = [];
  for (const r of rooms) {
    const [sx, sy] = pos.get(r.id);
    const srcArea = allRooms.get(r.id)?.areaId;
    for (const [dir, tgt] of Object.entries(r.exits || {})) {
      const t = pos.get(tgt);
      if (t) {
        const key = r.id < tgt ? r.id + '>' + tgt : tgt + '>' + r.id;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(`<line x1="${_renderFmt(sx)}" y1="${_renderFmt(sy)}" x2="${_renderFmt(t[0])}" y2="${_renderFmt(t[1])}"/>`);
      } else {
        const d = _RENDER_DELTA[dir];
        if (!d) continue;   // up/down/in/out have no line geometry
        const known = allRooms.get(tgt);
        if (known && known.areaId !== srcArea) {
          // cross-area only (ArkMap Studio parity: same area on another level = stub)
          const name = areaNames.get(known.areaId) || `area ${known.areaId}`;
          arrows.push(_renderArrow(sx, sy, [d[0], -d[1]], _renderEnvColor(known.room.env, mapObj), `${name} (#${tgt})`));
        } else {
          lines.push(`<line x1="${_renderFmt(sx)}" y1="${_renderFmt(sy)}" x2="${_renderFmt(sx + d[0] * 0.45)}" y2="${_renderFmt(sy - d[1] * 0.45)}"/>`);
        }
      }
    }
    // special exits to known rooms in ANOTHER area: arrow toward the target
    for (const [, tgt] of Object.entries(r.special_exits || {})) {
      if (pos.has(tgt)) continue;
      const known = allRooms.get(tgt);
      if (!known || known.areaId === srcArea) continue;
      const sv = [known.room.x - r.x, -(known.room.y - r.y)];
      if (!sv[0] && !sv[1]) continue;
      const name = areaNames.get(known.areaId) || `area ${known.areaId}`;
      arrows.push(_renderArrow(sx, sy, sv, _renderEnvColor(known.room.env, mapObj), `${name} (#${tgt})`));
    }
  }
  if (lines.length) out.push(`<g stroke="#565e6b" stroke-width="0.14">${lines.join('')}</g>`);
  if (arrows.length) out.push(arrows.join(''));

  // rooms as squares
  const rects = [];
  for (const r of rooms) {
    const [sx, sy] = pos.get(r.id);
    rects.push(`<rect x="${_renderFmt(sx - RENDER_ROOM_R)}" y="${_renderFmt(sy - RENDER_ROOM_R)}" width="${_renderFmt(RENDER_ROOM_R * 2)}" height="${_renderFmt(RENDER_ROOM_R * 2)}" fill="${_renderEnvColor(r.env, mapObj)}" stroke="rgba(0,0,0,0.35)" stroke-width="0.05"/>`);
  }
  if (rects.length) out.push(`<g>${rects.join('')}</g>`);

  // map labels above the rooms (show_on_top), before route overlays
  if (o.mapLabels) {
    const over = [];
    for (const area of mapObj?.areas || []) {
      if (areaId !== 'all' && area.id !== areaId) continue;
      for (const lbl of area.labels || []) {
        if (z !== null && lbl.z !== undefined && lbl.z !== z) continue;
        if (!lbl.show_on_top || (!lbl.text && !lbl.pixmap)) continue;
        over.push(_renderMapLabel(lbl));
      }
    }
    if (over.length) out.push(`<g>${over.join('')}</g>`);
  }

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

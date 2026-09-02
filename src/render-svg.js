// render-svg.js — true-vector SVG rendering of an arkmap map (no raster).
//
// Hand-written module (not extracted from the standalone app).
//
// renderSvg(mapObj, opts) -> SVG string. Deterministic by construction:
// rooms iterate in stored area/room order, numbers are rounded to 2 decimal
// places, no dates, no randomness.
//
// Geometry, colors, widths, dash patterns, zoom gates and layer order mirror
// ArkMap Studio's canvas renderer 1:1 via src/render-model.js, evaluated at
// cellPx = CELL (Studio zoom 1), where every detail layer is visible: exit
// lines are edge-to-edge (one-way: dashed to the target center + red
// arrowhead), up/down/in/out exits have no line geometry, custom lines and
// exit suppressors are honored, doors are DOOR_RGB squares, rooms are
// ROOM_UNITS squares with hidden-room styling, inner u/d/i/o triangles,
// room symbols and the special-exit ✦ marker are drawn, and cross-area
// exits become env-colored arrows (orange when the target is unknown).
// Screen Y is negated data Y.
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
// Two-way exits are emitted once (lower id first): both directions produce
// the identical edge-to-edge segment, so dedup is pixel-identical to
// Studio's double draw. One-way exits are never deduped.
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// plain function/const declarations, single-line imports, one-line export list.

import { CELL, ROOM_UNITS, ROOM_HALF, DIR_VEC, buildColorCache, classifyExit, exitLineOp, crossArrowOp, stubOps, customLineOp, doorSquareOp, roomOp, innerTrianglesOp, symbolOp, seMarkerOp, gridStyle } from './render-model.js';

const RENDER_PAD = 1;            // viewBox margin in map units
const RENDER_CELL_PX = CELL;     // static export = Studio zoom 1 (all detail layers on)

function _renderEsc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function _renderFmt(n) {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}
function _renderPts(points) {
  return points.map(p => `${_renderFmt(p[0])},${_renderFmt(p[1])}`).join(' ');
}
function _renderLine(op) {
  const dash = op.dash && op.dash.length ? ` stroke-dasharray="${op.dash.map(_renderFmt).join(' ')}"` : '';
  return `<line x1="${_renderFmt(op.line[0])}" y1="${_renderFmt(op.line[1])}" x2="${_renderFmt(op.line[2])}" y2="${_renderFmt(op.line[3])}" stroke="${op.color}" stroke-width="${_renderFmt(op.width)}"${dash}/>`;
}
function _renderHead(head, stroke, strokeWidth) {
  return `<polygon points="${_renderPts([head.tip, head.base1, head.base2])}" fill="${head.fill || head.color}" stroke="${stroke || 'none'}" stroke-width="${_renderFmt(strokeWidth || 0)}"/>`;
}
function _renderDoorSq(op) {
  const h = op.side / 2;
  return `<rect x="${_renderFmt(op.cx - h)}" y="${_renderFmt(op.cy - h)}" width="${_renderFmt(op.side)}" height="${_renderFmt(op.side)}" fill="none" stroke="${op.color}" stroke-width="${_renderFmt(op.width)}"/>`;
}
function _renderGlyph(op) {
  return `<text x="${_renderFmt(op.x)}" y="${_renderFmt(op.y)}" font-size="${_renderFmt(op.fontUnits)}" fill="${op.fill}" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" paint-order="stroke" stroke="${op.halo}" stroke-width="${_renderFmt(op.haloWidth)}">${_renderEsc(op.text)}</text>`;
}

// one area label: text (fg color, dark halo, font fitted to the box — the
// same model as ArkMap Studio, which draws no background rect) or a pixmap
function _renderMapLabel(lbl) {
  const W = lbl.width ?? 4, H = lbl.height ?? 1.2;
  const x = lbl.x ?? 0, y = -(lbl.y ?? 0);   // top-left in screen coords
  let s = '';
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
  const CPX = RENDER_CELL_PX;

  const cache = buildColorCache(mapObj);
  const rooms = [];
  const pos = new Map();        // roomId -> [sx, sy] (screen coords: y negated)
  const byId = new Map();       // roomId -> room (every area)
  const areaOf = new Map();     // roomId -> area id
  const areaNames = new Map();
  for (const area of mapObj?.areas || []) {
    areaNames.set(area.id, area.name || '');
    for (const room of area.rooms || []) { byId.set(room.id, room); areaOf.set(room.id, area.id); }
    if (areaId !== 'all' && area.id !== areaId) continue;
    for (const room of area.rooms || []) {
      if (z !== null && (room.z ?? 0) !== z) continue;
      rooms.push(room);
      pos.set(room.id, [room.x, -room.y]);
    }
  }

  // viewBox: rooms (ROOM_HALF) + every custom-line point, plus margin
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const bbox = (x, y, r) => {
    minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r);
  };
  for (const r of rooms) {
    const [sx, sy] = pos.get(r.id);
    bbox(sx, sy, ROOM_HALF);
    for (const cl of Object.values(r.custom_lines || {})) {
      for (const p of cl.points || []) bbox(p[0], -p[1], 0);
    }
  }
  if (!rooms.length) { minX = -RENDER_PAD; maxX = RENDER_PAD; minY = -RENDER_PAD; maxY = RENDER_PAD; }
  minX -= RENDER_PAD; maxX += RENDER_PAD; minY -= RENDER_PAD; maxY += RENDER_PAD;
  const w = maxX - minX, h = maxY - minY;

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${_renderFmt(minX)} ${_renderFmt(minY)} ${_renderFmt(w)} ${_renderFmt(h)}" width="${_renderFmt(w * scale)}" height="${_renderFmt(h * scale)}">`);
  out.push(`<rect x="${_renderFmt(minX)}" y="${_renderFmt(minY)}" width="${_renderFmt(w)}" height="${_renderFmt(h)}" fill="${bg}"/>`);

  // Studio layer order: grid -> exits -> stubs -> custom lines -> labels
  // (under) -> rooms (+details) -> labels on top -> package overlays.

  const grid = rooms.length ? gridStyle(CPX) : null;   // no grid over an empty export
  if (grid) {
    const gl = [];
    for (let gx = Math.ceil(minX); gx <= Math.floor(maxX); gx++) {
      gl.push(`<line x1="${gx}" y1="${_renderFmt(minY)}" x2="${gx}" y2="${_renderFmt(maxY)}"/>`);
    }
    for (let gy = Math.ceil(minY); gy <= Math.floor(maxY); gy++) {
      gl.push(`<line x1="${_renderFmt(minX)}" y1="${gy}" x2="${_renderFmt(maxX)}" y2="${gy}"/>`);
    }
    if (gl.length) out.push(`<g stroke="rgba(255,255,255,${grid.alpha})" stroke-width="${_renderFmt(grid.widthPx / CPX)}">${gl.join('')}</g>`);
  }

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

  // exits via the render model; per-room plane (area, z) = Studio plane view
  const exitSvg = [];
  const seenLines = new Set();
  const seenDoors = new Set();
  const stubSvg = [];
  const clSvg = [];
  for (const r of rooms) {
    const plane = { byId, areaOf, areaId: areaOf.get(r.id), z: r.z ?? 0 };
    for (const [dir, tgt] of Object.entries(r.exits || {})) {
      const cls = classifyExit(r, dir, tgt, plane);
      if (cls.kind === 'line' || cls.kind === 'oneway') {
        const key = r.id < tgt ? r.id + '>' + tgt : tgt + '>' + r.id;
        if (cls.kind === 'line') {
          if (seenLines.has(key)) continue;
          seenLines.add(key);
        }
        const op = exitLineOp(r, cls.target, DIR_VEC[dir], CPX, cls.kind === 'oneway');
        exitSvg.push(_renderLine(op));
        if (op.head) exitSvg.push(_renderHead(op.head, op.head.outline, op.width));
      } else if (cls.kind === 'cross') {
        const op = crossArrowOp(r, DIR_VEC[dir], cls.target, cache, CPX);
        if (op) {
          const name = cls.target ? (areaNames.get(areaOf.get(tgt)) || `area ${areaOf.get(tgt)}`) : 'unknown';
          exitSvg.push(`<g><title>${_renderEsc(`${name} (#${tgt})`)}</title>${_renderLine(op)}`
            + `<polygon points="${_renderPts(op.head)}" fill="${op.color}" stroke="none"/></g>`);
        }
      }
      // 'custom' / 'suppressed' handled by the custom-lines layer;
      // 'udio' / 'crossZ' / 'skip' have no line geometry.
      const door = (r.doors || {})[dir];
      if (door && (cls.kind === 'line' || cls.kind === 'oneway')) {
        const [sx, sy] = pos.get(r.id);
        const [tx, ty] = pos.get(tgt) || [sx, sy];
        const dkey = `${_renderFmt((sx + tx) / 2)}|${_renderFmt((sy + ty) / 2)}|${door}`;
        if (!seenDoors.has(dkey)) {
          seenDoors.add(dkey);
          exitSvg.push(_renderDoorSq(doorSquareOp((sx + tx) / 2, (sy + ty) / 2, door, CPX)));
        }
      }
    }
    for (const st of stubOps(r, CPX)) stubSvg.push(_renderLine(st));
    for (const [dir, cl] of Object.entries(r.custom_lines || {})) {
      if (!cl.points || !cl.points.length) continue;   // suppressor
      const op = customLineOp(r, dir, cl, CPX);
      const dash = op.dash.length ? ` stroke-dasharray="${op.dash.map(_renderFmt).join(' ')}"` : '';
      clSvg.push(`<polyline points="${_renderPts(op.points)}" fill="none" stroke="${op.color}" stroke-width="${_renderFmt(op.width)}"${dash}/>`);
      if (op.door) clSvg.push(_renderDoorSq(op.door));
      if (op.arrow) clSvg.push(`<polygon points="${_renderPts([op.arrow.tip, op.arrow.base1, op.arrow.base2])}" fill="${op.arrow.color}" stroke="none"/>`);
    }
  }
  if (exitSvg.length) out.push(`<g>${exitSvg.join('')}</g>`);
  if (stubSvg.length) out.push(`<g>${stubSvg.join('')}</g>`);
  if (clSvg.length) out.push(`<g>${clSvg.join('')}</g>`);

  // rooms + per-room details (inner u/d/i/o triangles, symbol, ✦ marker)
  const roomSvg = [];
  for (const r of rooms) {
    const ro = roomOp(r, cache, CPX, 'faded');
    if (ro.skip) continue;
    const dash = ro.dash.length ? ` stroke-dasharray="${ro.dash.map(_renderFmt).join(' ')}"` : '';
    const alpha = ro.alpha !== 1 ? ` opacity="${_renderFmt(ro.alpha)}"` : '';
    roomSvg.push(`<rect x="${_renderFmt(ro.x - ro.half)}" y="${_renderFmt(ro.y - ro.half)}" width="${_renderFmt(ro.half * 2)}" height="${_renderFmt(ro.half * 2)}" fill="${ro.fill}" stroke="${ro.border}" stroke-width="${_renderFmt(ro.borderWidth)}"${dash}${alpha}/>`);
    for (const tri of innerTrianglesOp(r, cache, CPX) || []) {
      roomSvg.push(`<polygon points="${_renderPts(tri.points)}" fill="${tri.fill}" stroke="${tri.stroke}" stroke-width="${_renderFmt(tri.width)}"/>`);
    }
    const sym = symbolOp(r, cache, CPX);
    if (sym) roomSvg.push(_renderGlyph(sym));
    const se = seMarkerOp(r, cache, CPX);
    if (se) roomSvg.push(_renderGlyph(se));
  }
  if (roomSvg.length) out.push(`<g>${roomSvg.join('')}</g>`);

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
      texts.push(`<text x="${_renderFmt(sx)}" y="${_renderFmt(sy + ROOM_HALF + 0.55)}" font-size="0.5" fill="#dde3ea" text-anchor="middle" font-family="system-ui,sans-serif">${_renderEsc(r.name)}</text>`);
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
    const rr = ROOM_HALF + 0.14;
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

// render-png.js — rasterize an SVG string to PNG in the browser.
//
// Hand-written module (not extracted from the standalone app).
//
// svgToPng(svg, opts) -> Promise<Blob> ('image/png'). Browser-only: builds an
// <img> from a Blob URL, draws it on a canvas and re-encodes. The SVG must be
// self-contained (no external references, no foreignObject) — then the canvas
// stays untainted and toBlob works. renderSvg() output qualifies, including
// mapLabels (pixmaps are embedded as data: URIs) and cross-area arrows.
//
// renderPng(mapObj, opts) -> Promise<Blob> — one-call convenience:
// renderSvg(mapObj, opts) + svgToPng. All renderSvg opts apply (areaId, z,
// scale, background, labels, mapLabels, routes, markers); extra opt
// pngScale (default 2) is the raster resolution multiplier.
//
// svgToPng opts: { scale = 2 } — output resolution multiplier over the
// SVG's width/height attributes.
//
// Keep this file bundler-friendly for scripts/build-demo.mjs:
// plain function/const declarations, single-line imports, one-line export list.

import { renderSvg } from './render-svg.js';

async function svgToPng(svg, opts) {
  const o = opts || {};
  const scale = o.scale || 2;
  if (typeof document === 'undefined' || typeof Image === 'undefined'
      || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function'
      || typeof Blob === 'undefined') {
    throw new Error('svgToPng needs a browser (document/Image/URL.createObjectURL)');
  }
  const m = /<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/.exec(svg);
  const w = m ? +m[1] : 800, h = m ? +m[2] : 600;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('SVG rasterization failed'));
      im.src = url;
    });
    const cnv = document.createElement('canvas');
    cnv.width = Math.round(w * scale);
    cnv.height = Math.round(h * scale);
    const g = cnv.getContext('2d');
    g.drawImage(img, 0, 0, cnv.width, cnv.height);
    return await new Promise((res, rej) => cnv.toBlob(b => b ? res(b) : rej(new Error('PNG encode failed')), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderPng(mapObj, opts) {
  const o = opts || {};
  return svgToPng(renderSvg(mapObj, o), { scale: o.pngScale || 2 });
}

export { svgToPng, renderPng };

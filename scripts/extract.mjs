#!/usr/bin/env node
// extract.mjs — deterministic provenance gate for the arkmap library modules
// extracted from arkmap_studio.html (repo: Isithunzi000/arkadia-web_standalone-arkmap_studio).
//
// The single-file app is the origin of truth. This script fetches it at a
// PINNED commit sha, verifies the source sha256, and checks each extracted
// module according to its status:
//
//   parity     — logic must stay identical to the source line range.
//                Comparison is comment- and formatting-insensitive
//                (normalizeLogic), so comments may be translated/rewritten
//                freely; any code drift fails the check.
//   maintained — forked on purpose (documented divergence, e.g. EN error
//                strings + machine codes). The file is pinned by sha256 in
//                EXTRACT_MANIFEST.json; origin sha + line range recorded.
//
// Usage:
//   node scripts/extract.mjs            write missing parity files + refresh manifest
//   node scripts/extract.mjs --check    verify everything, diff vs src/ (CI parity gate)
//
// Exit codes: 0 ok / 1 mismatch. Fails closed on any drift.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_REPO = 'Isithunzi000/arkadia-web_standalone-arkmap_studio';
const SOURCE_FILE = 'arkmap_studio.html';
const SOURCE_SHA  = '24bd9022895753779758e5c58286565c76d85d19';
const SOURCE_SHA256 = '4a9523a1b348214115544514904bc97bdcb4527864b29dc1b2fce6192af6a061';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// Verified line ranges (1-based, inclusive) @ SOURCE_SHA + ESM plumbing.
// imports/exports are appended by this script; block bodies come from the app.
// status: 'parity' (logic-pinned to source) | 'maintained' (documented fork).
const BLOCKS = [
  { out: 'constants.js',       from: 4234,  to: 4278,  status: 'parity',
    exports: ['DIRS', 'DIR_BY_SHORT', 'DIR_BY_LONG', 'DIR_BY_IDX', 'DOOR_INT', 'DOOR_STR', 'DOOR_RGB', 'LINE_INT', 'LINE_STR', 'FORMAT', 'FORMAT_VERSION', '_ARKMAP_TOP_KEYS'] },
  { out: 'arkadia.js',         from: 4279,  to: 4431,  status: 'parity',
    exports: ['ARKADIA_ENVS', 'ARKADIA_SYMBOLS', 'envPaletteList', 'ARKADIA_ENV', 'ARKADIA_SIGNATURE_ENVS', 'isArkadiaMap'] },
  { out: 'validate.js',        from: 4434,  to: 4798,  status: 'maintained',
    note: 'EN warning + error code for special-exit/direction overlap; err() accepts optional code (H0.3)',
    imports: [{ from: './constants.js', names: ['DIR_BY_SHORT', 'FORMAT', 'FORMAT_VERSION', 'LINE_INT'] }],
    exports: ['validate'] },
  { out: 'checksum.js',        from: 4799,  to: 5552,  status: 'maintained',
    note: 'EN internal invariant message in _CanonBuf (H0.3); _computeV4Checksums exported for delta base identity (H1)',
    exports: ['xxh3_64', 'xxh3_64hex', 'addChecksums', 'verifyChecksums', '_stripRoomDefaults', '_computeV4Checksums'] },
  { out: 'mudlet-dat.js',      from: 5553,  to: 6540,  status: 'maintained',
    note: 'EN error strings + DAT_* machine codes on all throw paths, EN import warnings (H0.3)',
    exports: ['readMudletDat', 'writeMudletDat', 'MUDLET_DAT_MAX_SUPPORTED_VERSION', 'MUDLET_DAT_WRITE_VERSION', 'uint8ToBase64', 'base64ToUint8'] },
  { out: 'dat-to-arkmap.js',   from: 6541,  to: 6769,  status: 'maintained',
    note: 'EN error strings + DAT_* machine codes, EN import warnings (H0.3)',
    imports: [{ from: './constants.js', names: ['DIRS', 'DIR_BY_LONG', 'DOOR_STR', 'FORMAT', 'FORMAT_VERSION', 'LINE_STR'] },
              { from: './arkadia.js',   names: ['isArkadiaMap'] },
              { from: './mudlet-dat.js', names: ['readMudletDat', 'uint8ToBase64'] }],
    exports: ['datToArkmap'] },
  { out: 'arkmap-to-dat.js',   from: 6770,  to: 6958,  status: 'parity',
    imports: [{ from: './constants.js', names: ['DIRS', 'DIR_BY_LONG', 'DIR_BY_SHORT', 'DOOR_INT', 'LINE_INT'] },
              { from: './ansi-pal.js',  names: ['ansiPaletteRgb'] },
              { from: './mudlet-dat.js', names: ['writeMudletDat', 'base64ToUint8'] }],
    exports: ['arkmapToDat'] },
  { out: 'ansi-pal.js',        from: 7201,  to: 7218,  status: 'parity',
    exports: ['ANSI_PAL', 'ansiPaletteRgb'] },
  { out: 'opposite.js',        from: 8049,  to: 8054,  status: 'parity',
    exports: ['OPPOSITE'] },
  { out: 'stable-stringify.js', from: 10512, to: 10535, status: 'parity',
    exports: ['stableStringify'] },
  { out: 'canonicalize.js',    from: 10590, to: 10606, status: 'parity',
    exports: ['_canonicalizeMapForSave'] },
  { out: 'suppressors.js',     from: 19357, to: 19413, status: 'parity',
    imports: [{ from: './opposite.js', names: ['OPPOSITE'] }],
    exports: ['checkSuppressorsInMap', '_findMissingSuppressors'] },
  { out: 'delta-validate.js',  from: 20895, to: 22369, status: 'maintained',
    note: '.arkdelta reader (H1): validator + schema + sid machinery + checksums from the ARKDELTA block, signature verify from the identity block (20317-20337) with the Ed25519 fallback (20126-20218, verify-only subset). Divergences: i18n via locale.js (EN default, PL byte-pinned to Studio), parallel codes array, VALID_DIRS derived from constants.js' },
  { out: 'delta-build.js',     from: 21007, to: 22029, status: 'maintained',
    note: '.arkdelta writer (H2): _deltaStripRoom, _deltaOpRefs/_deltaChainKey/_deltaTryFold, _compactDeltaOps, buildDelta, DELTA_EXPORTABLE, _deltaSerializeOps from the ARKDELTA block. Divergences: log/base as explicit params (Studio uses global state), meta.app_version via opts.appVersion (field omitted when not given), file-save glue and signing stay in Studio' },
];

// --- logic normalization ----------------------------------------------------
// Comment- and formatting-insensitive projection of JS source: drops // and
// /* */ comments, collapses whitespace outside strings/templates/regexes.
// Both sides of a parity comparison share identical code and differ only in
// comments, so the projection just has to be deterministic — string, template
// and regex contents are preserved verbatim.
export function normalizeLogic(src) {
  const out = [];
  let state = 'code';          // code | sq | dq | tpl | line | block | regex | rxclass
  const stack = [];            // template-literal nesting: each entry is 'tpl'
  let braceDepth = 0;          // {} depth inside a template ${ } expression
  let last = '';               // last significant char emitted in code state
  let word = '';               // current identifier/keyword being emitted

  const push = (ch) => { out.push(ch); };
  const sig = (ch) => {        // record a significant (non-space) emitted char
    if (/[A-Za-z0-9_$]/.test(ch)) { word += ch; }
    else { word = ''; }
    last = ch;
  };
  const REGEX_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete',
    'void', 'throw', 'else', 'do', 'yield', 'await', 'instanceof']);
  const regexAllowed = () =>
    last === '' || '([{,;:=!&|?+-*%^~<>'.includes(last) || REGEX_WORDS.has(word);

  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const nx = i + 1 < n ? src[i + 1] : '';

    if (state === 'line') {
      if (ch === '\n') state = 'code';
      i++; continue;
    }
    if (state === 'block') {
      if (ch === '*' && nx === '/') { state = 'code'; i += 2; continue; }
      i++; continue;
    }
    if (state === 'sq' || state === 'dq') {
      push(ch);
      if (ch === '\\') { if (i + 1 < n) push(src[i + 1]); i += 2; continue; }
      if ((state === 'sq' && ch === "'") || (state === 'dq' && ch === '"')) state = 'code';
      i++; continue;
    }
    if (state === 'tpl') {
      if (ch === '\\') { push(ch); if (i + 1 < n) push(src[i + 1]); i += 2; continue; }
      if (ch === '`') { push(ch); state = 'code'; i++; continue; }
      if (ch === '$' && nx === '{') { push('${'); stack.push('tpl'); state = 'code'; braceDepth = 0; i += 2; continue; }
      push(ch); i++; continue;
    }
    if (state === 'regex') {
      push(ch);
      if (ch === '\\') { if (i + 1 < n) push(src[i + 1]); i += 2; continue; }
      if (ch === '[') { state = 'rxclass'; i++; continue; }
      if (ch === '/') { state = 'code'; sig('/'); i++; continue; }
      i++; continue;
    }
    if (state === 'rxclass') {
      push(ch);
      if (ch === '\\') { if (i + 1 < n) push(src[i + 1]); i += 2; continue; }
      if (ch === ']') { state = 'regex'; i++; continue; }
      i++; continue;
    }

    // code state
    if (ch === '/' && nx === '/') { state = 'line'; i += 2; continue; }
    if (ch === '/' && nx === '*') { state = 'block'; i += 2; continue; }
    if (/\s/.test(ch)) { i++; continue; } // whitespace outside strings is insignificant
    if (ch === "'") { push(ch); state = 'sq'; i++; continue; }
    if (ch === '"') { push(ch); state = 'dq'; i++; continue; }
    if (ch === '`') { push(ch); state = 'tpl'; i++; continue; }
    if (ch === '/') {
      if (regexAllowed()) { push(ch); state = 'regex'; i++; continue; }
      push(ch); sig('/'); i++; continue;
    }
    if (ch === '{') { push(ch); sig(ch); if (stack.length) braceDepth++; i++; continue; }
    if (ch === '}') {
      if (stack.length && braceDepth === 0) { stack.pop(); push(ch); state = 'tpl'; i++; continue; }
      if (stack.length) braceDepth--;
      push(ch); sig(ch); i++; continue;
    }
    push(ch); sig(ch); i++;
  }
  return out.join('').trim();
}

function header(block) {
  return [
    `// GENERATED by scripts/extract.mjs — logic pinned to source (status: parity).`,
    `// Source: ${SOURCE_REPO}/${SOURCE_FILE} @ ${SOURCE_SHA} (lines ${block.from}-${block.to})`,
    `// Code must stay identical to the app; comments may differ (normalizeLogic comparison).`,
    ``,
  ].join('\n');
}

function render(block, lines) {
  const body = lines.slice(block.from - 1, block.to).join('\n').replace(/\s+$/, '');
  const parts = [header(block)];
  for (const imp of block.imports || []) {
    parts.push(`import { ${imp.names.join(', ')} } from '${imp.from}';`);
  }
  if (block.imports?.length) parts.push('');
  parts.push(body, '');
  parts.push(`export { ${block.exports.join(', ')} };`, '');
  return parts.join('\n');
}

async function main() {
  const check = process.argv.includes('--check');
  const url = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_SHA}/${SOURCE_FILE}`;
  const res = await fetch(url);
  if (!res.ok) { console.error(`fetch failed: HTTP ${res.status} (${url})`); process.exit(1); }
  const text = await res.text();
  const srcHash = sha256(text);
  if (srcHash !== SOURCE_SHA256) {
    console.error(`SOURCE MISMATCH: sha256 ${srcHash} != pinned ${SOURCE_SHA256}`);
    console.error('The source file drifted from the audited revision. Review and re-pin deliberately.');
    process.exit(1);
  }
  const lines = text.split('\n');

  const manifestPath = join(ROOT, 'EXTRACT_MANIFEST.json');
  const prevManifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : { generated: {} };

  const manifest = {
    version: 2,
    source: { repo: SOURCE_REPO, file: SOURCE_FILE, sha: SOURCE_SHA, sha256: SOURCE_SHA256 },
    generated: {},
  };
  const problems = [];
  let nParity = 0, nMaint = 0;

  for (const block of BLOCKS) {
    const rel = `src/${block.out}`;
    const abs = join(ROOT, rel);
    if (block.status === 'parity') {
      nParity++;
      const expected = render(block, lines);
      if (!existsSync(abs)) {
        if (check) problems.push(`MISSING: ${rel}`);
        else { writeFileSync(abs, expected); console.log(`wrote ${rel} (${expected.length} B)`); }
      } else {
        const actual = readFileSync(abs, 'utf8');
        if (normalizeLogic(actual) !== normalizeLogic(expected)) {
          problems.push(`LOGIC DRIFT: ${rel} (code differs from source @ ${SOURCE_SHA.slice(0, 7)} lines ${block.from}-${block.to})`);
        }
      }
      manifest.generated[rel] = { status: 'parity', lines: [block.from, block.to] };
    } else {
      nMaint++;
      if (!existsSync(abs)) { problems.push(`MISSING maintained module: ${rel} — restore from git history`); continue; }
      const actualHash = sha256(readFileSync(abs, 'utf8'));
      manifest.generated[rel] = { status: 'maintained', lines: [block.from, block.to], sha256: actualHash, note: block.note };
      if (check) {
        const prev = prevManifest.generated?.[rel];
        if (!prev || prev.status !== 'maintained' || prev.sha256 !== actualHash) {
          problems.push(`MANIFEST STALE: ${rel} — run: node scripts/extract.mjs`);
        }
      }
    }
  }
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';

  if (check) {
    if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestText) {
      problems.push('MANIFEST DRIFT: EXTRACT_MANIFEST.json — run: node scripts/extract.mjs');
    }
    // unexpected extra files in src/ (hand-written modules are allowed:
    // arkmap.js, index.js, graph.js, transports.js, arkadia-transports.js,
    // waypoints.js, diff.js, search-index.js, render-svg.js, render-png.js, locale.js)
    const allowed = new Set(BLOCKS.map(b => b.out)
      .concat(['arkmap.js', 'index.js', 'graph.js', 'transports.js', 'arkadia-transports.js',
               'waypoints.js', 'diff.js', 'search-index.js', 'render-svg.js', 'render-png.js', 'locale.js']));
    for (const f of readdirSync(join(ROOT, 'src'))) {
      if (!allowed.has(f)) problems.push(`UNEXPECTED: src/${f}`);
    }
    if (problems.length) {
      for (const p of problems) console.error(p);
      console.error(`parity check FAILED (${problems.length} problem(s))`);
      process.exit(1);
    }
    console.log(`parity check OK — ${nParity} logic-parity + ${nMaint} maintained modules, source @ ${SOURCE_SHA.slice(0, 7)}`);
    return;
  }

  if (problems.length) {
    for (const p of problems) console.error(p);
    console.error('extract refused — fix the problems above first');
    process.exit(1);
  }
  writeFileSync(manifestPath, manifestText);
  console.log('wrote EXTRACT_MANIFEST.json');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) await main();

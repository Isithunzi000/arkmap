# arkmap

**arkmap** is a toolkit for MUD map files in JavaScript — Node.js and the
browser. It provides full support for Mudlet's native binary map format
(`.dat` — read, write, convert both ways) and acts as a bridge to **`.arkmap`**
— this project's own JSON map format for MUD games. `.arkmap` is not a Mudlet
format; it keeps everything `.dat` carries and adds what `.dat` cannot
express. On top of plain I/O the toolkit adds structural validation, canonical
deterministic serialization, and content-integrity checksums (XXH3-64, `v4`).

Zero dependencies. ESM only. Node ≥ 18 and modern browsers.

```
npm install arkmap
```

```js
import { loadArkmap, saveArkmap, datToArkmap, arkmapToDat, validate } from 'arkmap';

// .arkmap (text/JSON)
const { map, validation, checksums } = loadArkmap(fileText);
if (!validation.ok) console.error(validation.errors);

// Mudlet .dat (binary) — full pipelines
const mapFromDat = datToArkmap(arrayBuffer);   // .dat -> arkmap map object
const datBytes   = arkmapToDat(map);           // arkmap map object -> .dat Uint8Array

// write back .arkmap (canonical, deterministic, with checksums)
const text = saveArkmap(map);
```

## Demo viewer

**Try it now, no install: [isithunzi000.github.io/arkmap](https://isithunzi000.github.io/arkmap/)**
— a zero-build viewer that runs entirely on this package, in your browser.

Drag & drop a `.dat` / `.arkmap` file (or pass `?src=<url>`) and you get:

- the map fitted to the window on open, with per-area / per-level navigation,
  a geographic minimap (click/drag pan) and a zoom bar with cursor-anchored
  wheel zoom and a live zoom ratio,
- validation and checksum status — including per-line transport integrity,
- room search with jump & highlight and a room info panel,
- cross-area exits drawn as arrows colored by the target environment, with
  the target area name — double-click an arrow (or a room with a single
  cross-area exit) to jump straight to that area and room,
- map labels from the file (styled text and original Mudlet pixmaps),
  rendered under/above the rooms exactly as stored,
- multi-waypoint route planning on `arkmap/graph` (Dijkstra/A*, direction
  filters, transport modes) with a schematic route overview, fit-route and
  gen-3 `arkmap:` route codes (live export / paste import) via
  `arkmap/waypoints`,
- true-vector SVG / PNG export of the current view via `arkmap/render-svg`,
  with a native save-as dialog (typed filename) where the browser supports
  it — arrows and map labels included.

The viewer's source is a single hand-written `docs/index.html` — a practical
example of building a full map app on the package with zero dependencies.

## The .arkmap format

`.arkmap` is our own JSON map format for MUD games (introduced by ArkMap
Studio, specified openly): areas, rooms, exits, doors, labels, custom exit
lines, environments, user data, and transport lines — everything the native
Mudlet `.dat` carries, plus things `.dat` cannot express.

Why use it instead of raw `.dat`:

- **Integrity built in** — every file can carry canonical XXH3-64 checksums
  (`v4`) over the whole file, every area, every room, and `meta`; tampering or
  corruption is detectable per-room, not just "file won't load".
- **Deterministic** — canonical key ordering and serialization mean the same
  map always produces the same bytes: diffs, reviews, and version control work.
- **Text, not binary** — inspectable in any editor, diffable in git, parseable
  by every language with a JSON parser.
- **Extensible** — `meta` and `user_data` fields carry data the `.dat` format
  has no place for, without breaking anything.
- **Routing data on board** — named transport lines (`transports`) with
  per-line integrity sums ride inside the map file; `.dat` cannot express them.
- **Faithful bridge** — `.dat` → `.arkmap` conversion is lossless, so the
  binary world and the JSON world stay in sync.

Full format documentation (maintained alongside ArkMap Studio):

- [`.arkmap` format specification — rendered](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/arkmap_spec.html)
- [specification source](https://github.com/Isithunzi000/arkadia-web_standalone-arkmap_studio/blob/main/docs/arkmap_spec.html)

## The toolkit

### Repository layout

```
src/            library modules (constants, codecs, validation, checksums, converters, graph/routing, transports, waypoints, diff)
scripts/        extract.mjs (module pipeline), run-tests.mjs, build-demo.mjs
tests/          node:test suites + golden fixtures and oracle vectors
docs/           demo viewer (GitHub Pages) + prebuilt browser bundle
EXTRACT_MANIFEST.json   module build manifest
```

### Commands

| command | what it does |
|---|---|
| `npm test` | run the test suites (checksum oracle vectors, round-trips) |
| `npm run parity` | regenerate `src/` in memory and fail on any drift from the manifest |
| `npm run extract` | regenerate `src/` modules per the manifest |

### API

#### .arkmap I/O

| function | description |
|---|---|
| `loadArkmap(text)` | parse + validate; returns `{ map, validation, checksums }`; throws on invalid JSON / non-map JSON |
| `saveArkmap(map)` | canonical `.arkmap` text (deep-cloned, sorted, checksums refreshed); deterministic |
| `createEmptyMap(name?)` | minimal map object that passes `validate()` |
| `stableStringify(value)` | deterministic JSON (sorted keys) — the canonical form primitive |

#### Mudlet .dat I/O

| function | description |
|---|---|
| `datToArkmap(arrayBuffer)` | full pipeline: `.dat` bytes → arkmap map (throws on unsupported version) |
| `arkmapToDat(map)` | full pipeline: arkmap map → `.dat` bytes (`Uint8Array`) |
| `readMudletDat(arrayBuffer)` | low-level: raw Mudlet dat structure |
| `writeMudletDat(rawDat)` | low-level: raw structure → bytes |

The `.dat` codec reads binary versions 17–22 and writes v20 — the version
current Mudlet itself writes. Note that `.dat` is the poorer format: arkmap
checksums and `meta` fields have no `.dat` counterpart. Converting
`.arkmap` → `.dat` keeps everything `.dat` can express; `.dat` → `.arkmap` is
lossless.

#### Validation & integrity

| function | description |
|---|---|
| `validate(map, opts?)` | structural validation → `{ ok, errors[], warnings[] }`; errors carry `{ path, code, msg }` — `code` is stable/machine-readable, `msg` follows `opts.locale` (see [Internationalization](#internationalization)) |
| `addChecksums(map)` | compute and attach v4 checksums (in place) |
| `verifyChecksums(map)` | verify → `{ ok, fileOk, metaOk, badAreas[], badRooms[], ... }` |
| `checkSuppressorsInMap(map)` | data-quality lint: missing custom-line suppressors |

#### Constants

`FORMAT` (`'arkmap'`) · `FORMAT_VERSION` (`2`) · `CHECKSUM_ALG` (`'v4'`) ·
`MUDLET_DAT_READ_MAX` (`22`) · `MUDLET_DAT_WRITE_VERSION` (`20`) ·
`DIRS`, `DIR_BY_SHORT`, `DIR_BY_LONG`, `DIR_BY_IDX` ·
`DOOR_INT`, `DOOR_STR` · `LINE_INT`, `LINE_STR`

#### Arkadia layer

Game-specific data for the Arkadia MUD is available under the `arkmap/arkadia`
subpath — kept out of the universal root API:

```js
import { ARKADIA_ENVS, ARKADIA_SYMBOLS, envPaletteList, isArkadiaMap } from 'arkmap/arkadia';
```

#### Graph & routing

Room graph over a map: indexing, adjacency, weighted routing (Dijkstra / A*),
direction filters, locked exits, transport hops, multi-waypoint planning and
room search. Available from the root and under the `arkmap/graph` subpath.
Pure and stateless — same input, same output.

Edge weight semantics follow Mudlet: a positive `exit_weights[dir]` wins;
otherwise the step costs `max(targetRoom.weight, 1)` (default 1).

| function | description |
|---|---|
| `buildIndex(map)` | room lookup: `Map(roomId → { room, areaId, areaName })` (duplicate ids: last wins) |
| `edgeWeight(room, dir, targetRoom)` | weight of one exit per the semantics above |
| `neighborsOf(room, idx?)` | adjacency `[[targetId, weight], …]` — `exits` + `special_exits` (special wins on duplicate target); pass `idx` for full weight semantics |
| `findPath(fromId, toId, idx)` | shortest path (Dijkstra, default weights) as `[roomId, …]`; `[fromId]` when start = end; `null` for unknown ids / unreachable |
| `findRoute(fromId, toId, idx, opts?)` | full router → `{ path, hops }`. `opts`: `algorithm` (`'dijkstra'` \| `'astar'`), `dirMode` (`'all'` \| `'cardinal'` \| `'vertical'` — cardinal = compass exits, vertical = compass + up/down), `avoidLocked` (default `true`), `isLocked(room)` override, `transportMode` (`'off'` \| `'normal'` \| `'aggressive'`), `transports` (a document), `transportEdges` (prebuilt), `extraEdges` (ad-hoc virtual edges). `hops[i]` is transport metadata for step `i → i+1` or `null` for walking. Transports force Dijkstra (the A* heuristic is inadmissible over hops) |
| `planRoute(waypoints, idx, opts?)` | route through consecutive waypoints → `{ legs: [{ from, to, path, hops } \| null], totalSteps, complete }` |
| `countSpecialSteps(path, idx)` | how many steps of a path use `special_exits` |
| `searchRooms(query, map, limit = 25)` | digits or `#id` → exact id match; otherwise case-insensitive substring on `room.name` (region is the name suffix, so region search works); map order, cut at `limit` |

```js
import { buildIndex, findRoute, searchRooms } from 'arkmap/graph';

const idx = buildIndex(map);
const hit = searchRooms('karczma', map)[0];
const { path, hops } = findRoute(currentRoomId, hit.room.id, idx, {
  algorithm: 'astar',
  dirMode: 'cardinal',
  transportMode: 'normal',
  transports: map.transports,          // optional: embedded transport lines
});
```

#### Transports

Transport lines (ships, coaches, portals — anything that moves you between
non-adjacent rooms) use the universal **`arkmap-transports` v1** format, valid
for any map and any MUD. A document can be embedded in a map file as the
top-level `map.transports` field or kept as a sidecar JSON:

```jsonc
{
  "format": "arkmap-transports",
  "version": 1,
  "lines": [
    {
      "name": "Wyzima - Novigrad ferry",   // unique — lines are keyed by name
      "board": ["wsiadz na statek"],        // boarding commands (aliases)
      "exit": "zejdz ze statku",            // disembark command
      "legs": [                             // ordered — the ride sequence
        { "from": 729, "to": 3760, "time": 23, "label": "Bialy Most" }
      ]
    }
  ]
}
```

Line order in the array is not semantic (canonical form sorts by name); leg
order **is** semantic. `time` is in seconds; when omitted, costing assumes
`TRANSPORT_DEFAULT_TIME` (60). Hop cost = `Σ times · ratio + boarding penalty`
— one penalty per ride, so a direct crossing beats transfers
(`normal`: 30 / 0.5, `aggressive`: 10 / 0.1).

**Integrity.** Like rooms and areas, transports can carry canonical XXH3-64
checksums — a whole-document hash plus one per line
(`map.checksums.transports = { hash, lines }`), so verification pinpoints
exactly which line was tampered with, added, or removed. Transport sums are
reported separately from map-data sums (auxiliary routing data, same class as
`meta`).

| function | description |
|---|---|
| `validateTransports(doc)` | schema validation → `{ ok, errors[] }` with exact paths |
| `normalizeTransports(raw)` | compact tuple format (`[name, board[], exitCmd, [[from,to,time,label],…]]`, used by Arkadia community data) → standard document |
| `addTransportChecksums(map)` | sign `map.transports` into `map.checksums.transports` (in place); re-signing after removal clears orphan sums |
| `verifyTransportChecksums(map)` | verify → `{ present, ok, unsigned?, hashOk, badLines[], missingLines[], extraLines[] }`; never throws |
| `buildTransportEdges(doc, idx, { mode })` | virtual edges for the router: `Map(roomId → [{ to, cost, hop }])`; chains stop at rooms missing from the map |

Available from the root and under the `arkmap/transports` subpath. Arkadia's
own transport lines ship as data under `arkmap/arkadia/transports`:

```js
import { ARKADIA_TRANSPORTS } from 'arkmap/arkadia/transports';
import { buildIndex, findRoute } from 'arkmap';

const idx = buildIndex(map);
const route = findRoute(a, b, idx, { transportMode: 'normal', transports: ARKADIA_TRANSPORTS });
```

#### Waypoint route codes

Waypoint lists travel between tools as compact text codes —
`arkmap:<algo><dir><trans>:<ids CSV>:<crc8>` — carrying the routing options
alongside the room ids:

```
arkmap:dwp:2188,1998,729:16990e69
       │││   │               └─ integrity crc (see below)
       │││   └─ waypoints: canonical CSV of room ids
       ││└─ transports: p = off, n = normal, g = aggressive
       │└── directions: k = cardinal, p = +vertical, w = all
       └─── algorithm: d = Dijkstra, a = A*
```

Universal (any map, any MUD), fully lowercase and **case-insensitive** on
decode, fail-closed on corruption, hard-capped (`WP_MAX` = 200 waypoints,
`ROUTE_CODE_MAX` = 64 000 chars). The trailing `crc8` — first 8 hex chars of
xxh3-64 over the lowercased `arkmap:<flags>:<ids>` core — catches accidental
damage when a code is pasted around (typos, truncation, mangled characters);
it is an integrity check, not a security feature. Older code generations
(`ARKMAP:`/`ARKMAP2:`, base64 payloads) are rejected by design — no backward
compatibility. Available from the root and under the `arkmap/waypoints`
subpath.

| function | description |
|---|---|
| `encodeRoute(waypoints, opts?)` | `[id, null, id, …]` + `{ algorithm, dirMode, transportMode }` → code string, or `''` when unencodable (never produces a code the decoder would reject) |
| `decodeRoute(code, hasRoom?)` | → `{ ids, valid, invalidCount, total, algorithm, dirMode, transportMode }`; `null` on structural corruption; `{ error: 'crc', expected, actual }` on checksum mismatch; `{ error: 'too-many', max, total }` over the waypoint limit. `hasRoom(id)` (e.g. `id => idx.has(id)`) splits ids into `valid` / `invalidCount` |

```js
import { encodeRoute, decodeRoute } from 'arkmap/waypoints';

const code = encodeRoute([729, 3760, 10313], { algorithm: 'astar', dirMode: 'all', transportMode: 'normal' });
// 'arkmap:awn:729,3760,10313:…' — paste-safe, shareable

const d = decodeRoute(code, id => idx.has(id));
if (d && !d.error) console.log(d.valid, d.algorithm, d.dirMode, d.transportMode);
```

#### Map diff

`diffMaps(srcMap, dstMap)` compares two maps and returns a list of **edit
operations** that turn the first map into the second: *what* changed
(`ADD_ROOM`, `DELETE_EXIT`, `EDIT_LABEL`, `PAINT_BATCH`, … — 20 op types
covering areas, rooms, exits, moves, env colors, custom lines and labels),
*where* (room/area ids), and the *before/after* state where reverting matters.
The list is **topologically ordered**, so applying the ops top to bottom never
breaks references (e.g. rooms are added before exits can point at them, areas
are deleted last). Each op carries a human-readable `label`
(English by default; pass `{ locale: 'pl' }` for Polish labels byte-identical
to ArkMap Studio's history panel — see [Internationalization](#internationalization)). Universal — works on any arkmap-shaped maps,
any MUD. Available from the root and under the `arkmap/diff` subpath.

```js
import { diffMaps } from 'arkmap/diff';

const { entries, stats, overlap, srcRooms, dstRooms } = diffMaps(oldMap, newMap);
// entries — ordered, deterministic ops; each carries a human-readable `label`
//           (English default; { locale: 'pl' } for Studio-pinned Polish)
// stats   — per-op-type counts
// overlap — room-id kinship ratio 0..1: a low value warns you are probably
//           diffing two unrelated maps
```

Semantics worth knowing:

- **Canonical comparison** — the same map loaded from `.dat` and `.arkmap`
  produces an *empty* diff (defaults stripped, array fields sorted).
- **Cascading deletes** — deleting a room also trims exits pointing at it, so
  no separate `DELETE_EXIT` ops appear for those.
- **Move cycles** — swapping two rooms' positions breaks the collision cycle
  with one `EDIT_ROOM` fallback, then the rest resolves as `MOVE_ROOM`.
- **Deterministic** — same input pair, byte-identical output.

#### Edit deltas (.arkdelta)

`.arkdelta` is the edit-delta format of ArkMap Studio: an ordered op log
(25 op types) cut against a base map, with canonical XXH3-64 integrity
checksums and optional Ed25519 author signatures. The package ships the
**reader** (fail-closed validation, signature verification, base identity —
`arkmap/delta-validate`) and the **writer** (delta build, deterministic
compaction, op serialization — `arkmap/delta-build`). Both are also exported
from the root.

| function | description |
|---|---|
| `validateDeltaText(text, opts?)` | parse + validate → `{ ok, errors[], codes[], delta? }`; never throws; `errors` follow `opts.locale`, `codes` are stable machine names |
| `verifyDeltaSignature(delta)` | async Ed25519 verification → `{ state: 'unsigned' \| 'claimed' \| 'ok' \| 'bad', ... }`; never refuses the load |
| `computeBaseInfo(map, precomputed?)` | base-map identity for `meta.base` comparison → `{ crc, version?, revision?, areas }` |
| `deltaChecksums(meta, ops)` | canonical integrity sums `{ file, ops[] }` |
| `buildDelta(log, base, opts?)` | op log (the shape `diffMaps` returns) → `.arkdelta` file text; sid `d:N` allocation, compaction, checksums |
| `serializeDeltaOps(ops, base, opts?)` | ready ops → `.arkdelta` file text (fresh meta + checksums) |
| `DELTA_EXPORTABLE` | the 25 op types a delta can carry |

Constants: `ARKDELTA_FORMAT` (`'arkdelta'`) · `ARKDELTA_FORMAT_VERSION` (`3`) ·
`ARKDELTA_MAX_OPS` (`5000`) · `ARKDELTA_MAX_BYTES` (8 MiB).

```js
import { validateDeltaText, verifyDeltaSignature } from 'arkmap/delta-validate';

const res = validateDeltaText(text);            // English messages
const resPl = validateDeltaText(text, { locale: 'pl' }); // Studio-pinned Polish
if (res.ok) {
  const sig = await verifyDeltaSignature(res.delta);
  console.log(sig.state); // 'unsigned' | 'claimed' | 'ok' | 'bad'
}
```

Validation is **fail-closed**: unknown top-level/op keys, bad checksums,
out-of-sequence ops, unresolved `d:N` symbolic ids and prototype-polluting
keys all refuse the load. Polish messages are byte-identical to ArkMap
Studio's validator, so Studio can adopt this package with zero user-visible
change (see [Internationalization](#internationalization)).

The writer is **deterministic**: same log and base, byte-identical file.
Compaction (spec §8) folds redundant chains (edit→edit, add→edit, add→delete,
paint merges) without changing the applied result. Op labels are copied from
the log entries — produce them with `diffMaps(a, b, { locale: 'pl' })` for a
Polish delta. The round trip is closed: `validateDeltaText(buildDelta(log, base))`
always validates.

#### Token-indexed room search

`buildSearchIndex(map)` precomputes a **token index** (lowercase word → room
ids, separately for room-name and area-name hits); `searchIndexed(index,
query, limit = 25)` answers queries without rescanning the map. Scoring is
parity with ArkMap Studio's planner search: each query word found in the room
name = 2 points, in the area name = 1 point, a room whose id equals the
numeric query = 999; results sort by score desc with stable map-order
tie-breaks, cut at `limit`. Universal — any arkmap-shaped map, any MUD.
Available from the root and under the `arkmap/search-index` subpath.

```js
import { buildSearchIndex, searchIndexed } from 'arkmap/search-index';

const idx = buildSearchIndex(map);            // build once, query many times
searchIndexed(idx, 'karczma smok');           // multi-word: intersect, cumulative score
// -> [{ roomId, name, areaName, score }, ...]
```

#### Vector rendering (SVG / PNG)

`renderSvg(map, opts)` renders a map to a **true-vector SVG string** — no
raster inside. Scope filters (`areaId`, `z`), env colors (same resolution
chain as the demo viewer), exits with undirected dedup, arrowheads colored by
the target environment for exits leading to a known room outside the scope
(plain stubs for unknown targets), optional room-name labels, optional map
labels (`mapLabels: true` — styled text and pixmap images from `area.labels`,
honouring `show_on_top` and the `z` filter), route overlays (walking segments
solid, transport hops dashed) and waypoint markers. Fully deterministic: same
input, byte-identical SVG. Available from the root and under the
`arkmap/render-svg` subpath.

`svgToPng(svg, { scale = 2 })` rasterizes such a self-contained SVG to a PNG
`Blob` in the **browser** (Blob URL → `<img>` → canvas → `toBlob`; the canvas
stays untainted because the SVG has no external references). Available from
the root and under the `arkmap/render-png` subpath.

`renderPng(map, opts)` is the one-call convenience — `renderSvg(map, opts)` +
`svgToPng` with the same options (everything above, arrows and map labels
included) plus `pngScale` (default 2). PNG output therefore carries exactly
what the SVG would. Same module, same browser-only rule.

```js
import { renderSvg } from 'arkmap/render-svg';
import { svgToPng, renderPng } from 'arkmap/render-png';

const svg = renderSvg(map, {
  areaId: 'all', z: null,
  mapLabels: true,                                 // text + pixmap area labels
  routes: [{ path, hops }],                        // optional overlay
  markers: [{ id: 2188, color: '#60a5fa', label: '1' }],
});
const pngBlob = await svgToPng(svg, { scale: 2 }); // browser only
const samePng = await renderPng(map, { areaId: 'all', mapLabels: true, pngScale: 2 });
```

## Testing & guarantees

The package is tested against real Arkadia MUD maps in both formats —
[`.arkmap`](https://github.com/Isithunzi000/arkadia-web_standalone-arkmap_studio/blob/mapa/map_master3.arkmap)
and
[`.dat`](https://github.com/Isithunzi000/arkadia-web_standalone-arkmap_studio/blob/mapa/map_master3.dat)
(~27,000 rooms): full round-trip conversions in both directions, checksum
verification against an external oracle, deterministic-save guarantees and the
graph suite (pathfinding/search properties on golden fixtures and synthetic
edge cases) all run in CI on Node 18/20/22.

The Arkadia map data originates from the community crowd-mapping project at
[Delwing/arkadia-mapa](https://github.com/Delwing/arkadia-mapa).

File signing (identity registry) is intentionally out of scope; files written
by this package are unsigned. Signed files can still be read and their
checksums verified.

## Internationalization

The package is English-first: all code, comments and default output are
English. Polish is available for **user-facing output** via message catalogs
(`src/locale.js`, exported as `LOCALES`).

- **Opt-in per call, no global state.** Pass `{ locale: 'pl' }` as the options
  argument; anything else (including no options) yields English.
  `resolveLocale(locale)` maps only the exact string `'pl'` to Polish and
  everything else to English.
- **`diffMaps(src, dst, { locale: 'pl' })`** — op `label`s in Polish,
  byte-identical to ArkMap Studio's history panel (including correct Polish
  plural forms via `plural()`).
- **`validate(map, { locale: 'pl' })`** — error/warning `msg` in Polish. The
  error shape is `{ path, code, msg }`: `code` is a stable machine-readable
  identifier (e.g. `INVALID_DIRECTION`, `TARGET_NOT_FOUND`) independent of the
  locale, `msg` is the localized rendering.
- **`.dat` import errors** (`datToArkmap`, `readMudletDat`) always throw
  English messages with a machine `code` property (`DAT_TRUNCATED`,
  `DAT_NEGATIVE_COUNT`, `DAT_UNSUPPORTED_VERSION`) — parser errors are
  developer-facing, not end-user output.
- `translate(key, params, locale)` resolves a catalog key with `{param}`
  substitution (PL falls back to EN for missing keys; an unknown EN key
  throws). `plural(locale, n, formsKey)` implements CLDR plural rules
  (Polish one/few/many, English one/other).

## License

MIT © Isithunzi000

# arkmap

**arkmap** is a toolkit for working with MUD maps in JavaScript — Node.js and
the browser. It reads, writes, validates, and converts between the two map
formats used in the Mudlet ecosystem: the binary Mudlet `.dat` and the JSON
`.arkmap` format. On top of plain I/O it adds structural validation, canonical
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

## The .arkmap format

`.arkmap` is a JSON map format for Mudlet-style maps: areas, rooms, exits,
doors, labels, custom exit lines, environments, and user data — everything the
binary `.dat` carries, plus things `.dat` cannot express.

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
- **Faithful bridge** — `.dat` → `.arkmap` conversion is lossless, so the
  binary world and the JSON world stay in sync.

Full format documentation (maintained alongside ArkMap Studio):

- [`.arkmap` format specification — rendered](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/arkmap_spec.html)
- [specification source](https://github.com/Isithunzi000/arkadia-web_standalone-arkmap_studio/blob/main/docs/arkmap_spec.html)

## The toolkit

### Repository layout

```
src/            library modules (constants, codecs, validation, checksums, converters, graph)
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
| `validate(map)` | structural validation → `{ ok, errors[], warnings[] }` (errors carry `path` + `msg`) |
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

### Demo viewer

A zero-build demo viewer (drag & drop a `.dat` / `.arkmap`, per-area and
per-level navigation, validation and checksum status, fit-to-window button,
room search with jump & highlight, and two-field Start/End route planning on
top of `arkmap/graph`) lives in `docs/` and on
[GitHub Pages](https://isithunzi000.github.io/arkmap/).

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

## License

MIT © Isithunzi000

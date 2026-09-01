# arkmap

Mudlet map toolkit for the web and Node.js. Read, write, validate, and convert
Mudlet `.dat` maps and the `.arkmap` JSON format — with canonical checksums
(XXH3-64, `v4`) for content integrity.

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

The `.dat` codec is generic Mudlet (binary versions 17–22 read, v20 written).
This package is the reference implementation of the `.arkmap` format; it is
tested against Arkadia maps, and the format itself is game-agnostic — issues
with maps from other MUDs are welcome.

## Format specification

The full `.arkmap` format specification is maintained in the ArkMap Studio
repository (single source of truth):

- [`.arkmap` format specification](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/arkmap_spec.html)
  (rendered; [source](https://github.com/Isithunzi000/arkadia-web_standalone-arkmap_studio/blob/main/docs/arkmap_spec.html))
- [User manual](https://isithunzi000.github.io/arkadia-web_standalone-arkmap_studio/docs/arkmap_manual.html)

## API

### .arkmap I/O

| function | description |
|---|---|
| `loadArkmap(text)` | parse + validate; returns `{ map, validation, checksums }`; throws on invalid JSON / non-map JSON |
| `saveArkmap(map)` | canonical `.arkmap` text (deep-cloned, sorted, checksums refreshed); deterministic |
| `createEmptyMap(name?)` | minimal map object that passes `validate()` |
| `stableStringify(value)` | deterministic JSON (sorted keys) — the canonical form primitive |

### Mudlet .dat I/O

| function | description |
|---|---|
| `datToArkmap(arrayBuffer)` | full pipeline: `.dat` bytes → arkmap map (throws on unsupported version) |
| `arkmapToDat(map)` | full pipeline: arkmap map → `.dat` bytes (`Uint8Array`) |
| `readMudletDat(arrayBuffer)` | low-level: raw Mudlet dat structure |
| `writeMudletDat(rawDat)` | low-level: raw structure → bytes |

Note: `.dat` is the poorer format — arkmap checksums and `meta` fields have no
`.dat` counterpart. Converting `.arkmap` → `.dat` keeps everything `.dat` can
express; converting `.dat` → `.arkmap` is lossless.

### Validation & integrity

| function | description |
|---|---|
| `validate(map)` | structural validation → `{ ok, errors[], warnings[] }` (errors carry `path` + `msg`) |
| `addChecksums(map)` | compute and attach v4 checksums (in place) |
| `verifyChecksums(map)` | verify → `{ ok, fileOk, metaOk, badAreas[], badRooms[], ... }` |
| `checkSuppressorsInMap(map)` | data-quality lint: missing custom-line suppressors |

### Constants

`FORMAT` (`'arkmap'`) · `FORMAT_VERSION` (`2`) · `CHECKSUM_ALG` (`'v4'`) ·
`MUDLET_DAT_READ_MAX` (`22`) · `MUDLET_DAT_WRITE_VERSION` (`20`) ·
`DIRS`, `DIR_BY_SHORT`, `DIR_BY_LONG`, `DIR_BY_IDX` ·
`DOOR_INT`, `DOOR_STR` · `LINE_INT`, `LINE_STR`

### Arkadia layer

Game-specific data for the Arkadia MUD is available under the `arkmap/arkadia`
subpath — kept out of the universal root API:

```js
import { ARKADIA_ENVS, ARKADIA_SYMBOLS, envPaletteList, isArkadiaMap } from 'arkmap/arkadia';
```

## Provenance & guarantees

All format logic is extracted **byte-verbatim** from
[ArkMap Studio](https://github.com/Isithunzi000/arkadia-web_standalone-arkmap_studio)
(the single-file app is the source of truth) by `scripts/extract.mjs`, pinned to
a specific source commit. `npm run parity` regenerates the modules in memory and
fails on any drift — see `EXTRACT_MANIFEST.json`. Only the thin I/O wrappers in
`src/arkmap.js` and `src/index.js` are package-specific code.

File signing (identity registry) is intentionally out of scope; files written by
this package are unsigned. Signed files can still be read and their checksums
verified.

## License

MIT © Isithunzi000

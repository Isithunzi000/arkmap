// arkmap — public API (root entry: universal format I/O).
// Arkadia-specific data lives under the 'arkmap/arkadia' subpath.

// .arkmap I/O
export { loadArkmap, saveArkmap, createEmptyMap } from './arkmap.js';

// Mudlet .dat I/O — high-level converters (full pipelines) and low-level codec
export { datToArkmap } from './dat-to-arkmap.js';   // ArrayBuffer -> arkmap map
export { arkmapToDat } from './arkmap-to-dat.js';   // arkmap map -> Uint8Array
export {
  readMudletDat, writeMudletDat,
  MUDLET_DAT_MAX_SUPPORTED_VERSION as MUDLET_DAT_READ_MAX,
  MUDLET_DAT_WRITE_VERSION,
} from './mudlet-dat.js';

// validation & integrity
export { validate } from './validate.js';
export { addChecksums, verifyChecksums } from './checksum.js';
export { checkSuppressorsInMap } from './suppressors.js';

// canonical serialization primitive (deterministic JSON)
export { stableStringify } from './stable-stringify.js';

// Arkadia detection (data layer lives in 'arkmap/arkadia')
export { isArkadiaMap } from './arkadia.js';

// format constants
export {
  FORMAT, FORMAT_VERSION,
  DIRS, DIR_BY_SHORT, DIR_BY_LONG, DIR_BY_IDX,
  DOOR_INT, DOOR_STR, LINE_INT, LINE_STR,
} from './constants.js';

// room graph: indexing, adjacency, routing (Dijkstra/A*, direction filters,
// transports, locked exits), multi-waypoint planning, room search
export {
  buildIndex, edgeWeight, neighborsOf,
  findPath, findRoute, planRoute, countSpecialSteps, searchRooms,
} from './graph.js';

// universal transport lines: schema validation, integrity (per-line sums),
// routing-edge construction; tuple normalization for community data sources
export {
  TRANSPORT_BOARDING_PENALTY, TRANSPORT_TIME_RATIO, TRANSPORT_DEFAULT_TIME,
  TRANSPORTS_FORMAT, TRANSPORTS_VERSION,
  validateTransports, normalizeTransports,
  addTransportChecksums, verifyTransportChecksums, buildTransportEdges,
} from './transports.js';

// waypoint route codes (ARKMAP2) — universal import/export for any map
export {
  ROUTE_CODE_PREFIX, ROUTE_CODE_MAX, WP_MAX, encodeRoute, decodeRoute,
} from './waypoints.js';

// universal map diff — ordered arkdelta-style op list between two maps
export { diffMaps } from './diff.js';

/** Checksum algorithm version implemented by this package ('v4' = XXH3-64 canonical). */
export const CHECKSUM_ALG = 'v4';

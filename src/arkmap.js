// arkmap.js — hand-written core of the package: .arkmap load/save + map factory.
// This is the ONLY module that is not byte-verbatim from arkmap_studio.html;
// its logic mirrors the app's loadArkmap/saveArkmap minus UI glue (toasts,
// dialogs, state). Signing (identity registry) is intentionally out of scope.

import { FORMAT, FORMAT_VERSION } from './constants.js';
import { validate } from './validate.js';
import { addChecksums, verifyChecksums, _stripRoomDefaults } from './checksum.js';
import { _canonicalizeMapForSave } from './canonicalize.js';
import { stableStringify } from './stable-stringify.js';
import { addTransportChecksums } from './transports.js';

/**
 * Parse and validate .arkmap file text.
 * @param {string} text raw file content
 * @returns {{ map: object, validation: object, checksums: object }}
 *   validation: result of validate(); checksums: verifyChecksums() result
 *   or { present: false } when the file carries no checksums.
 * @throws {SyntaxError} invalid JSON; {Error} valid JSON but not a map object
 */
export function loadArkmap(text) {
  const map = JSON.parse(text);
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new Error('arkmap: valid JSON but not a map object');
  }
  const validation = validate(map);
  const checksums = map.checksums?.file ? verifyChecksums(map) : { present: false };
  return { map, validation, checksums };
}

/**
 * Serialize a map object to canonical .arkmap file text.
 * The map is NOT mutated — serialization works on a deep clone:
 * canonicalize (sort areas/rooms/labels) → strip room defaults → add checksums
 * (rooms/areas/meta, plus per-line transport sums when the map embeds a
 * map.transports document) → stableStringify. Output is byte-deterministic
 * for identical input.
 * @param {object} map
 * @returns {string}
 */
export function saveArkmap(map) {
  const clone = JSON.parse(JSON.stringify(map));
  _canonicalizeMapForSave(clone);
  for (const area of clone.areas || []) {
    for (const room of area.rooms || []) _stripRoomDefaults(room);
  }
  addChecksums(clone);          // rebuilds the checksums envelope from scratch
  if (clone.transports) addTransportChecksums(clone);   // then signs transports into it
  return stableStringify(clone);
}

/**
 * Create a minimal map that passes validate() with zero errors.
 * Font defaults follow Qt (QFont::Normal == weight 50).
 * @param {string} [name='New map']
 * @returns {object}
 */
export function createEmptyMap(name = 'New map') {
  return {
    format: FORMAT,
    format_version: FORMAT_VERSION,
    meta: {
      map_name: name,
      symbol_font: {
        family: '', point_size: 0, pixel_size: 0, style_hint: 0,
        weight: 50, style_setting: false, underline: false,
        strike_out: false, fixed_pitch: false,
      },
      symbol_font_fudge_factor: 1,
      use_only_map_font: false,
    },
    colors: {},
    areas: [],
  };
}

// MAINTAINED module — forked from the generated extraction; logic has deliberately
// diverged from the source app, so scripts/extract.mjs no longer rewrites this file.
// Origin: Isithunzi000/arkadia-web_standalone-arkmap_studio/arkmap_studio.html @ 24bd9022895753779758e5c58286565c76d85d19 (lines 4434-4798)
// Divergence: error shape { path, code, msg } with machine codes resolved from locale.js
// catalogs (opts.locale, EN default); EN special-exit warning + import of locale.js (H0.3+H0.5).

import { DIR_BY_SHORT, FORMAT, FORMAT_VERSION, LINE_INT } from './constants.js';
import { translate } from './locale.js';

// ── validate.js ──

// errors carry { path, code, msg } — code is stable/machine-readable, msg follows opts.locale
function err(path, code, loc, params) { return { path, code, msg: translate('val.' + code, params, loc) }; }

const VALID_DIRS = new Set(Object.keys(DIR_BY_SHORT)); // n,ne,e,se,s,sw,w,nw,up,down,in,out

function isRGB(v) {
  if (!Array.isArray(v) || (v.length !== 3 && v.length !== 4)) return false;
  return v.every(c => Number.isInteger(c) && c >= 0 && c <= 255);
}

function validateFont(font, path, errors, loc) {
  if (typeof font !== 'object' || font === null) {
    errors.push(err(path, 'MUST_BE_OBJECT', loc));
    return;
  }
  if (typeof font.family !== 'string')     errors.push(err(`${path}.family`, 'MUST_BE_STRING', loc));
  if (typeof font.point_size !== 'number') errors.push(err(`${path}.point_size`, 'MUST_BE_NUMBER', loc));
  if (typeof font.pixel_size !== 'number') errors.push(err(`${path}.pixel_size`, 'MUST_BE_NUMBER', loc));
  if (!Number.isInteger(font.style_hint))  errors.push(err(`${path}.style_hint`, 'MUST_BE_INTEGER', loc));
  if (!Number.isInteger(font.weight))      errors.push(err(`${path}.weight`, 'MUST_BE_INTEGER', loc));
  for (const k of ['style_setting', 'underline', 'strike_out', 'fixed_pitch']) {
    if (typeof font[k] !== 'boolean') errors.push(err(`${path}.${k}`, 'MUST_BE_BOOLEAN', loc));
  }
}

function validateLabel(label, path, errors, loc) {
  if (typeof label !== 'object' || label === null) {
    errors.push(err(path, 'MUST_BE_OBJECT', loc));
    return;
  }
  if (!Number.isInteger(label.id))        errors.push(err(`${path}.id`, 'MUST_BE_INTEGER', loc));
  // audit ext F2.11: isFinite instead of typeof — NaN/Infinity do not pass (message unchanged)
  if (!Number.isFinite(label.x))          errors.push(err(`${path}.x`, 'MUST_BE_NUMBER', loc));
  if (!Number.isFinite(label.y))          errors.push(err(`${path}.y`, 'MUST_BE_NUMBER', loc));
  if (!Number.isInteger(label.z))         errors.push(err(`${path}.z`, 'MUST_BE_INTEGER', loc));
  if (!Number.isFinite(label.width))      errors.push(err(`${path}.width`, 'MUST_BE_NUMBER', loc));
  if (!Number.isFinite(label.height))     errors.push(err(`${path}.height`, 'MUST_BE_NUMBER', loc));
  if (typeof label.text !== 'string')     errors.push(err(`${path}.text`, 'MUST_BE_STRING', loc));
  if (!isRGB(label.fg_color))             errors.push(err(`${path}.fg_color`, 'MUST_BE_RGB', loc));
  if (!isRGB(label.bg_color))             errors.push(err(`${path}.bg_color`, 'MUST_BE_RGB', loc));
  if (label.no_scaling  !== undefined && typeof label.no_scaling  !== 'boolean')
    errors.push(err(`${path}.no_scaling`, 'MUST_BE_BOOLEAN', loc));
  if (label.show_on_top !== undefined && typeof label.show_on_top !== 'boolean')
    errors.push(err(`${path}.show_on_top`, 'MUST_BE_BOOLEAN', loc));
  if (label.pixmap !== undefined && label.pixmap !== null && typeof label.pixmap !== 'string')
    errors.push(err(`${path}.pixmap`, 'MUST_BE_STRING_OR_NULL', loc));
  // audit T4/S3: base64 validity and size — a controlled error at import instead of crashing in atob at export
  if (typeof label.pixmap === 'string' && label.pixmap.length) {
    if (label.pixmap.length > 4194304) errors.push(err(`${path}.pixmap`, 'PIXMAP_TOO_LARGE', loc));
    else { try { atob(label.pixmap); } catch (e) { errors.push(err(`${path}.pixmap`, 'MUST_BE_BASE64', loc)); } }
  }
}

function validateUserData(ud, path, errors, loc) {
  if (typeof ud !== 'object' || ud === null || Array.isArray(ud)) {
    errors.push(err(path, 'MUST_BE_OBJECT', loc));
    return;
  }
  for (const [k, v] of Object.entries(ud)) {
    if (typeof k !== 'string' || typeof v !== 'string')
      errors.push(err(path, 'USER_DATA_STRING_DICT', loc));
  }
}

function validateRoom(room, path, errors, warnings = [], loc) {
  if (typeof room !== 'object' || room === null) {
    errors.push(err(path, 'MUST_BE_OBJECT', loc));
    return undefined;
  }
  if (!Number.isInteger(room.id)) errors.push(err(`${path}.id`, 'MUST_BE_INTEGER', loc));
  for (const ax of ['x', 'y', 'z']) {
    if (!Number.isInteger(room[ax])) errors.push(err(`${path}.${ax}`, 'MUST_BE_INTEGER', loc));
  }
  if (!Number.isInteger(room.env)) errors.push(err(`${path}.env`, 'MUST_BE_INTEGER', loc));
  if (room.hidden !== undefined && typeof room.hidden !== 'boolean') errors.push(err(`${path}.hidden`, 'MUST_BE_BOOLEAN', loc));  // audyt T3/W4

  const exits        = room.exits               || {};
  const stubs        = room.stubs               || [];
  const doors        = room.doors               || {};
  const exitWeights  = room.exit_weights        || {};
  const exitLocks    = room.exit_locks          || [];
  const specialExits = room.special_exits       || {};
  const specialLocks = room.special_exit_locks  || [];

  // Type guards for optional object/array fields
  const _doorsOk = room.doors === undefined || (typeof room.doors === 'object' && room.doors !== null && !Array.isArray(room.doors));
  const _ewOk    = room.exit_weights === undefined || (typeof room.exit_weights === 'object' && room.exit_weights !== null && !Array.isArray(room.exit_weights));
  const _clOk    = room.custom_lines === undefined || (typeof room.custom_lines === 'object' && room.custom_lines !== null && !Array.isArray(room.custom_lines));
  const _selOk   = room.special_exit_locks === undefined || Array.isArray(room.special_exit_locks);
  if (!_doorsOk) errors.push(err(`${path}.doors`, 'MUST_BE_OBJECT', loc));
  if (!_ewOk)    errors.push(err(`${path}.exit_weights`, 'MUST_BE_OBJECT', loc));
  if (!_clOk)    errors.push(err(`${path}.custom_lines`, 'MUST_BE_OBJECT', loc));
  if (!_selOk)   errors.push(err(`${path}.special_exit_locks`, 'MUST_BE_ARRAY', loc));

  // exits: values must be integers
  if (room.exits !== undefined) {
    if (typeof room.exits !== 'object' || Array.isArray(room.exits)) {
      errors.push(err(`${path}.exits`, 'MUST_BE_OBJECT', loc));
    } else {
      for (const [dir, targetId] of Object.entries(exits)) {
        if (!VALID_DIRS.has(dir))
          errors.push(err(`${path}.exits.${dir}`, 'INVALID_DIRECTION', loc, { dir }));
        if (!Number.isInteger(targetId))
          errors.push(err(`${path}.exits.${dir}`, 'TARGET_MUST_BE_INTEGER', loc));
      }
    }
  }

  // stubs: array of valid SHORT direction strings, no overlap with exits
  if (room.stubs !== undefined) {
    if (!Array.isArray(room.stubs)) {
      errors.push(err(`${path}.stubs`, 'MUST_BE_ARRAY', loc));
    } else {
      const seen = new Set();
      for (const d of stubs) {
        if (!VALID_DIRS.has(d)) errors.push(err(`${path}.stubs`, 'INVALID_DIRECTION', loc, { dir: d }));
        if (seen.has(d)) errors.push(err(`${path}.stubs`, 'DUPLICATE_DIRECTION', loc, { dir: d }));
        seen.add(d);
        // stubs may coexist with exits (Mudlet allows this)
      }
    }
  }

  // exit_locks: array of valid SHORT direction strings, keys must be in exits
  if (room.exit_locks !== undefined) {
    if (!Array.isArray(room.exit_locks)) {
      errors.push(err(`${path}.exit_locks`, 'MUST_BE_ARRAY', loc));
    } else {
      const seen = new Set();
      for (const d of exitLocks) {
        if (!VALID_DIRS.has(d)) errors.push(err(`${path}.exit_locks`, 'INVALID_DIRECTION', loc, { dir: d }));
        if (seen.has(d)) errors.push(err(`${path}.exit_locks`, 'DUPLICATE_DIRECTION', loc, { dir: d }));
        seen.add(d);
        // an exit_lock may concern a direction outside exits (Mudlet allows this)
      }
    }
  }

  // special_exits: must be object; keys must be non-empty strings; values must be integers
  if (room.special_exits !== undefined) {
    if (typeof room.special_exits !== 'object' || Array.isArray(room.special_exits)) {
      errors.push(err(`${path}.special_exits`, 'MUST_BE_OBJECT', loc));
    } else {
      for (const [cmd, targetId] of Object.entries(specialExits)) {
        if (typeof cmd !== 'string' || cmd.trim() === '')
          errors.push(err(`${path}.special_exits`, 'SPECIAL_EXIT_CMD_NONEMPTY', loc));
        if (!Number.isInteger(targetId))
          errors.push(err(`${path}.special_exits.${cmd||'(empty)'}`, 'TARGET_MUST_BE_INTEGER', loc));
        if (VALID_DIRS.has(cmd) && exits[cmd] !== undefined)
          warnings.push(err(`${path}.special_exits.${cmd}`, 'SPECIAL_EXIT_OVERLAPS_EXIT', loc, { cmd }));
      }
    }
  }

  // exit_weights: keys must be in exits OR special_exits (Mudlet allows weights on special exits too)
  // values must be integer >= 1
  if (_ewOk) for (const d of Object.keys(exitWeights)) {
    if (exits[d] === undefined && specialExits[d] === undefined)
      errors.push(err(`${path}.exit_weights.${d}`, 'NOT_IN_EXITS', loc));
    if (!Number.isInteger(exitWeights[d]) || exitWeights[d] < 1)
      errors.push(err(`${path}.exit_weights.${d}`, 'MUST_BE_POSITIVE_INTEGER', loc));
  }

  // doors: keys must be in exits, stubs, or special_exits; valid string values
  if (_doorsOk) for (const d of Object.keys(doors)) {
    // doors may be in directions outside exits/stubs/special_exits (Mudlet allows this)
    if (!['open', 'closed', 'locked'].includes(doors[d]))
      errors.push(err(`${path}.doors.${d}`, 'INVALID_DOOR_VALUE', loc));
  }

  // special_exit_locks: commands must be in special_exits
  if (_selOk) for (const cmd of specialLocks) {
    if (specialExits[cmd] === undefined)
      errors.push(err(`${path}.special_exit_locks`, 'NOT_IN_SPECIAL_EXITS', loc, { cmd }));
  }

  // custom_lines: keys in exits or special_exits; points array ([] = exit suppressor); valid style/color
  const customLines = room.custom_lines || {};
  if (_clOk) for (const [d, cl] of Object.entries(customLines)) {
    if (typeof cl !== 'object' || cl === null) {
      errors.push(err(`${path}.custom_lines.${d}`, 'MUST_BE_OBJECT', loc));
      continue;
    }
    if (!Array.isArray(cl.points))
      errors.push(err(`${path}.custom_lines.${d}.points`, 'MUST_BE_ARRAY', loc)); // [] = exit suppressor
    else if (cl.points.length > 0) {
      for (let pi = 0; pi < cl.points.length; pi++) {
        const pt = cl.points[pi];
        // audit ext F2.11: isFinite — NaN/Infinity in a CL point rejected
        if (!Array.isArray(pt) || pt.length !== 2 || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1]))
          errors.push(err(`${path}.custom_lines.${d}.points[${pi}]`, 'MUST_BE_COORD_PAIR', loc));
      }
    }
    if (cl.color !== undefined && !isRGB(cl.color))
      errors.push(err(`${path}.custom_lines.${d}.color`, 'MUST_BE_RGB', loc));
    if (cl.style !== undefined && LINE_INT[cl.style] === undefined)
      errors.push(err(`${path}.custom_lines.${d}.style`, 'INVALID_CL_STYLE', loc));
    // SPEC rule 7: key must be in exits or special_exits (can be special exit command)
    if (exits[d] === undefined && specialExits[d] === undefined)
      errors.push(err(`${path}.custom_lines.${d}`, 'KEY_NOT_IN_EXITS', loc));
  }

  if (room.weight !== undefined && (!Number.isInteger(room.weight) || room.weight < 1))
    errors.push(err(`${path}.weight`, 'MUST_BE_POSITIVE_INTEGER', loc));
  if (room.name !== undefined && typeof room.name !== 'string')
    errors.push(err(`${path}.name`, 'MUST_BE_STRING', loc));
  if (room.symbol !== undefined && typeof room.symbol !== 'string')
    errors.push(err(`${path}.symbol`, 'MUST_BE_STRING', loc));
  if (room.locked !== undefined && typeof room.locked !== 'boolean')
    errors.push(err(`${path}.locked`, 'MUST_BE_BOOLEAN', loc));

  if (room.tags !== undefined) {
    if (!Array.isArray(room.tags)) errors.push(err(`${path}.tags`, 'MUST_BE_ARRAY', loc));
    else if (!room.tags.every(t => typeof t === 'string'))
      errors.push(err(`${path}.tags`, 'ELEMENTS_MUST_BE_STRINGS', loc));
  }

  if (room.notes !== undefined && typeof room.notes !== 'string')
    errors.push(err(`${path}.notes`, 'MUST_BE_STRING', loc));

  if (room.user_data !== undefined) validateUserData(room.user_data, `${path}.user_data`, errors, loc);

  return room.id;
}

function validateArea(area, path, errors, warnings = [], loc) {
  if (typeof area !== 'object' || area === null) {
    errors.push(err(path, 'MUST_BE_OBJECT', loc));
    return [];
  }
  if (!Number.isInteger(area.id))      errors.push(err(`${path}.id`, 'MUST_BE_INTEGER', loc));
  if (typeof area.name !== 'string')   errors.push(err(`${path}.name`, 'MUST_BE_STRING', loc));
  if (!Array.isArray(area.rooms))      errors.push(err(`${path}.rooms`, 'MUST_BE_ARRAY', loc));

  if (area.grid_mode    !== undefined && typeof area.grid_mode    !== 'boolean')
    errors.push(err(`${path}.grid_mode`, 'MUST_BE_BOOLEAN', loc));
  if (area.is_zone      !== undefined && typeof area.is_zone      !== 'boolean')
    errors.push(err(`${path}.is_zone`, 'MUST_BE_BOOLEAN', loc));
  if (area.zone_area_ref !== undefined && !Number.isInteger(area.zone_area_ref))
    errors.push(err(`${path}.zone_area_ref`, 'MUST_BE_INTEGER', loc));
  if (area.pos !== undefined && (!Array.isArray(area.pos) || area.pos.length !== 3 || !area.pos.every(Number.isInteger)))
    errors.push(err(`${path}.pos`, 'MUST_BE_POS3', loc));
  if (area.user_data    !== undefined) validateUserData(area.user_data, `${path}.user_data`, errors, loc);

  // audit T4/S2: an object instead of an array used to pass silently (loop over undefined.length)
  if (area.labels !== undefined && !Array.isArray(area.labels)) errors.push(err(`${path}.labels`, 'MUST_BE_ARRAY', loc));
  for (let i = 0; i < (Array.isArray(area.labels) ? area.labels : []).length; i++) {
    validateLabel(area.labels[i], `${path}.labels[${i}]`, errors, loc);
  }
  // Check label ID uniqueness within area
  const labelIds = new Set();
  for (const lbl of (Array.isArray(area.labels) ? area.labels : [])) {  // audit T4/S2
    if (lbl && Number.isInteger(lbl.id)) {
      if (labelIds.has(lbl.id)) errors.push(err(`${path}.labels`, 'DUPLICATE_LABEL_ID', loc, { id: lbl.id }));
      labelIds.add(lbl.id);
    }
  }

  const roomIds = [];
  for (let i = 0; i < (area.rooms || []).length; i++) {
    const id = validateRoom(area.rooms[i], `${path}.rooms[${i}]`, errors, warnings, loc);
    if (id !== undefined) roomIds.push(id);
  }
  return roomIds;
}

function validate(map, opts) {
  const loc = opts && opts.locale;
  const errors = [];
  const warnings = [];

  if (map.format !== FORMAT)  errors.push(err('format', 'INVALID_FORMAT', loc, { expected: FORMAT }));
  if (map.format_version !== FORMAT_VERSION) errors.push(err('format_version', 'INVALID_FORMAT_VERSION', loc, { expected: FORMAT_VERSION }));

  // meta: required object
  if (map.meta === undefined || map.meta === null) {
    errors.push(err('meta', 'REQUIRED', loc));
  } else {
    if (typeof map.meta !== 'object' || Array.isArray(map.meta))
      errors.push(err('meta', 'MUST_BE_OBJECT', loc));
    else {
      const meta = map.meta;
      if (typeof meta.map_name !== 'string')
        errors.push(err('meta.map_name', 'MUST_BE_STRING', loc));
      if (meta.symbol_font === undefined)
        errors.push(err('meta.symbol_font', 'REQUIRED', loc));
      else
        validateFont(meta.symbol_font, 'meta.symbol_font', errors, loc);
      if (typeof meta.symbol_font_fudge_factor !== 'number')
        errors.push(err('meta.symbol_font_fudge_factor', 'MUST_BE_NUMBER', loc));
      if (typeof meta.use_only_map_font !== 'boolean')
        errors.push(err('meta.use_only_map_font', 'MUST_BE_BOOLEAN', loc));
      if (meta.room_id_hash !== undefined) {
        if (typeof meta.room_id_hash !== 'object' || meta.room_id_hash === null || Array.isArray(meta.room_id_hash))
          errors.push(err('meta.room_id_hash', 'ROOM_ID_HASH_MUST_BE_OBJECT', loc));
        else
          for (const [k, v] of Object.entries(meta.room_id_hash))
            if (!Number.isInteger(v)) errors.push(err(`meta.room_id_hash.${k}`, 'MUST_BE_INTEGER', loc));
      }
      if (meta.user_data !== undefined)
        validateUserData(meta.user_data, 'meta.user_data', errors, loc);
    }
  }

  // colors: required object
  if (map.colors === undefined || map.colors === null) {
    errors.push(err('colors', 'REQUIRED', loc));
  } else if (typeof map.colors !== 'object' || Array.isArray(map.colors)) {
    errors.push(err('colors', 'MUST_BE_OBJECT', loc));
  } else {
    const colors = map.colors;
    for (const [k, v] of Object.entries(colors.env_colors || {})) {
      if (!Number.isInteger(v) || v < 0 || v > 255)
        errors.push(err(`colors.env_colors.${k}`, 'MUST_BE_BYTE', loc));
    }
    for (const [k, v] of Object.entries(colors.custom_env_colors || {})) {
      if (!isRGB(v)) errors.push(err(`colors.custom_env_colors.${k}`, 'MUST_BE_RGBA', loc));
    }
  }

  // areas: required array
  if (!Array.isArray(map.areas)) {
    errors.push(err('areas', 'MUST_BE_ARRAY', loc));
    return { ok: false, errors, warnings };
  }

  const allAreaIds = new Set();
  const allRoomIds = new Set();

  for (let i = 0; i < map.areas.length; i++) {
    const area = map.areas[i];
    const path = `areas[${i}]`;
    if (allAreaIds.has(area?.id)) errors.push(err(path, 'DUPLICATE_AREA_ID', loc, { id: area.id }));
    allAreaIds.add(area?.id);

    const roomIds = validateArea(area, path, errors, warnings, loc);
    for (const id of roomIds) {
      if (allRoomIds.has(id)) errors.push(err(path, 'DUPLICATE_ROOM_ID', loc, { id }));
      allRoomIds.add(id);
    }
  }

  // cross-reference exits
  for (const area of map.areas) {
    if (!area?.rooms) continue;
    for (const room of area.rooms) {
      if (!room || !Number.isInteger(room.id)) continue;
      const path = `room[${room.id}]`;
      for (const [dir, targetId] of Object.entries(room.exits || {})) {
        if (!allRoomIds.has(targetId))
          errors.push(err(`${path}.exits.${dir}`, 'TARGET_NOT_FOUND', loc, { targetId }));
      }
      for (const [cmd, targetId] of Object.entries(room.special_exits || {})) {
        if (!Number.isInteger(targetId))
          errors.push(err(`${path}.special_exits.${cmd}`, 'TARGET_MUST_BE_INTEGER_GOT', loc, { targetId }));
        else if (!allRoomIds.has(targetId))
          errors.push(err(`${path}.special_exits.${cmd}`, 'TARGET_NOT_FOUND', loc, { targetId }));
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export { validate };

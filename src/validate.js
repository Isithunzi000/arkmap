// MAINTAINED module — forked from the generated extraction; logic has deliberately
// diverged from the source app, so scripts/extract.mjs no longer rewrites this file.
// Origin: Isithunzi000/arkadia-web_standalone-arkmap_studio/arkmap_studio.html @ 24bd9022895753779758e5c58286565c76d85d19 (lines 4434-4798)
// Divergence: EN warning + error code for special-exit/direction overlap; err() accepts optional code (H0.3).

import { DIR_BY_SHORT, FORMAT, FORMAT_VERSION, LINE_INT } from './constants.js';

// ── validate.js ──

function err(path, msg, code) { const e = { path, msg }; if (code !== undefined) e.code = code; return e; }

const VALID_DIRS = new Set(Object.keys(DIR_BY_SHORT)); // n,ne,e,se,s,sw,w,nw,up,down,in,out

function isRGB(v) {
  if (!Array.isArray(v) || (v.length !== 3 && v.length !== 4)) return false;
  return v.every(c => Number.isInteger(c) && c >= 0 && c <= 255);
}

function validateFont(font, path, errors) {
  if (typeof font !== 'object' || font === null) {
    errors.push(err(path, 'must be an object'));
    return;
  }
  if (typeof font.family !== 'string')     errors.push(err(`${path}.family`,      'must be string'));
  if (typeof font.point_size !== 'number') errors.push(err(`${path}.point_size`,  'must be number'));
  if (typeof font.pixel_size !== 'number') errors.push(err(`${path}.pixel_size`,  'must be number'));
  if (!Number.isInteger(font.style_hint))  errors.push(err(`${path}.style_hint`,  'must be integer'));
  if (!Number.isInteger(font.weight))      errors.push(err(`${path}.weight`,      'must be integer'));
  for (const k of ['style_setting', 'underline', 'strike_out', 'fixed_pitch']) {
    if (typeof font[k] !== 'boolean') errors.push(err(`${path}.${k}`, 'must be boolean'));
  }
}

function validateLabel(label, path, errors) {
  if (typeof label !== 'object' || label === null) {
    errors.push(err(path, 'must be an object'));
    return;
  }
  if (!Number.isInteger(label.id))        errors.push(err(`${path}.id`,     'must be integer'));
  // audyt ext F2.11: isFinite zamiast typeof — NaN/Infinity nie przechodza (komunikat bez zmian)
  if (!Number.isFinite(label.x))          errors.push(err(`${path}.x`,      'must be number'));
  if (!Number.isFinite(label.y))          errors.push(err(`${path}.y`,      'must be number'));
  if (!Number.isInteger(label.z))         errors.push(err(`${path}.z`,      'must be integer'));
  if (!Number.isFinite(label.width))      errors.push(err(`${path}.width`,  'must be number'));
  if (!Number.isFinite(label.height))     errors.push(err(`${path}.height`, 'must be number'));
  if (typeof label.text !== 'string')     errors.push(err(`${path}.text`,   'must be string'));
  if (!isRGB(label.fg_color))             errors.push(err(`${path}.fg_color`, 'must be [r,g,b] 0-255'));
  if (!isRGB(label.bg_color))             errors.push(err(`${path}.bg_color`, 'must be [r,g,b] 0-255'));
  if (label.no_scaling  !== undefined && typeof label.no_scaling  !== 'boolean')
    errors.push(err(`${path}.no_scaling`,  'must be boolean'));
  if (label.show_on_top !== undefined && typeof label.show_on_top !== 'boolean')
    errors.push(err(`${path}.show_on_top`, 'must be boolean'));
  if (label.pixmap !== undefined && label.pixmap !== null && typeof label.pixmap !== 'string')
    errors.push(err(`${path}.pixmap`, 'must be string or null'));
  // audyt T4/S3: poprawnosc base64 i rozmiar — kontrolowany blad przy imporcie zamiast wywalenia w atob przy eksporcie
  if (typeof label.pixmap === 'string' && label.pixmap.length) {
    if (label.pixmap.length > 4194304) errors.push(err(`${path}.pixmap`, 'too large (limit 4 MB base64)'));
    else { try { atob(label.pixmap); } catch (e) { errors.push(err(`${path}.pixmap`, 'must be valid base64')); } }
  }
}

function validateUserData(ud, path, errors) {
  if (typeof ud !== 'object' || ud === null || Array.isArray(ud)) {
    errors.push(err(path, 'must be an object'));
    return;
  }
  for (const [k, v] of Object.entries(ud)) {
    if (typeof k !== 'string' || typeof v !== 'string')
      errors.push(err(path, 'keys and values must be strings'));
  }
}

function validateRoom(room, path, errors, warnings = []) {
  if (typeof room !== 'object' || room === null) {
    errors.push(err(path, 'must be an object'));
    return undefined;
  }
  if (!Number.isInteger(room.id)) errors.push(err(`${path}.id`, 'must be integer'));
  for (const ax of ['x', 'y', 'z']) {
    if (!Number.isInteger(room[ax])) errors.push(err(`${path}.${ax}`, 'must be integer'));
  }
  if (!Number.isInteger(room.env)) errors.push(err(`${path}.env`, 'must be integer'));
  if (room.hidden !== undefined && typeof room.hidden !== 'boolean') errors.push(err(`${path}.hidden`, 'must be boolean'));  // audyt T3/W4

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
  if (!_doorsOk) errors.push(err(`${path}.doors`, 'must be an object'));
  if (!_ewOk)    errors.push(err(`${path}.exit_weights`, 'must be an object'));
  if (!_clOk)    errors.push(err(`${path}.custom_lines`, 'must be an object'));
  if (!_selOk)   errors.push(err(`${path}.special_exit_locks`, 'must be an array'));

  // exits: values must be integers
  if (room.exits !== undefined) {
    if (typeof room.exits !== 'object' || Array.isArray(room.exits)) {
      errors.push(err(`${path}.exits`, 'must be an object'));
    } else {
      for (const [dir, targetId] of Object.entries(exits)) {
        if (!VALID_DIRS.has(dir))
          errors.push(err(`${path}.exits.${dir}`, `"${dir}" is not a valid direction`));
        if (!Number.isInteger(targetId))
          errors.push(err(`${path}.exits.${dir}`, 'target must be integer roomId'));
      }
    }
  }

  // stubs: array of valid SHORT direction strings, no overlap with exits
  if (room.stubs !== undefined) {
    if (!Array.isArray(room.stubs)) {
      errors.push(err(`${path}.stubs`, 'must be array'));
    } else {
      const seen = new Set();
      for (const d of stubs) {
        if (!VALID_DIRS.has(d)) errors.push(err(`${path}.stubs`, `"${d}" is not a valid direction`));
        if (seen.has(d)) errors.push(err(`${path}.stubs`, `duplicate direction "${d}"`));
        seen.add(d);
        // stubs mogą współistnieć z exits (Mudlet to dopuszcza)
      }
    }
  }

  // exit_locks: array of valid SHORT direction strings, keys must be in exits
  if (room.exit_locks !== undefined) {
    if (!Array.isArray(room.exit_locks)) {
      errors.push(err(`${path}.exit_locks`, 'must be array'));
    } else {
      const seen = new Set();
      for (const d of exitLocks) {
        if (!VALID_DIRS.has(d)) errors.push(err(`${path}.exit_locks`, `"${d}" is not a valid direction`));
        if (seen.has(d)) errors.push(err(`${path}.exit_locks`, `duplicate direction "${d}"`));
        seen.add(d);
        // exit_lock może dotyczyć kierunku spoza exits (Mudlet to dopuszcza)
      }
    }
  }

  // special_exits: must be object; keys must be non-empty strings; values must be integers
  if (room.special_exits !== undefined) {
    if (typeof room.special_exits !== 'object' || Array.isArray(room.special_exits)) {
      errors.push(err(`${path}.special_exits`, 'must be an object'));
    } else {
      for (const [cmd, targetId] of Object.entries(specialExits)) {
        if (typeof cmd !== 'string' || cmd.trim() === '')
          errors.push(err(`${path}.special_exits`, 'command key must be a non-empty string'));
        if (!Number.isInteger(targetId))
          errors.push(err(`${path}.special_exits.${cmd||'(empty)'}`, 'target must be integer roomId'));
        if (VALID_DIRS.has(cmd) && exits[cmd] !== undefined)
          warnings.push(err(`${path}.special_exits.${cmd}`, `special exit command "${cmd}" duplicates a regular direction — doors, weights and custom lines share the same key, which can make the data ambiguous`, 'SPECIAL_EXIT_OVERLAPS_EXIT'));
      }
    }
  }

  // exit_weights: keys must be in exits OR special_exits (Mudlet allows weights on special exits too)
  // values must be integer >= 1
  if (_ewOk) for (const d of Object.keys(exitWeights)) {
    if (exits[d] === undefined && specialExits[d] === undefined)
      errors.push(err(`${path}.exit_weights.${d}`, 'not in exits or special_exits'));
    if (!Number.isInteger(exitWeights[d]) || exitWeights[d] < 1)
      errors.push(err(`${path}.exit_weights.${d}`, 'must be integer >= 1'));
  }

  // doors: keys must be in exits, stubs, or special_exits; valid string values
  if (_doorsOk) for (const d of Object.keys(doors)) {
    // drzwi mogą być w kierunkach spoza exits/stubs/special_exits (Mudlet to dopuszcza)
    if (!['open', 'closed', 'locked'].includes(doors[d]))
      errors.push(err(`${path}.doors.${d}`, 'must be "open", "closed", or "locked"'));
  }

  // special_exit_locks: commands must be in special_exits
  if (_selOk) for (const cmd of specialLocks) {
    if (specialExits[cmd] === undefined)
      errors.push(err(`${path}.special_exit_locks`, `"${cmd}" not in special_exits`));
  }

  // custom_lines: keys in exits or special_exits; points array ([] = exit suppressor); valid style/color
  const customLines = room.custom_lines || {};
  if (_clOk) for (const [d, cl] of Object.entries(customLines)) {
    if (typeof cl !== 'object' || cl === null) {
      errors.push(err(`${path}.custom_lines.${d}`, 'must be an object'));
      continue;
    }
    if (!Array.isArray(cl.points))
      errors.push(err(`${path}.custom_lines.${d}.points`, 'must be an array')); // [] = exit suppressor
    else if (cl.points.length > 0) {
      for (let pi = 0; pi < cl.points.length; pi++) {
        const pt = cl.points[pi];
        // audyt ext F2.11: isFinite — NaN/Infinity w punkcie CL odrzucone
        if (!Array.isArray(pt) || pt.length !== 2 || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1]))
          errors.push(err(`${path}.custom_lines.${d}.points[${pi}]`, 'must be [number, number]'));
      }
    }
    if (cl.color !== undefined && !isRGB(cl.color))
      errors.push(err(`${path}.custom_lines.${d}.color`, 'must be [r,g,b] 0-255'));
    if (cl.style !== undefined && LINE_INT[cl.style] === undefined)
      errors.push(err(`${path}.custom_lines.${d}.style`, 'invalid style'));
    // SPEC rule 7: key must be in exits or special_exits (can be special exit command)
    if (exits[d] === undefined && specialExits[d] === undefined)
      errors.push(err(`${path}.custom_lines.${d}`, 'key not in exits or special_exits'));
  }

  if (room.weight !== undefined && (!Number.isInteger(room.weight) || room.weight < 1))
    errors.push(err(`${path}.weight`, 'must be integer >= 1'));
  if (room.name !== undefined && typeof room.name !== 'string')
    errors.push(err(`${path}.name`, 'must be string'));
  if (room.symbol !== undefined && typeof room.symbol !== 'string')
    errors.push(err(`${path}.symbol`, 'must be string'));
  if (room.locked !== undefined && typeof room.locked !== 'boolean')
    errors.push(err(`${path}.locked`, 'must be boolean'));

  if (room.tags !== undefined) {
    if (!Array.isArray(room.tags)) errors.push(err(`${path}.tags`, 'must be array'));
    else if (!room.tags.every(t => typeof t === 'string'))
      errors.push(err(`${path}.tags`, 'all elements must be strings'));
  }

  if (room.notes !== undefined && typeof room.notes !== 'string')
    errors.push(err(`${path}.notes`, 'must be string'));

  if (room.user_data !== undefined) validateUserData(room.user_data, `${path}.user_data`, errors);

  return room.id;
}

function validateArea(area, path, errors, warnings = []) {
  if (typeof area !== 'object' || area === null) {
    errors.push(err(path, 'must be an object'));
    return [];
  }
  if (!Number.isInteger(area.id))      errors.push(err(`${path}.id`,   'must be integer'));
  if (typeof area.name !== 'string')   errors.push(err(`${path}.name`, 'must be string'));
  if (!Array.isArray(area.rooms))      errors.push(err(`${path}.rooms`, 'must be array'));

  if (area.grid_mode    !== undefined && typeof area.grid_mode    !== 'boolean')
    errors.push(err(`${path}.grid_mode`,    'must be boolean'));
  if (area.is_zone      !== undefined && typeof area.is_zone      !== 'boolean')
    errors.push(err(`${path}.is_zone`,      'must be boolean'));
  if (area.zone_area_ref !== undefined && !Number.isInteger(area.zone_area_ref))
    errors.push(err(`${path}.zone_area_ref`, 'must be integer'));
  if (area.pos !== undefined && (!Array.isArray(area.pos) || area.pos.length !== 3 || !area.pos.every(Number.isInteger)))
    errors.push(err(`${path}.pos`, 'must be an array of 3 integers'));
  if (area.user_data    !== undefined) validateUserData(area.user_data, `${path}.user_data`, errors);

  // audyt T4/S2: obiekt zamiast tablicy przechodzil cicho (petla po undefined.length)
  if (area.labels !== undefined && !Array.isArray(area.labels)) errors.push(err(`${path}.labels`, 'must be an array'));
  for (let i = 0; i < (Array.isArray(area.labels) ? area.labels : []).length; i++) {
    validateLabel(area.labels[i], `${path}.labels[${i}]`, errors);
  }
  // Check label ID uniqueness within area
  const labelIds = new Set();
  for (const lbl of (Array.isArray(area.labels) ? area.labels : [])) {  // audyt T4/S2
    if (lbl && Number.isInteger(lbl.id)) {
      if (labelIds.has(lbl.id)) errors.push(err(`${path}.labels`, `duplicate label id ${lbl.id}`));
      labelIds.add(lbl.id);
    }
  }

  const roomIds = [];
  for (let i = 0; i < (area.rooms || []).length; i++) {
    const id = validateRoom(area.rooms[i], `${path}.rooms[${i}]`, errors, warnings);
    if (id !== undefined) roomIds.push(id);
  }
  return roomIds;
}

function validate(map) {
  const errors = [];
  const warnings = [];

  if (map.format !== FORMAT)  errors.push(err('format',  `must be "${FORMAT}"`));
  if (map.format_version !== FORMAT_VERSION) errors.push(err('format_version', `must be ${FORMAT_VERSION}`));

  // meta: required object
  if (map.meta === undefined || map.meta === null) {
    errors.push(err('meta', 'required'));
  } else {
    if (typeof map.meta !== 'object' || Array.isArray(map.meta))
      errors.push(err('meta', 'must be an object'));
    else {
      const meta = map.meta;
      if (typeof meta.map_name !== 'string')
        errors.push(err('meta.map_name', 'must be string'));
      if (meta.symbol_font === undefined)
        errors.push(err('meta.symbol_font', 'required'));
      else
        validateFont(meta.symbol_font, 'meta.symbol_font', errors);
      if (typeof meta.symbol_font_fudge_factor !== 'number')
        errors.push(err('meta.symbol_font_fudge_factor', 'must be number'));
      if (typeof meta.use_only_map_font !== 'boolean')
        errors.push(err('meta.use_only_map_font', 'must be boolean'));
      if (meta.room_id_hash !== undefined) {
        if (typeof meta.room_id_hash !== 'object' || meta.room_id_hash === null || Array.isArray(meta.room_id_hash))
          errors.push(err('meta.room_id_hash', 'must be an object (contributor → starting room ID)'));
        else
          for (const [k, v] of Object.entries(meta.room_id_hash))
            if (!Number.isInteger(v)) errors.push(err(`meta.room_id_hash.${k}`, 'must be integer'));
      }
      if (meta.user_data !== undefined)
        validateUserData(meta.user_data, 'meta.user_data', errors);
    }
  }

  // colors: required object
  if (map.colors === undefined || map.colors === null) {
    errors.push(err('colors', 'required'));
  } else if (typeof map.colors !== 'object' || Array.isArray(map.colors)) {
    errors.push(err('colors', 'must be an object'));
  } else {
    const colors = map.colors;
    for (const [k, v] of Object.entries(colors.env_colors || {})) {
      if (!Number.isInteger(v) || v < 0 || v > 255)
        errors.push(err(`colors.env_colors.${k}`, 'must be integer 0-255'));
    }
    for (const [k, v] of Object.entries(colors.custom_env_colors || {})) {
      if (!isRGB(v)) errors.push(err(`colors.custom_env_colors.${k}`, 'must be [r,g,b] or [r,g,b,a]'));
    }
  }

  // areas: required array
  if (!Array.isArray(map.areas)) {
    errors.push(err('areas', 'must be array'));
    return { ok: false, errors, warnings };
  }

  const allAreaIds = new Set();
  const allRoomIds = new Set();

  for (let i = 0; i < map.areas.length; i++) {
    const area = map.areas[i];
    const path = `areas[${i}]`;
    if (allAreaIds.has(area?.id)) errors.push(err(path, `duplicate area id ${area.id}`));
    allAreaIds.add(area?.id);

    const roomIds = validateArea(area, path, errors, warnings);
    for (const id of roomIds) {
      if (allRoomIds.has(id)) errors.push(err(path, `duplicate room id ${id}`));
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
          errors.push(err(`${path}.exits.${dir}`, `target roomId ${targetId} does not exist`));
      }
      for (const [cmd, targetId] of Object.entries(room.special_exits || {})) {
        if (!Number.isInteger(targetId))
          errors.push(err(`${path}.special_exits.${cmd}`, `target must be integer roomId, got ${targetId}`));
        else if (!allRoomIds.has(targetId))
          errors.push(err(`${path}.special_exits.${cmd}`, `target roomId ${targetId} does not exist`));
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export { validate };

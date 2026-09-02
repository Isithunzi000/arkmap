// locale.js — message catalogs for all user-facing output of the package
// (diff op labels, validation messages, error strings). Hand-written module.
//
// English is the default locale; Polish is available via `locale: 'pl'`.
// Pure data + pure functions, no global state — sideEffects: false preserved.
//
// Catalog keys are namespaced: '<module>.<purpose>'. Values are either
// template strings with '{param}' placeholders, or plural-form objects
// ({ one, other } for English, { one, few, many } for Polish).
//
// Polish plural rules (CLDR): 1 → one; 2–4 (except 12–14) → few; else many.
// English plural rules: 1 → one; else other.
//
// PL output parity: Polish label templates match ArkMap Studio's undo-history
// labels byte-for-byte (including Studio's "Dodano CL" verb form next to the
// noun-style "Dodanie ..." labels), so Studio keeps its exact UI wording when
// it adopts this package. One deliberate deviation: 'diff.paintBatch' uses
// the grammatically correct 2–4 form "pokoje" — Studio prints "pokoi" for
// every n > 1 (grammar bug, fixed here on purpose).

const en = {
  // diffMaps op labels (undo-history style)
  'diff.delArea':        'Delete area "{name}"',
  'diff.addArea':        'Add area "{name}"',
  'diff.editArea':       'Edit area "{name}"',
  'diff.envColorSet':    'Change env {envId} color → rgb({rgb})',
  'diff.envColorReset':  'Restore default env {envId} color',
  'diff.delRoom':        'Delete room "{name}" (#{id})',
  'diff.addRoom':        'Add room "{name}" (#{id})',
  'diff.moveRoomToArea': 'Move room "{name}" (#{id}) to area "{areaName}"',
  'diff.editRoom':       'Edit room "{name}" (#{id})',
  'diff.delExit':        'Delete exit {dir} from #{id}',
  'diff.addExit':        'Add exit {dir} → #{target} (from #{id})',
  'diff.editExit':       'Edit exit {dir} in room "{name}" (#{id})',
  'diff.editExits':      'Edit exits in room "{name}" (#{id})',
  'diff.addSuppressor':  'Add empty custom line dir={dir} in room "{name}" (#{id})',
  'diff.addCL':          'Add CL dir={dir} in room "{name}" (#{id})',
  'diff.delSuppressor':  'Delete empty custom line dir={dir} in room "{name}" (#{id})',
  'diff.delCL':          'Delete CL dir={dir} in room "{name}" (#{id})',
  'diff.editCL':         'Edit CL dir={dir} in room "{name}" (#{id})',
  'diff.moveRoom':       'Move room "{name}" (#{id})',
  'diff.paintBatch':     'Recolor — {n} {rooms}',
  'diff.delLabel':       'Delete label "{name}" (#{id})',
  'diff.addLabel':       'Add label "{name}" (#{id})',
  'diff.editLabel':      'Edit label "{name}" (#{id})',
  'diff.resizeLabel':    'Resize label "{name}" (#{id})',
  'diff.moveLabel':      'Move label "{name}" (#{id})',
  // validate() messages ({path, code, msg} — code is stable, msg follows locale)
  'val.MUST_BE_OBJECT':              'must be an object',
  'val.MUST_BE_STRING':              'must be string',
  'val.MUST_BE_NUMBER':              'must be number',
  'val.MUST_BE_INTEGER':             'must be integer',
  'val.MUST_BE_BOOLEAN':             'must be boolean',
  'val.MUST_BE_RGB':                 'must be [r,g,b] 0-255',
  'val.MUST_BE_STRING_OR_NULL':      'must be string or null',
  'val.PIXMAP_TOO_LARGE':            'too large (limit 4 MB base64)',
  'val.MUST_BE_BASE64':              'must be valid base64',
  'val.USER_DATA_STRING_DICT':       'keys and values must be strings',
  'val.MUST_BE_ARRAY':               'must be an array',
  'val.SPECIAL_EXIT_CMD_NONEMPTY':   'command key must be a non-empty string',
  'val.TARGET_MUST_BE_INTEGER':      'target must be integer roomId',
  'val.NOT_IN_EXITS':                'not in exits or special_exits',
  'val.MUST_BE_POSITIVE_INTEGER':    'must be integer >= 1',
  'val.INVALID_DOOR_VALUE':          'must be "open", "closed", or "locked"',
  'val.MUST_BE_COORD_PAIR':          'must be [number, number]',
  'val.INVALID_CL_STYLE':            'invalid style',
  'val.KEY_NOT_IN_EXITS':            'key not in exits or special_exits',
  'val.ELEMENTS_MUST_BE_STRINGS':    'all elements must be strings',
  'val.MUST_BE_POS3':                'must be an array of 3 integers',
  'val.REQUIRED':                    'required',
  'val.ROOM_ID_HASH_MUST_BE_OBJECT': 'must be an object (contributor → starting room ID)',
  'val.MUST_BE_BYTE':                'must be integer 0-255',
  'val.MUST_BE_RGBA':                'must be [r,g,b] or [r,g,b,a]',
  'val.INVALID_DIRECTION':           '"{dir}" is not a valid direction',
  'val.DUPLICATE_DIRECTION':         'duplicate direction "{dir}"',
  'val.NOT_IN_SPECIAL_EXITS':        '"{cmd}" not in special_exits',
  'val.DUPLICATE_LABEL_ID':          'duplicate label id {id}',
  'val.INVALID_FORMAT':              'must be "{expected}"',
  'val.INVALID_FORMAT_VERSION':      'must be {expected}',
  'val.DUPLICATE_AREA_ID':           'duplicate area id {id}',
  'val.DUPLICATE_ROOM_ID':           'duplicate room id {id}',
  'val.TARGET_NOT_FOUND':            'target roomId {targetId} does not exist',
  'val.TARGET_MUST_BE_INTEGER_GOT':  'target must be integer roomId, got {targetId}',
  'val.SPECIAL_EXIT_OVERLAPS_EXIT':  'special exit command "{cmd}" duplicates a regular direction — doors, weights and custom lines share the same key, which can make the data ambiguous',
  // plural forms (objects, consumed by plural())
  'words.room':          { one: 'room', other: 'rooms' },
  // validateDeltaText() messages — .arkdelta reader ({ ok, errors, codes }:
  // errors follow opts.locale, codes are stable/machine-readable).
  // PL catalog below is byte-pinned to ArkMap Studio's validator wording.
  'dval.EMPTY_FILE':          'Empty file.',
  'dval.FILE_TOO_LARGE':      'File too large (limit {limitMB} MB).',
  'dval.PARSE_ERROR':         'Cannot read the file — corrupted or not a delta file.',
  'dval.NOT_ARKDELTA':        'This is not an .arkdelta file.',
  'dval.VERSION_MISSING':     'missing',
  'dval.UNSUPPORTED_VERSION': 'Unsupported delta format version: {version} (this version of ArkMap Studio supports: {supported}). Old-format deltas are not loaded — save the delta again from the change log or update ArkMap Studio. File was not loaded.',
  'dval.UNKNOWN_TOP_KEYS':    'The .arkdelta file contains fields outside the specification ({keys}). File was not loaded.',
  'dval.TOO_DEEP':            'structure nested too deeply.',
  'dval.CHECKSUM_MISMATCH':   'The .arkdelta file is corrupted{detail}. File was not loaded.',
  'dval.CHECKSUM_DETAIL_ONE': ' — operation #{seq} does not match its checksum',
  'dval.CHECKSUM_DETAIL_MANY': ' — operations {seqs} do not match their checksums',
  'dval.OPS_MISSING':         'File corrupted — missing operation list.',
  'dval.TOO_MANY_OPS':        'Too many operations (limit {limit}).',
  'dval.OPS_COUNT_MISMATCH':  'File corrupted — operation count in the header ({declared}) does not match the content ({actual}).',
  'dval.OP_TAG':              'operation #{seq}',
  'dval.OP_BAD_SHAPE':        'invalid shape.',
  'dval.OP_SEQ_ORDER':        'numbering is not sequential.',
  'dval.OP_UNKNOWN_TYPE':     'unknown operation type "{type}". File was not loaded.',
  'dval.OP_NO_TARGET':        'incomplete data (missing target).',
  'dval.OP_NO_PAYLOAD':       'incomplete data (missing payload).',
  'dval.OP_MISSING_FIELD':    'incomplete data (missing: {field}).',
  'dval.OP_INVALID_FIELD':    'invalid data (field: {field}).',
  'dval.OP_BAD_DIR':          'invalid direction "{dir}".',
  'dval.OP_TOO_DEEP':         'structure nested too deeply.',
  'dval.OP_FORBIDDEN_KEY':    'forbidden key "{key}".',
  'dval.OP_UNKNOWN_KEY':      'unknown field "{key}" — file does not come from this version of ArkMap Studio. File was not loaded.',
  'dval.OP_DUP_SID':          'duplicate delta identifier ({sid}).',
  'dval.OP_ADD_NEEDS_SID':    'a new object must have a delta identifier (e.g. d:1), not a plain number.',
  'dval.OP_UNKNOWN_SID':      'reference to a non-existent delta object ({sid}).',
  // field display names used inside OP_MISSING_FIELD / OP_INVALID_FIELD
  'dval.field.roomId':   'room',       'dval.field.areaId': 'area',
  'dval.field.dir':      'direction',  'dval.field.sourceId': 'source room',
  'dval.field.labelId':  'label',      'dval.field.envId': 'terrain',
  'dval.field.room':     'room data',  'dval.field.label': 'label data',
  'dval.field.before':   'before state', 'dval.field.after': 'after state',
  'dval.field.cl':       'custom line', 'dval.field.name': 'name',
  'dval.field.changes':  'change list', 'dval.field.newColor': 'new color',
  'dval.field.exitId':   'exit',       'dval.field.cmd': 'command',
  'dval.field.targetId': 'target',     'dval.field.area': 'area data',
  'dval.field.toX':      'new X position', 'dval.field.toY': 'new Y position',
  'dval.field.toZ':      'new level',  'dval.field.toW': 'new width',
  'dval.field.toH':      'new height', 'dval.field.toAreaId': 'target area',
  'dval.field.added':    'added entries', 'dval.field.removed': 'removed entries',
  // applyDelta skip reasons — delta-apply.js ({ seq, reason, code }:
  // reason follows opts.locale, code is stable/machine-readable).
  // PL catalog below is byte-pinned to ArkMap Studio's apply wording.
  'dapply.SID_LEFTOVER':        'reference to a delta object that does not exist ({sid})',
  'dapply.OVERRIDE_OCCUPIED':   'fallback position occupied',
  'dapply.AREA_MISSING':        'area does not exist',
  'dapply.CELL_OCCUPIED':       'target cell occupied',
  'dapply.ROOM_MISSING':        'room does not exist',
  'dapply.NO_ROOM_EXISTS':      'no room exists',
  'dapply.ALREADY_THERE':       'room is already at this position',
  'dapply.TARGET_AREA_MISSING': 'target area does not exist',
  'dapply.ALREADY_IN_AREA':     'room is already in this area',
  'dapply.SRC_OR_TGT_MISSING':  'source or target room does not exist',
  'dapply.DIR_OCCUPIED':        'direction occupied (guard)',
  'dapply.EXIT_MISSING':        'exit does not exist',
  'dapply.SPECIAL_EXIT_MISSING': 'special exit does not exist',
  'dapply.DEFAULT_AREA':        'default area — deletion forbidden',
  'dapply.CL_MISSING':          'custom line does not exist',
  'dapply.ROOMS_MISSING':       'rooms do not exist',
  'dapply.LABEL_MISSING':       'label does not exist',
  'dapply.UNKNOWN_TYPE':        'unknown type',
  'dapply.EXEC_ERROR':          'execution error: {msg}',
};

const pl = {
  // PL output pins — byte-identical to ArkMap Studio labels (see header).
  'diff.delArea':        'Usunięcie obszaru "{name}"',
  'diff.addArea':        'Dodanie obszaru "{name}"',
  'diff.editArea':       'Edycja obszaru "{name}"',
  'diff.envColorSet':    'Zmiana koloru env {envId} → rgb({rgb})',
  'diff.envColorReset':  'Przywróć domyślny kolor env {envId}',
  'diff.delRoom':        'Usunięcie pokoju "{name}" (#{id})',
  'diff.addRoom':        'Dodanie pokoju "{name}" (#{id})',
  'diff.moveRoomToArea': 'Przeniesienie pokoju "{name}" (#{id}) do obszaru "{areaName}"',
  'diff.editRoom':       'Edycja pokoju "{name}" (#{id})',
  'diff.delExit':        'Usunięcie wyjścia {dir} z #{id}',
  'diff.addExit':        'Dodanie wyjścia {dir} → #{target} (z #{id})',
  'diff.editExit':       'Edycja wyjścia {dir} w pokoju "{name}" (#{id})',
  'diff.editExits':      'Edycja wyjść w pokoju "{name}" (#{id})',
  'diff.addSuppressor':  'Dodanie pustej custom line dir={dir} w pokoju "{name}" (#{id})',
  'diff.addCL':          'Dodano CL dir={dir} w pokoju "{name}" (#{id})',
  'diff.delSuppressor':  'Usunięcie pustej custom line dir={dir} w pokoju "{name}" (#{id})',
  'diff.delCL':          'Usunięcie CL dir={dir} w pokoju "{name}" (#{id})',
  'diff.editCL':         'Edycja CL dir={dir} w pokoju "{name}" (#{id})',
  'diff.moveRoom':       'Przesunięcie pokoju "{name}" (#{id})',
  'diff.paintBatch':     'Malowanie — {n} {rooms}',
  'diff.delLabel':       'Usunięcie etykiety "{name}" (#{id})',
  'diff.addLabel':       'Dodanie etykiety "{name}" (#{id})',
  'diff.editLabel':      'Edycja etykiety "{name}" (#{id})',
  'diff.resizeLabel':    'Resize etykiety "{name}" (#{id})',
  'diff.moveLabel':      'Przesunięcie etykiety "{name}" (#{id})',
  // validate() messages — PL. SPECIAL_EXIT_OVERLAPS_EXIT is byte-pinned to Studio's
  // original wording; the rest are native PL (Studio emitted these checks in EN).
  'val.MUST_BE_OBJECT':              'musi być obiektem',
  'val.MUST_BE_STRING':              'musi być stringiem',
  'val.MUST_BE_NUMBER':              'musi być liczbą',
  'val.MUST_BE_INTEGER':             'musi być liczbą całkowitą',
  'val.MUST_BE_BOOLEAN':             'musi być wartością logiczną',
  'val.MUST_BE_RGB':                 'musi być [r,g,b] 0-255',
  'val.MUST_BE_STRING_OR_NULL':      'musi być stringiem albo null',
  'val.PIXMAP_TOO_LARGE':            'zbyt duża (limit 4 MB base64)',
  'val.MUST_BE_BASE64':              'musi być poprawnym base64',
  'val.USER_DATA_STRING_DICT':       'klucze i wartości muszą być stringami',
  'val.MUST_BE_ARRAY':               'musi być tablicą',
  'val.SPECIAL_EXIT_CMD_NONEMPTY':   'klucz komendy musi być niepustym stringiem',
  'val.TARGET_MUST_BE_INTEGER':      'cel musi być całkowitym roomId',
  'val.NOT_IN_EXITS':                'spoza exits i special_exits',
  'val.MUST_BE_POSITIVE_INTEGER':    'musi być liczbą całkowitą >= 1',
  'val.INVALID_DOOR_VALUE':          'musi być "open", "closed" albo "locked"',
  'val.MUST_BE_COORD_PAIR':          'musi być [liczba, liczba]',
  'val.INVALID_CL_STYLE':            'nieprawidłowy styl',
  'val.KEY_NOT_IN_EXITS':            'klucz spoza exits i special_exits',
  'val.ELEMENTS_MUST_BE_STRINGS':    'wszystkie elementy muszą być stringami',
  'val.MUST_BE_POS3':                'musi być tablicą 3 liczb całkowitych',
  'val.REQUIRED':                    'wymagane',
  'val.ROOM_ID_HASH_MUST_BE_OBJECT': 'musi być obiektem (kontrybutor → początkowy room ID)',
  'val.MUST_BE_BYTE':                'musi być liczbą całkowitą 0-255',
  'val.MUST_BE_RGBA':                'musi być [r,g,b] albo [r,g,b,a]',
  'val.INVALID_DIRECTION':           '"{dir}" nie jest prawidłowym kierunkiem',
  'val.DUPLICATE_DIRECTION':         'zduplikowany kierunek "{dir}"',
  'val.NOT_IN_SPECIAL_EXITS':        '"{cmd}" spoza special_exits',
  'val.DUPLICATE_LABEL_ID':          'zduplikowane id etykiety {id}',
  'val.INVALID_FORMAT':              'musi być "{expected}"',
  'val.INVALID_FORMAT_VERSION':      'musi być {expected}',
  'val.DUPLICATE_AREA_ID':           'zduplikowane id obszaru {id}',
  'val.DUPLICATE_ROOM_ID':           'zduplikowane id pokoju {id}',
  'val.TARGET_NOT_FOUND':            'docelowy roomId {targetId} nie istnieje',
  'val.TARGET_MUST_BE_INTEGER_GOT':  'cel musi być całkowitym roomId, jest {targetId}',
  'val.SPECIAL_EXIT_OVERLAPS_EXIT':  'komenda specjalnego wyjścia "{cmd}" pokrywa się z normalnym kierunkiem — drzwi, wagi i custom lines używają wspólnego klucza, co może powodować niejednoznaczność danych',
  'words.room':          { one: 'pokój', few: 'pokoje', many: 'pokoi' },
  // validateDeltaText() — byte-pinned to ArkMap Studio's validator wording
  // ( Studio switches to this package without any user-visible change ).
  'dval.EMPTY_FILE':          'Pusty plik.',
  'dval.FILE_TOO_LARGE':      'Plik za duży (limit {limitMB} MB).',
  'dval.PARSE_ERROR':         'Nie można odczytać pliku — uszkodzony lub to nie jest plik kalki.',
  'dval.NOT_ARKDELTA':        'To nie jest plik .arkdelta.',
  'dval.VERSION_MISSING':     'brak',
  'dval.UNSUPPORTED_VERSION': 'Nieobsługiwana wersja formatu kalki: {version} (ta wersja ArkMap Studio obsługuje: {supported}). Kalki w starym formacie nie są wczytywane — zapisz kalkę ponownie z logu zmian albo zaktualizuj ArkMap Studio. Plik nie został wczytany.',
  'dval.UNKNOWN_TOP_KEYS':    'Plik .arkdelta zawiera pola spoza specyfikacji ({keys}). Plik nie został wczytany.',
  'dval.TOO_DEEP':            'zbyt głęboko zagnieżdżona struktura.',
  'dval.CHECKSUM_MISMATCH':   'Plik .arkdelta jest uszkodzony{detail}. Plik nie został wczytany.',
  'dval.CHECKSUM_DETAIL_ONE': ' — operacja #{seq} nie zgadza się z sumą kontrolną',
  'dval.CHECKSUM_DETAIL_MANY': ' — operacje {seqs} nie zgadzają się z sumą kontrolną',
  'dval.OPS_MISSING':         'Plik uszkodzony — brak listy operacji.',
  'dval.TOO_MANY_OPS':        'Za dużo operacji (limit {limit}).',
  'dval.OPS_COUNT_MISMATCH':  'Plik uszkodzony — liczba operacji w nagłówku ({declared}) nie zgadza się z zawartością ({actual}).',
  'dval.OP_TAG':              'operacja #{seq}',
  'dval.OP_BAD_SHAPE':        'niepoprawny kształt.',
  'dval.OP_SEQ_ORDER':        'numeracja nie jest po kolei.',
  'dval.OP_UNKNOWN_TYPE':     'nieznany typ operacji "{type}". Plik nie został wczytany.',
  'dval.OP_NO_TARGET':        'niekompletne dane (brak celu).',
  'dval.OP_NO_PAYLOAD':       'niekompletne dane (brak treści).',
  'dval.OP_MISSING_FIELD':    'niekompletne dane (brak: {field}).',
  'dval.OP_INVALID_FIELD':    'nieprawidłowe dane (pole: {field}).',
  'dval.OP_BAD_DIR':          'nieprawidłowy kierunek "{dir}".',
  'dval.OP_TOO_DEEP':         'zbyt głęboko zagnieżdżona struktura.',
  'dval.OP_FORBIDDEN_KEY':    'niedozwolony klucz "{key}".',
  'dval.OP_UNKNOWN_KEY':      'nieznane pole "{key}" — plik nie pochodzi z tej wersji ArkMap Studio. Plik nie został wczytany.',
  'dval.OP_DUP_SID':          'zduplikowany identyfikator kalki ({sid}).',
  'dval.OP_ADD_NEEDS_SID':    'nowy obiekt musi mieć identyfikator kalki (np. d:1), nie zwykły numer.',
  'dval.OP_UNKNOWN_SID':      'odwołanie do nieistniejącego obiektu kalki ({sid}).',
  'dval.field.roomId':   'pokój',         'dval.field.areaId': 'obszar',
  'dval.field.dir':      'kierunek',      'dval.field.sourceId': 'pokój źródłowy',
  'dval.field.labelId':  'etykieta',      'dval.field.envId': 'teren',
  'dval.field.room':     'dane pokoju',   'dval.field.label': 'dane etykiety',
  'dval.field.before':   'stan przed',    'dval.field.after': 'stan po',
  'dval.field.cl':       'custom line',   'dval.field.name': 'nazwa',
  'dval.field.changes':  'lista zmian',   'dval.field.newColor': 'nowy kolor',
  'dval.field.exitId':   'wyjście',       'dval.field.cmd': 'komenda',
  'dval.field.targetId': 'cel',           'dval.field.area': 'dane obszaru',
  'dval.field.toX':      'nowa pozycja X', 'dval.field.toY': 'nowa pozycja Y',
  'dval.field.toZ':      'nowy poziom',   'dval.field.toW': 'nowa szerokość',
  'dval.field.toH':      'nowa wysokość', 'dval.field.toAreaId': 'docelowy obszar',
  'dval.field.added':    'dodane wpisy',  'dval.field.removed': 'usunięte wpisy',
  // applyDelta skip reasons — byte-pinned to ArkMap Studio's apply wording.
  'dapply.SID_LEFTOVER':        'odwołanie do obiektu kalki, który nie istnieje ({sid})',
  'dapply.OVERRIDE_OCCUPIED':   'pozycja zastępcza zajęta',
  'dapply.AREA_MISSING':        'obszar nie istnieje',
  'dapply.CELL_OCCUPIED':       'komórka docelowa zajęta',
  'dapply.ROOM_MISSING':        'pokój nie istnieje',
  'dapply.NO_ROOM_EXISTS':      'żaden pokój nie istnieje',
  'dapply.ALREADY_THERE':       'pokój już jest na tej pozycji',
  'dapply.TARGET_AREA_MISSING': 'obszar docelowy nie istnieje',
  'dapply.ALREADY_IN_AREA':     'pokój już jest w tym obszarze',
  'dapply.SRC_OR_TGT_MISSING':  'pokój źródłowy lub docelowy nie istnieje',
  'dapply.DIR_OCCUPIED':        'kierunek zajęty (guard)',
  'dapply.EXIT_MISSING':        'wyjście nie istnieje',
  'dapply.SPECIAL_EXIT_MISSING': 'wyjście specjalne nie istnieje',
  'dapply.DEFAULT_AREA':        'obszar domyślny — usuwanie zabronione',
  'dapply.CL_MISSING':          'custom line nie istnieje',
  'dapply.ROOMS_MISSING':       'pokoje nie istnieją',
  'dapply.LABEL_MISSING':       'etykieta nie istnieje',
  'dapply.UNKNOWN_TYPE':        'nieznany typ',
  'dapply.EXEC_ERROR':          'błąd wykonania: {msg}',
};

const LOCALES = { en, pl };

// Only the exact string 'pl' selects Polish; anything else falls back to
// English. Strict on purpose — deterministic, no silent partial matches.
function resolveLocale(locale) {
  return locale === 'pl' ? 'pl' : 'en';
}

// translate(key, params?, locale?) → string.
// Unknown locale → English. Missing Polish key → English fallback.
// Missing English key → throw (developer error, caught by tests).
// Params are stringified; unknown '{placeholder}' tokens are left as-is.
function translate(key, params, locale) {
  const loc = resolveLocale(locale);
  let val = LOCALES[loc][key];
  if (val === undefined) val = en[key];
  if (val === undefined) throw new Error('arkmap: unknown message key: ' + key);
  if (typeof val !== 'string') throw new Error('arkmap: not a message key: ' + key);
  if (!params) return val;
  return val.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}

// plural(locale, n, formsKey) → word form for n, per locale rules.
// formsKey points at a plural-form object in the catalog (e.g. 'words.room').
function plural(locale, n, formsKey) {
  const loc = resolveLocale(locale);
  const forms = LOCALES[loc][formsKey] || en[formsKey];
  if (!forms || typeof forms !== 'object') throw new Error('arkmap: unknown plural forms key: ' + formsKey);
  if (loc === 'pl') {
    if (n === 1) return forms.one;
    const r10 = n % 10, r100 = n % 100;
    if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) return forms.few;
    return forms.many;
  }
  return n === 1 ? forms.one : forms.other;
}

export { LOCALES, resolveLocale, translate, plural };

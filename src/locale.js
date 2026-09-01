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

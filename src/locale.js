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

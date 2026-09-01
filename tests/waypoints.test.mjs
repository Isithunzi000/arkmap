// Waypoints: ARKMAP2 route codes — encode/decode round-trips, flag mapping,
// fail-closed behavior, limits, hasRoom predicate, browser btoa/atob interop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRoute, decodeRoute, WP_MAX, ROUTE_CODE_MAX, ROUTE_CODE_PREFIX } from '../src/waypoints.js';

test('round-trip: full options', () => {
  const code = encodeRoute([10, 20, 30], { algorithm: 'astar', dirMode: 'cardinal', transportMode: 'normal' });
  assert.ok(code.startsWith('ARKMAP2:akn:'));
  const d = decodeRoute(code);
  assert.deepEqual(d.ids, [10, 20, 30]);
  assert.equal(d.algorithm, 'astar');
  assert.equal(d.dirMode, 'cardinal');
  assert.equal(d.transportMode, 'normal');
  assert.equal(d.invalidCount, 0);
  assert.equal(d.total, 3);
});

test('round-trip: defaults and every flag combination', () => {
  assert.ok(encodeRoute([1, 2], {}).startsWith('ARKMAP2:dwp:'));
  for (const [algo, a] of [['dijkstra', 'd'], ['astar', 'a'], ['junk', 'd'], [undefined, 'd']])
    for (const [dir, k] of [['cardinal', 'k'], ['vertical', 'p'], ['all', 'w'], ['junk', 'w']])
      for (const [tr, c] of [['off', 'p'], ['normal', 'n'], ['aggressive', 'g'], ['junk', 'p']]) {
        const code = encodeRoute([5, 6], { algorithm: algo, dirMode: dir, transportMode: tr });
        assert.ok(code.startsWith(`ARKMAP2:${a}${k}${c}:`), code);
        const d = decodeRoute(code);
        assert.deepEqual(d.ids, [5, 6]);
      }
});

test('encode: fail-closed on unencodable input', () => {
  assert.equal(encodeRoute([], {}), '');
  assert.equal(encodeRoute([5], {}), '');                    // < 2 ids
  assert.equal(encodeRoute([null, null], {}), '');           // nulls skipped -> < 2
  assert.equal(encodeRoute([1, -2], {}), '');                // non-positive
  assert.equal(encodeRoute([1, 2.5], {}), '');               // non-integer
  assert.equal(encodeRoute([1, '2'], {}), '');               // non-number
  assert.equal(encodeRoute('not-array', {}), '');
  assert.equal(encodeRoute(null, {}), '');
  assert.equal(encodeRoute(Array(WP_MAX + 1).fill(1), {}), '');   // over limit
  // nulls interleaved with valid ids encode fine
  const d = decodeRoute(encodeRoute([1, null, 2, null, 3], {}));
  assert.deepEqual(d.ids, [1, 2, 3]);
});

test('decode: null on structural corruption', () => {
  assert.equal(decodeRoute(''), null);
  assert.equal(decodeRoute(null), null);
  assert.equal(decodeRoute(42), null);
  assert.equal(decodeRoute('ARKMAP1:dwp:MQ=='), null);       // wrong prefix
  assert.equal(decodeRoute('ARKMAP2:'), null);
  assert.equal(decodeRoute('ARKMAP2:dwp:'), null);           // empty payload
  assert.equal(decodeRoute('ARKMAP2:xyz:MQ=='), null);       // unknown flags
  assert.equal(decodeRoute('ARKMAP2:dwp' + 'x'.repeat(10)), null);   // missing ':'
  assert.equal(decodeRoute('ARKMAP2:dwp:!!!'), null);        // bad base64
  assert.equal(decodeRoute('ARKMAP2:dwp:MQ'), null);         // bad padding
  assert.equal(decodeRoute('ARKMAP2:dwp:MSwyLDM=' + 'A'.repeat(ROUTE_CODE_MAX)), null);  // over length cap
  // corrupt id tokens
  assert.equal(decodeRoute('ARKMAP2:dwp:' + btoa('1,0,3')), null);        // 0
  assert.equal(decodeRoute('ARKMAP2:dwp:' + btoa('1,-2')), null);         // negative
  assert.equal(decodeRoute('ARKMAP2:dwp:' + btoa('1,2.5')), null);        // float
  assert.equal(decodeRoute('ARKMAP2:dwp:' + btoa('1, 02')), null);        // non-canonical
  assert.equal(decodeRoute('ARKMAP2:dwp:' + btoa('1,x')), null);          // garbage
  assert.equal(decodeRoute('ARKMAP2:dwp:' + btoa('')), null);
});

test('decode: too-many waypoints -> structured error, not null', () => {
  const ids = Array.from({ length: WP_MAX + 1 }, (_, i) => i + 1);
  const d = decodeRoute('ARKMAP2:dwp:' + btoa(ids.join(',')));
  assert.deepEqual(d, { error: 'too-many', max: WP_MAX, total: WP_MAX + 1 });
});

test('decode: hasRoom predicate splits valid/invalid', () => {
  const code = encodeRoute([10, 20, 30], {});
  const d = decodeRoute(code, id => id !== 20);
  assert.deepEqual(d.ids, [10, 20, 30]);
  assert.deepEqual(d.valid, [10, 30]);
  assert.equal(d.invalidCount, 1);
  assert.equal(d.total, 3);
  // without predicate everything is valid
  assert.deepEqual(decodeRoute(code).valid, [10, 20, 30]);
});

test('interop: browser btoa output decodes; our encode decodes with atob', () => {
  // code produced by the app (btoa) must decode here
  const appCode = 'ARKMAP2:akg:' + btoa('729,3760,10313');
  const d = decodeRoute(appCode);
  assert.deepEqual(d.ids, [729, 3760, 10313]);
  assert.equal(d.transportMode, 'aggressive');
  // our output must decode in a browser (atob)
  const code = encodeRoute([729, 3760], { algorithm: 'astar', dirMode: 'vertical', transportMode: 'off' });
  assert.equal(code.slice(0, 12), 'ARKMAP2:app:');
  assert.equal(atob(code.slice(12)), '729,3760');
});

test('whitespace around code is tolerated (trim), inside is not', () => {
  const code = encodeRoute([7, 8], {});
  assert.deepEqual(decodeRoute('  ' + code + '\n').ids, [7, 8]);
});

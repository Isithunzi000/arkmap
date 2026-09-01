// Waypoints: gen-3 route codes arkmap:<flags>:<ids CSV>:<crc8> — round-trips,
// flag permutations, case-insensitivity, crc integrity, fail-closed behavior,
// limits, hasRoom predicate. No backward compatibility: legacy ARKMAP:/ARKMAP2:
// codes (base64 payloads) must decode to null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRoute, decodeRoute, WP_MAX, ROUTE_CODE_MAX, ROUTE_CODE_PREFIX } from '../src/waypoints.js';
import { xxh3_64hex } from '../src/checksum.js';

const TE = new TextEncoder();
const crcFor = (core) => xxh3_64hex(TE.encode(core)).slice(0, 8);
const withCrc = (core) => core + ':' + crcFor(core);

test('format constants', () => {
  assert.equal(ROUTE_CODE_PREFIX, 'arkmap');
});

test('round-trip: full options', () => {
  const code = encodeRoute([10, 20, 30], { algorithm: 'astar', dirMode: 'cardinal', transportMode: 'normal' });
  assert.ok(code.startsWith('arkmap:akn:'), code);
  const d = decodeRoute(code);
  assert.deepEqual(d.ids, [10, 20, 30]);
  assert.equal(d.algorithm, 'astar');
  assert.equal(d.dirMode, 'cardinal');
  assert.equal(d.transportMode, 'normal');
  assert.equal(d.invalidCount, 0);
  assert.equal(d.total, 3);
});

test('round-trip: defaults and every flag combination', () => {
  assert.ok(encodeRoute([1, 2], {}).startsWith('arkmap:dwp:'));
  for (const [algo, a] of [['dijkstra', 'd'], ['astar', 'a'], ['junk', 'd'], [undefined, 'd']])
    for (const [dir, k] of [['cardinal', 'k'], ['vertical', 'p'], ['all', 'w'], ['junk', 'w']])
      for (const [tr, c] of [['off', 'p'], ['normal', 'n'], ['aggressive', 'g'], ['junk', 'p']]) {
        const code = encodeRoute([5, 6], { algorithm: algo, dirMode: dir, transportMode: tr });
        assert.ok(code.startsWith(`arkmap:${a}${k}${c}:5,6:`), code);
        const d = decodeRoute(code);
        assert.deepEqual(d.ids, [5, 6]);
      }
});

test('golden pins: crc values are locked across implementations', () => {
  assert.equal(encodeRoute([100, 200, 300], { algorithm: 'astar', dirMode: 'cardinal', transportMode: 'normal' }),
    'arkmap:akn:100,200,300:c44c6e53');
  assert.equal(encodeRoute([5, 6], {}), 'arkmap:dwp:5,6:b7db3c29');
  // crc = first 8 hex of xxh3_64hex over the lowercased core
  assert.equal(crcFor('arkmap:akn:100,200,300'), 'c44c6e53');
});

test('determinism: same state -> identical code and decode, twice', () => {
  const opts = { algorithm: 'astar', dirMode: 'vertical', transportMode: 'aggressive' };
  assert.equal(encodeRoute([7, 8, 9], opts), encodeRoute([7, 8, 9], opts));
  const code = encodeRoute([7, 8, 9], opts);
  assert.deepEqual(decodeRoute(code), decodeRoute(code));
});

test('case-insensitive: any letter case decodes identically', () => {
  const code = encodeRoute([2188, 1998, 729], { algorithm: 'astar', dirMode: 'cardinal', transportMode: 'normal' });
  const want = decodeRoute(code);
  const mixed = 'ArkMap:AkN:2188,1998,729:' + code.split(':')[3].toUpperCase();
  assert.deepEqual(decodeRoute(code.toUpperCase()), want);               // full upper incl. crc hex
  assert.deepEqual(decodeRoute(mixed), want);                            // mixed case
  assert.deepEqual(decodeRoute('  ' + code.toUpperCase() + '\n'), want); // trim + case together
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
  assert.equal(decodeRoute('arkmap'), null);
  assert.equal(decodeRoute('arkmap:'), null);
  assert.equal(decodeRoute('arkmap:dwp'), null);             // missing fields
  assert.equal(decodeRoute('arkmap:dwp:1,2'), null);         // missing crc field
  assert.equal(decodeRoute('arkmap:dwp:1,2:' + crcFor('arkmap:dwp:1,2') + ':ff'), null);  // extra field
  assert.equal(decodeRoute('arkmap:dwp::aabbccdd'), null);   // empty csv
  assert.equal(decodeRoute('arkmap:dwp:1,2:aabbccd'), null); // crc 7 chars
  assert.equal(decodeRoute('arkmap:dwp:1,2:aabbccdde'), null); // crc 9 chars
  assert.equal(decodeRoute('arkmap:dwp:1,2:zzzzzzzz'), null); // crc non-hex
  assert.equal(decodeRoute('arkmap:xyz:1,2:aabbccdd'), null);   // unknown flags
  assert.equal(decodeRoute('arkmap:dwp:1,2:' + crcFor('arkmap:dwp:1,2') + 'A'.repeat(ROUTE_CODE_MAX)), null);  // over length cap
  // non-canonical / corrupt CSV
  for (const csv of ['01,2', '1, 2', '1,,2', '1,', ',1', '1,0', '1,-2', '1,2.5', '1,x']) {
    const core = 'arkmap:dwp:' + csv;
    assert.equal(decodeRoute(withCrc(core)), null, csv);
  }
});

test('decode: no backward compatibility — legacy generations decode to null', () => {
  assert.equal(decodeRoute('ARKMAP:MTAwLDIwMA=='), null);        // v0 (ARKMAP:base64)
  assert.equal(decodeRoute('ARKMAP:d:MTAwLDIwMA=='), null);      // v1
  assert.equal(decodeRoute('arkmap2:dwp:MTAwLDIwMA=='), null);   // v2 lowercase
  assert.equal(decodeRoute('ARKMAP2:dwp:MTAwLDIwMA=='), null);   // v2
  assert.equal(decodeRoute('ARKMAP1:dwp:MQ=='), null);
});

test('decode: crc mismatch -> structured error, not null', () => {
  const good = encodeRoute([2188, 1998, 729], {});
  // payload edited, crc kept
  const tampered = good.replace('2188', '2189');
  const d = decodeRoute(tampered);
  assert.equal(d.error, 'crc');
  assert.equal(d.actual, good.split(':')[3]);
  assert.equal(d.expected, crcFor('arkmap:dwp:2189,1998,729'));
  // crc itself edited
  const d2 = decodeRoute(good.slice(0, -1) + (good.endsWith('0') ? '1' : '0'));
  assert.equal(d2.error, 'crc');
  // well-formed but wrong crc
  assert.equal(decodeRoute('arkmap:dwp:1,2:00000000').error, 'crc');
});

test('decode: crc is verified before the waypoint limit', () => {
  const ids = Array.from({ length: WP_MAX + 1 }, (_, i) => i + 1);
  const d = decodeRoute(withCrc('arkmap:dwp:' + ids.join(',')));
  assert.deepEqual(d, { error: 'too-many', max: WP_MAX, total: WP_MAX + 1 });
  // same code with a broken crc reports crc, not too-many
  assert.equal(decodeRoute('arkmap:dwp:' + ids.join(',') + ':00000000').error, 'crc');
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

test('whitespace around code is tolerated (trim), inside is not', () => {
  const code = encodeRoute([7, 8], {});
  assert.deepEqual(decodeRoute('  ' + code + '\n').ids, [7, 8]);
  assert.equal(decodeRoute('arkmap: dwp:7,8:' + code.split(':')[3]), null);
});

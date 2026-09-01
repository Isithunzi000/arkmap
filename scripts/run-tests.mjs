// Cross-version test launcher: enumerates tests/*.test.mjs explicitly.
// `node --test tests/` is not portable (Node 18/20 accept a directory,
// Node 22 treats the argument as a glob/entry and fails on the bare dir).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => `tests/${f}`);

if (files.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(res.status ?? 1);

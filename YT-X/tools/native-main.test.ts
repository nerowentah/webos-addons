// The native bundle loads the same feature modules as the userscript.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name: string): string =>
  readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

const staticImports = (source: string): string[] =>
  [...source.matchAll(/^import '(\.\/[^']+)';/gm)].map((m) => m[1] ?? '');

const dynamicImports = (source: string): string[] =>
  [...source.matchAll(/\[\s*'(\.\/[^']+)',\s*\(\)/g)].map((m) => m[1] ?? '');

test('native-main lists the userscript modules in the same order', () => {
  const skip = new Set(['./platform/cobalt-polyfills', './core/utils']);
  const userscript = staticImports(read('userScript.ts')).filter(
    (name) => !skip.has(name)
  );
  assert.deepEqual(dynamicImports(read('native-main.ts')), userscript);
});

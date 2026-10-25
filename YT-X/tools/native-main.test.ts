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

// What only one of the two bundles loads: the webOS browser's workarounds for a
// video plane that cannot compose a preview, and the native build's repairs for
// one that can. Every other module must be in both, in the same order.
const WEB_ONLY = new Set([
  './features/playback/previews',
  './styles/inline-preview-fix.css'
]);
const NATIVE_ONLY = new Set(['./features/playback/native-previews']);

test('native-main lists the userscript modules in the same order', () => {
  const skip = new Set(['./platform/cobalt-polyfills', './core/utils']);
  const userscript = staticImports(read('userScript.ts')).filter(
    (name) => !skip.has(name)
  );
  const native = dynamicImports(read('native-main.ts'));

  assert.deepEqual(
    native.filter((name) => !NATIVE_ONLY.has(name)),
    userscript.filter((name) => !WEB_ONLY.has(name))
  );
});

test('web-only and native-only modules are loaded by one bundle only', () => {
  const userscript = staticImports(read('userScript.ts'));
  const native = dynamicImports(read('native-main.ts'));

  for (const name of WEB_ONLY) {
    assert.ok(userscript.includes(name), `${name} missing from userScript`);
    assert.ok(!native.includes(name), `${name} must not load natively`);
  }
  for (const name of NATIVE_ONLY) {
    assert.ok(native.includes(name), `${name} missing from native-main`);
    assert.ok(!userscript.includes(name), `${name} must not load on webOS`);
  }
});

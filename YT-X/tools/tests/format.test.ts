// Unit tests for the text formatting helpers (src/core/format.ts). Run with
// `npm test` (node --test), which strips the TypeScript types natively. The
// module path is built at runtime so this file does not statically import from
// src/.

import test from 'node:test';
import assert from 'node:assert/strict';

/** The parts of src/core/format.ts these tests use. */
interface FormatModule {
  formatTime(seconds: unknown): string;
  cssString(value: unknown): string;
}

const href = new URL('../../src/core/format.ts', import.meta.url).href;

const load = async () => (await import(href)) as FormatModule;

test('formatTime renders mm:ss and h:mm:ss', async () => {
  const { formatTime } = await load();
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(59.4), '0:59');
  assert.equal(formatTime(59.5), '1:00');
  assert.equal(formatTime(61), '1:01');
  assert.equal(formatTime(3599), '59:59');
  assert.equal(formatTime(3600), '1:00:00');
  assert.equal(formatTime(36061), '10:01:01');
});

test('formatTime clamps negative and non-finite input to 0:00', async () => {
  const { formatTime } = await load();
  for (const bad of [-5, -Infinity, Infinity, NaN, undefined, null]) {
    assert.equal(formatTime(bad), '0:00', String(bad));
  }
});

test('cssString escapes quotes and backslashes', async () => {
  const { cssString } = await load();
  assert.equal(cssString('plain'), '"plain"');
  assert.equal(cssString('a"b'), '"a\\"b"');
  assert.equal(cssString('a\\b'), '"a\\\\b"');
  assert.equal(cssString('"; } body { x: "'), '"\\"; } body { x: \\""');
});

test('cssString neutralises markup that could close a <style> element', async () => {
  const { cssString } = await load();
  const out = cssString('</style><script>alert(1)</script>');
  assert.ok(!out.includes('<'));
  assert.ok(!out.toLowerCase().includes('</style'));
  assert.equal(cssString('<'), '"\\3c "');
});

test('cssString neutralises newlines and control characters', async () => {
  const { cssString } = await load();
  assert.equal(cssString('a\nb\rc\fd'), '"a b c d"');
  assert.equal(cssString('a\0b\u001fc\u007fd'), '"a b c d"');
  assert.equal(cssString(12), '"12"');
  assert.equal(cssString(undefined), '"undefined"');
});

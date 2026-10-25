// A response filter that throws must cost only itself, never YouTube's own parse.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSrc } from '../lib/load-src.ts';

interface ParseHook {
  registerParseProcessor(
    processor: (parsed: object, text: unknown) => void
  ): void;
}

const { registerParseProcessor } = await loadSrc<ParseHook>(
  'youtube/hooks/json-parse.ts'
);

test('a throwing processor does not break JSON.parse and later ones still run', () => {
  const seen: string[] = [];
  registerParseProcessor(() => {
    throw new Error('boom');
  });
  registerParseProcessor((parsed) => {
    seen.push(JSON.stringify(parsed));
  });

  const result = JSON.parse('{"a":1}') as { a: number };

  assert.deepEqual(result, { a: 1 });
  assert.deepEqual(seen, ['{"a":1}']);

  const fails = (globalThis as { __ytxFails?: string[] }).__ytxFails ?? [];
  assert.equal(fails.length, 1);
  assert.match(fails[0] ?? '', /^parse-processor: boom/);
});

test('primitives skip the processors', () => {
  assert.equal(JSON.parse('5'), 5);
  assert.equal(JSON.parse('"x"'), 'x');
});

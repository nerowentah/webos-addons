import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// config.ts touches window lazily, but read the source to avoid importing UI types at runtime.
const configSrc = readFileSync('src/config/config.ts', 'utf8');
const livenessSrc = readFileSync('src/config/liveness.ts', 'utf8');

function defaultKeys(): string[] {
  const body = /const defaultConfig = \{([\s\S]*?)\n\};/.exec(configSrc)?.[1];
  assert.ok(body, 'defaultConfig not found');
  return [...body.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1] as string);
}

test('every config key declares how soon it takes effect', () => {
  const declared = new Set(
    [...livenessSrc.matchAll(/^ {2}(\w+): '(?:instant|next-load)'/gm)].map(
      (m) => m[1]
    )
  );
  for (const key of defaultKeys()) {
    assert.ok(declared.has(key), `${key} missing from LIVENESS`);
  }
});

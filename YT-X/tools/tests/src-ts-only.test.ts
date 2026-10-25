// src/ is TypeScript only: tsconfig no longer allows JS, so a stray .js file
// would be bundled by webpack but never type-checked. Run with `npm test`.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', '..', 'src');

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

test('src contains no JavaScript files', () => {
  const stray = [...walk(SRC)].filter((file) => /\.[cm]?jsx?$/.test(file));
  assert.deepEqual(
    stray.map((file) => path.relative(SRC, file)),
    []
  );
});

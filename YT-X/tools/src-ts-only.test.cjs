#!/usr/bin/env node
// src/ is TypeScript only: tsconfig no longer allows JS, so a stray .js file
// would be bundled by webpack but never type-checked. Run with `npm test`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

/** @param {string} dir @returns {Generator<string>} */
function* walk(dir) {
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

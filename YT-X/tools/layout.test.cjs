#!/usr/bin/env node
// Unit test for the settings-grid column rule (src/layout.js). Run with
// `npm test` (node --test). The module path is built at runtime so this file
// does not statically import from src/ (which would pull it into the tooling
// tsconfig project).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const layoutHref = pathToFileURL(
  path.join(__dirname, '..', 'src', 'layout.js')
).href;

test('gridColumns uses two columns below the threshold', async () => {
  const { gridColumns } = await import(layoutHref);
  assert.equal(gridColumns(0), 2);
  assert.equal(gridColumns(1), 2);
  assert.equal(gridColumns(5), 2);
});

test('gridColumns uses three columns at or above the threshold', async () => {
  const { gridColumns, THREE_COL_MIN_ROWS } = await import(layoutHref);
  assert.equal(THREE_COL_MIN_ROWS, 6);
  assert.equal(gridColumns(6), 3);
  assert.equal(gridColumns(13), 3);
});

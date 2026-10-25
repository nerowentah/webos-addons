// Unit test for the settings-grid column rule (src/core/layout.ts). Run with
// `npm test` (node --test). The module path is built at runtime so this file
// does not statically import from src/ (which would pull it into the tooling
// tsconfig project).

import test from 'node:test';
import assert from 'node:assert/strict';

/** The parts of src/core/layout.ts this test uses. */
interface LayoutModule {
  THREE_COL_MIN_ROWS: number;
  gridColumns(rows: number): number;
}

const layoutHref = new URL('../../src/core/layout.ts', import.meta.url).href;

const load = async () => (await import(layoutHref)) as LayoutModule;

test('gridColumns uses two columns below the threshold', async () => {
  const { gridColumns } = await load();
  assert.equal(gridColumns(0), 2);
  assert.equal(gridColumns(1), 2);
  assert.equal(gridColumns(5), 2);
});

test('gridColumns uses three columns at or above the threshold', async () => {
  const { gridColumns, THREE_COL_MIN_ROWS } = await load();
  assert.equal(THREE_COL_MIN_ROWS, 6);
  assert.equal(gridColumns(6), 3);
  assert.equal(gridColumns(13), 3);
});

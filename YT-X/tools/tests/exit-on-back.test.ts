// Unit tests for the Back-at-root exit decision (src/core/exit-on-back.ts). Run with
// `npm test` (node --test). The module path is built at runtime so this file does not
// statically import from src/.

import test from 'node:test';
import assert from 'node:assert/strict';

interface ExitOnBackModule {
  shouldExitOnBack(state: {
    enabled: boolean;
    panelVisible: boolean;
    hash: string;
  }): boolean;
}

const href = new URL('../../src/core/exit-on-back.ts', import.meta.url).href;
const load = async () => (await import(href)) as ExitOnBackModule;
const base = { enabled: true, panelVisible: false };

test('exits on Back at the root', async () => {
  const { shouldExitOnBack } = await load();
  for (const hash of ['', '#', '#/', '#/?foo=1']) {
    assert.equal(shouldExitOnBack({ ...base, hash }), true, hash);
  }
});

test('does not exit from sub-pages', async () => {
  const { shouldExitOnBack } = await load();
  for (const hash of [
    '#/watch?v=abc',
    '#/search',
    '#/browse?c=1',
    '#/shorts'
  ]) {
    assert.equal(shouldExitOnBack({ ...base, hash }), false, hash);
  }
});

test('does not exit when disabled or while the panel is open', async () => {
  const { shouldExitOnBack } = await load();
  assert.equal(
    shouldExitOnBack({ ...base, enabled: false, hash: '#/' }),
    false
  );
  assert.equal(
    shouldExitOnBack({ ...base, panelVisible: true, hash: '#/' }),
    false
  );
});

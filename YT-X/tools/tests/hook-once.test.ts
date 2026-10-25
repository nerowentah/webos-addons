// Tests for the once-per-page hook claim (src/core/hook-once.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from '../lib/load-src.ts';

interface HookOnceModule {
  claimHook(name: string): boolean;
}

const { claimHook } = await loadSrc<HookOnceModule>('core/hook-once.ts');

test('claimHook grants each name once per page', () => {
  assert.equal(claimHook('a'), true);
  assert.equal(claimHook('a'), false);
  assert.equal(claimHook('b'), true);
});

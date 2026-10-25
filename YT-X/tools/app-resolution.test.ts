// Tests for the build-time graphics canvas (tools/app-resolution.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_RESOLUTION, resolveAppResolution } from './app-resolution.ts';

test('resolveAppResolution defaults to the 1920x1080 canvas', () => {
  assert.equal(DEFAULT_RESOLUTION, '1920x1080');
  assert.equal(resolveAppResolution(undefined), '1920x1080');
});

test('symbolic aliases resolve to their pixel canvas', () => {
  assert.equal(resolveAppResolution('fhd'), '1920x1080');
  assert.equal(resolveAppResolution('hd'), '1280x720');
});

test('pixel values pass through unchanged', () => {
  assert.equal(resolveAppResolution('1920x1080'), '1920x1080');
  assert.equal(resolveAppResolution('1280x720'), '1280x720');
});

test('unknown values are rejected with the accepted list', () => {
  assert.throws(
    () => resolveAppResolution('4k'),
    /resolution must be one of fhd, hd, 1920x1080, 1280x720; got 4k/
  );
});

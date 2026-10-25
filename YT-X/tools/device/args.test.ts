// Tests for the shared device-tool arguments (tools/device/args.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

import { deviceArg, hasFlag, optionValue } from './args.ts';

test('optionValue accepts the space and equals forms', () => {
  assert.equal(optionValue(['--ua', 'cobalt'], ['--ua']), 'cobalt');
  assert.equal(optionValue(['--ua=cobalt'], ['--ua']), 'cobalt');
});

test('optionValue accepts the short alias', () => {
  assert.equal(optionValue(['-d', 'tv'], ['-d', '--device']), 'tv');
  assert.equal(optionValue(['--device', 'tv'], ['-d', '--device']), 'tv');
});

test('optionValue ignores a prefix that is not the whole flag', () => {
  // `-d` must not match `--dry-run` or `--device-list`.
  assert.equal(optionValue(['--dry-run'], ['-d', '--device']), undefined);
  assert.equal(optionValue(['--device-list'], ['-d', '--device']), undefined);
});

test('optionValue rejects a flag with no value', () => {
  assert.throws(
    () => optionValue(['--device'], ['-d', '--device']),
    /needs a value/
  );
  assert.throws(
    () => optionValue(['--device='], ['-d', '--device']),
    /needs a value/
  );
  assert.throws(
    () => optionValue(['--device', '--dry-run'], ['-d', '--device']),
    /needs a value/
  );
});

test('deviceArg prefers the flag over YTX_DEVICE', () => {
  assert.equal(deviceArg(['-d', 'tv'], { YTX_DEVICE: 'emulator' }), 'tv');
  assert.equal(deviceArg(['--device=tv'], { YTX_DEVICE: 'emulator' }), 'tv');
});

test('deviceArg falls back to YTX_DEVICE, then to the ares default', () => {
  assert.equal(deviceArg([], { YTX_DEVICE: 'emulator' }), 'emulator');
  assert.equal(deviceArg([], {}), undefined);
});

test('hasFlag only matches the bare flag', () => {
  assert.equal(hasFlag(['--dry-run'], '--dry-run'), true);
  assert.equal(hasFlag([], '--dry-run'), false);
});

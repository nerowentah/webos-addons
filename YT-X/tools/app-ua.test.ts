// Tests for the build-time UA mode (tools/app-ua.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

import { applyUserAgent, resolveUaMode } from './app-ua.ts';

const TEMPLATE = '$browserName$/$browserVersion$ (webos template)';

const appInfo = () => ({ vendorExtension: { userAgent: TEMPLATE } });

test('resolveUaMode defaults to webos and rejects unknown modes', () => {
  assert.equal(resolveUaMode(undefined), 'webos');
  assert.equal(resolveUaMode('webos'), 'webos');
  assert.throws(() => resolveUaMode('ps4'), /--ua must be one of/);
});

test('webos mode leaves the appinfo template alone', () => {
  const info = appInfo();
  applyUserAgent(info, 'webos');
  assert.equal(info.vendorExtension.userAgent, TEMPLATE);
});

test('cobalt mode swaps in a Cobalt UA that keeps the TV variables', () => {
  const info = appInfo();
  applyUserAgent(info, 'cobalt');
  const ua = info.vendorExtension.userAgent;
  assert.match(ua, /Cobalt\//);
  for (const v of ['$firmwareVersion$', '$modelName$', '$networkMode$']) {
    assert.ok(ua.includes(v), v);
  }
});

test('cobalt mode needs a vendorExtension object', () => {
  assert.throws(() => applyUserAgent({}, 'cobalt'), /vendorExtension/);
});

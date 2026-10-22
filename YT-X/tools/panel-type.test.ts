// Tests for the pure panel logic in src/platform/panel-type.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from './load-src.ts';

interface PanelTypeModule {
  parsePanelType(
    model: string | undefined,
    oledFromPlatform: boolean | undefined
  ): string;
  resolvePanelCareMode(stored: string, panel: string): string;
}

const { parsePanelType, resolvePanelCareMode } = await loadSrc<PanelTypeModule>(
  'platform/panel-type.ts'
);

test('parsePanelType prefers the model for QNED and MiniLED', () => {
  assert.equal(parsePanelType('65QNED85', undefined), 'qned');
  assert.equal(parsePanelType('65QNED85', true), 'qned');
  assert.equal(parsePanelType('75 mini-led', false), 'qned');
});

test('parsePanelType trusts an explicit platform OLED flag', () => {
  assert.equal(parsePanelType('55NANO8PUA', true), 'oled');
  assert.equal(parsePanelType('OLED55C1', false), 'lcd');
});

test('parsePanelType guesses from the model without a platform flag', () => {
  assert.equal(parsePanelType('OLED55C1PUB', undefined), 'oled');
  assert.equal(parsePanelType('55NANO8PUA', undefined), 'lcd');
  assert.equal(parsePanelType(undefined, undefined), 'lcd');
});

test('resolvePanelCareMode honours an explicit stored choice', () => {
  for (const mode of ['oled', 'qned', 'off'] as const) {
    assert.equal(resolvePanelCareMode(mode, 'lcd'), mode);
  }
});

test('resolvePanelCareMode maps the detected panel for auto', () => {
  assert.equal(resolvePanelCareMode('auto', 'oled'), 'oled');
  assert.equal(resolvePanelCareMode('auto', 'qned'), 'qned');
  assert.equal(resolvePanelCareMode('auto', 'lcd'), 'off');
  assert.equal(resolvePanelCareMode('garbage', 'lcd'), 'off');
});

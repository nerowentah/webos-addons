#!/usr/bin/env node
// Unit tests for the stored-config migration (src/config/migrate.ts). Run with
// `npm test` (node --test), which strips the TypeScript types natively. The
// module path is built at runtime so this file does not statically import from
// src/ (which would pull it into the tooling tsconfig project).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const href = pathToFileURL(
  path.join(__dirname, '..', 'src', 'config', 'migrate.ts')
).href;

const load = () => import(href);

test('migrateStoredConfig rejects anything but a plain object', async () => {
  const { migrateStoredConfig } = await load();
  for (const bad of [null, undefined, 5, 'x', true, [], [1]]) {
    assert.equal(migrateStoredConfig(bad), null, JSON.stringify(bad));
  }
});

test('migrateStoredConfig returns a copy and marks the badge swap done', async () => {
  const { migrateStoredConfig, BADGE_MODE_MARKER } = await load();
  const input = { hideLogo: true };
  const out = migrateStoredConfig(input);
  assert.deepEqual(out, { hideLogo: true, [BADGE_MODE_MARKER]: true });
  assert.deepEqual(input, { hideLogo: true });
});

test('migrateStoredConfig inverts pointerSettingsButton exactly once', async () => {
  const { migrateStoredConfig } = await load();
  const once = migrateStoredConfig({ pointerSettingsButton: true });
  assert.equal(once.pointerSettingsButton, false);
  const twice = migrateStoredConfig(once);
  assert.equal(twice.pointerSettingsButton, false);
  assert.equal(
    migrateStoredConfig({ pointerSettingsButton: false }).pointerSettingsButton,
    true
  );
  assert.equal('pointerSettingsButton' in migrateStoredConfig({}), false);
});

test('migrateStoredConfig turns the legacy OLED toggle into panelCareMode', async () => {
  const { migrateStoredConfig } = await load();
  const on = migrateStoredConfig({ enableOledCareMode: true });
  assert.equal(on.panelCareMode, 'oled');
  assert.equal('enableOledCareMode' in on, false);

  const off = migrateStoredConfig({ enableOledCareMode: false });
  assert.equal('panelCareMode' in off, false);
  assert.equal('enableOledCareMode' in off, false);

  const kept = migrateStoredConfig({
    enableOledCareMode: true,
    panelCareMode: 'qned'
  });
  assert.equal(kept.panelCareMode, 'qned');
});

test('migrateStoredConfig drops retired keys and keeps the rest', async () => {
  const { migrateStoredConfig, BADGE_MODE_MARKER } = await load();
  const out = migrateStoredConfig({
    uiTheme: 'x',
    removeBlackBorders: true,
    showWatch: true,
    alwaysShowClock: true,
    showYtxButton: true,
    upgradeThumbnails: true,
    enableScrollSeek: true,
    subtitleTranslateLang: 'de',
    subtitleAutoEnable: true,
    shortcut_key_red: 'x',
    sponsorColor: '#fff',
    segmentColorScheme: 'x',
    hideLogo: true,
    [BADGE_MODE_MARKER]: true
  });
  assert.deepEqual(out, { hideLogo: true, [BADGE_MODE_MARKER]: true });
});

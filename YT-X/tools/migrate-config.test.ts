// Unit tests for the stored-config migration (src/config/migrate.ts). Run with
// `npm test` (node --test), which strips the TypeScript types natively. The
// module path is built at runtime so this file does not statically import from
// src/ (which would pull it into the tooling tsconfig project).

import test from 'node:test';
import assert from 'node:assert/strict';

/** The parts of src/config/migrate.ts these tests use. */
interface MigrateModule {
  BADGE_MODE_MARKER: string;
  NATIVE_CAST_MARKER: string;
  migrateStoredConfig(parsed: unknown): Record<string, unknown> | null;
}

const href = new URL('../src/config/migrate.ts', import.meta.url).href;

const load = async () => (await import(href)) as MigrateModule;

/** A migrated config the test expects to exist. */
function migrated(
  migrateStoredConfig: MigrateModule['migrateStoredConfig'],
  input: unknown
): Record<string, unknown> {
  const out = migrateStoredConfig(input);
  assert.notEqual(out, null);
  return out as Record<string, unknown>;
}

test('migrateStoredConfig rejects anything but a plain object', async () => {
  const { migrateStoredConfig } = await load();
  for (const bad of [null, undefined, 5, 'x', true, [], [1]]) {
    assert.equal(migrateStoredConfig(bad), null, JSON.stringify(bad));
  }
});

test('migrateStoredConfig returns a copy and marks the badge swap done', async () => {
  const { migrateStoredConfig, BADGE_MODE_MARKER, NATIVE_CAST_MARKER } =
    await load();
  const input = { hideLogo: true };
  const out = migrateStoredConfig(input);
  assert.deepEqual(out, {
    hideLogo: true,
    [BADGE_MODE_MARKER]: true,
    [NATIVE_CAST_MARKER]: true,
    blockWebosCast: false
  });
  assert.deepEqual(input, { hideLogo: true });
});

test('migrateStoredConfig enables the native-Cast wake once', async () => {
  const { migrateStoredConfig, NATIVE_CAST_MARKER } = await load();
  const once = migrated(migrateStoredConfig, { blockWebosCast: true });
  assert.equal(once['blockWebosCast'], false);
  assert.equal(once[NATIVE_CAST_MARKER], true);

  // A later explicit enable is a user choice and must stick.
  const twice = migrated(migrateStoredConfig, {
    ...once,
    blockWebosCast: true
  });
  assert.equal(twice['blockWebosCast'], true);
});

test('migrateStoredConfig inverts pointerSettingsButton exactly once', async () => {
  const { migrateStoredConfig } = await load();
  const once = migrated(migrateStoredConfig, { pointerSettingsButton: true });
  assert.equal(once['pointerSettingsButton'], false);
  const twice = migrated(migrateStoredConfig, once);
  assert.equal(twice['pointerSettingsButton'], false);
  assert.equal(
    migrated(migrateStoredConfig, { pointerSettingsButton: false })[
      'pointerSettingsButton'
    ],
    true
  );
  assert.equal(
    'pointerSettingsButton' in migrated(migrateStoredConfig, {}),
    false
  );
});

test('migrateStoredConfig turns the legacy OLED toggle into panelCareMode', async () => {
  const { migrateStoredConfig } = await load();
  const on = migrated(migrateStoredConfig, { enableOledCareMode: true });
  assert.equal(on['panelCareMode'], 'oled');
  assert.equal('enableOledCareMode' in on, false);

  const off = migrated(migrateStoredConfig, { enableOledCareMode: false });
  assert.equal('panelCareMode' in off, false);
  assert.equal('enableOledCareMode' in off, false);

  const kept = migrated(migrateStoredConfig, {
    enableOledCareMode: true,
    panelCareMode: 'qned'
  });
  assert.equal(kept['panelCareMode'], 'qned');
});

test('migrateStoredConfig drops retired keys and keeps the rest', async () => {
  const { migrateStoredConfig, BADGE_MODE_MARKER, NATIVE_CAST_MARKER } =
    await load();
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
  assert.deepEqual(out, {
    hideLogo: true,
    [BADGE_MODE_MARKER]: true,
    [NATIVE_CAST_MARKER]: true,
    blockWebosCast: false
  });
});

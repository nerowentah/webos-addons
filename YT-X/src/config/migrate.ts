// Pure stored-config migration: no DOM or storage access, so it runs under `node --test`.

/** Marker written once the one-time `pointerSettingsButton` inversion has run. */
export const BADGE_MODE_MARKER = 'badgeModeV2';

/** Marker written once the native-Cast wake default has been migrated. */
export const NATIVE_CAST_MARKER = 'nativeCastV1';

// Retired options. configRead() throws on unknown keys, so leftover values must go.
const RETIRED_KEYS: readonly string[] = [
  'uiTheme', // Classic Red is the only theme
  'removeBlackBorders', // the Liquid Glass toggle
  'showWatch', // the on-screen clock is gone
  'alwaysShowClock',
  'showYtxButton', // the badge is always shown
  'upgradeThumbnails', // upgrading is unconditional
  'enableScrollSeek', // never exposed in the panel
  'subtitleTranslateLang', // auto-translated subtitles and their module
  'subtitleAutoEnable',
  // Segment colors are a fixed palette now.
  'sponsorColor',
  'introColor',
  'outroColor',
  'interactionColor',
  'selfpromoColor',
  'musicofftopicColor',
  'previewColor',
  'poi_highlightColor',
  'fillerColor',
  'hookColor',
  'segmentColorScheme'
];

// The Shortcuts tab is gone, so its remote-key bindings are too.
const RETIRED_PREFIX = 'shortcut_key_';

/**
 * Upgrades a parsed stored configuration to the current schema. Returns a new object, or `null` when `parsed` is not a plain object.
 */
export function migrateStoredConfig(
  parsed: unknown
): Record<string, unknown> | null {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const config: Record<string, unknown> = { ...parsed };

  // The legacy OLED-Care toggle became the panel care selector.
  if ('enableOledCareMode' in config) {
    if (
      config['enableOledCareMode'] === true &&
      config['panelCareMode'] === undefined
    ) {
      config['panelCareMode'] = 'oled';
    }
    delete config['enableOledCareMode'];
  }

  for (const key of Object.keys(config)) {
    if (RETIRED_KEYS.includes(key) || key.startsWith(RETIRED_PREFIX)) {
      delete config[key];
    }
  }

  // One-time swap: the badge toggle's meaning inverted (Pointer-Only Button became Fixed Settings Panel Button), so a stored value flips once to keep each user's chosen behavior. The marker stops the swap after the value is written back; until then a re-run stays deterministic because storage is only swapped in memory.
  if (!config[BADGE_MODE_MARKER]) {
    if (config['pointerSettingsButton'] !== undefined) {
      config['pointerSettingsButton'] = !config['pointerSettingsButton'];
    }
    config[BADGE_MODE_MARKER] = true;
  }

  // Native Cast needs the cast-core wake to complete. The old default blocked
  // it, which left the receiver waiting and could hang the TV, so existing
  // installs flip to the new default once. A later explicit enable persists.
  if (!config[NATIVE_CAST_MARKER]) {
    config['blockWebosCast'] = false;
    config[NATIVE_CAST_MARKER] = true;
  }

  return config;
}

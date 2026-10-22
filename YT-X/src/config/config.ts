import { migrateStoredConfig } from './migrate';
import { UI_LABELS } from './ui-text';
import type { PanelCareMode } from '../platform/panel-type';

const CONFIG_KEY = 'ytx-configuration';

// Official SponsorBlock API; the community mirror is asked only when the official server fails.
export const sponsorblockAPI = 'https://sponsor.ajay.app/api';
export const sponsorblockFallbackAPI = 'https://sponsorblock.inf.re/api';

// One deadline per server, covering the headers and the body: a server that
// stalls mid-answer must not block the fallback server or the next refresh.
export const sponsorblockTimeoutMs = 5000;

/** Fixed SponsorBlock category colors, shared by the progress-bar overlay and the popup so the two surfaces agree; not user-configurable. */
export const segmentColors: Readonly<Record<string, string>> = {
  sponsor: '#00d400',
  intro: '#00ffff',
  outro: '#0202ed',
  interaction: '#cc00ff',
  selfpromo: '#ffff00',
  music_offtopic: '#ff9900',
  preview: '#008fd6',
  poi_highlight: '#ff1684',
  filler: '#7300ff',
  hook: '#395699'
};

/** Force Video Codec modes. 'auto' leaves negotiation to the player and server; everything else narrows what the player accepts (see force-codec.ts). 'no_av1' stays separate from 'vp9' so avoiding AV1 does not also exclude other codecs. */
export const videoCodecModes = {
  auto: 'Auto',
  av1: 'AV1',
  vp9: 'VP9',
  avc: 'AVC (H.264)',
  hevc: 'HEVC (H.265)',
  no_av1: 'Avoid AV1'
};
export type VideoCodecMode = keyof typeof videoCodecModes;

/**
 * Panel Care Mode: 'auto' resolves via tv-specs' UA model read (see resolvePanelCareMode); 'oled' is the true-black burn-in treatment, 'qned' a dark-grey, low-contrast UI that limits MiniLED blooming; unknown models resolve to 'off'.
 * Labels must stay this short - they render in the cycle control's one-line, fixed-width value column, where text overflows into the arrows.
 */
export const panelCareModes: Record<PanelCareMode, string> = {
  auto: 'Auto',
  off: 'Off',
  oled: 'OLED',
  qned: 'QNED'
};
export type { PanelCareMode };

const defaultConfig = {
  enableAdBlock: true,
  keepPlaybackTracking: true,
  removeShorts: false,
  removeMembersOnly: true,
  removeLiveVideos: false,
  removeUpcomingVideos: false,
  removeTopLiveGames: false,
  removeMostRelevant: false,
  enableTrackingBlock: false,
  disableAutoCaptions: false,
  loadRowsAhead: false,
  keyboardSearch: false,
  enableSponsorBlock: true,
  enableMutedSegments: false,
  sbPeriodicRefresh: true,
  enableSponsorBlockSponsor: true,
  enableSponsorBlockIntro: true,
  enableSponsorBlockOutro: true,
  enableSponsorBlockInteraction: true,
  enableSponsorBlockSelfPromo: true,
  enableSponsorBlockMusicOfftopic: true,
  enableSponsorBlockPreview: false,
  hideLogo: false,
  pointerSettingsButton: true,
  forceHighResVideo: false,
  showQualityOnStart: false,
  showTimeRemaining: false,
  blockWebosCast: true,
  removeEndscreen: false,
  keepPlaying: true,
  autoAccountSelect: false,
  panelCareMode: 'auto' as PanelCareMode,
  disableAnimations: false,
  fixMultilineTitles: true,
  forceVideoCodec: 'auto' as VideoCodecMode,
  skipSegmentsOnce: false,
  enableSponsorBlockFiller: false,
  enableSponsorBlockHook: false,
  enableSponsorBlockHighlight: false
};

export type ConfigValues = typeof defaultConfig;
export type ConfigKey = keyof ConfigValues;
/** Config keys that hold a boolean (the panel's checkboxes). */
export type BoolKey = {
  [K in ConfigKey]: ConfigValues[K] extends boolean ? K : never;
}[ConfigKey];

export interface ConfigChangeDetail<K extends ConfigKey = ConfigKey> {
  key: K;
  newValue: ConfigValues[K];
  oldValue: ConfigValues[K];
}

export type ConfigChangeListener<K extends ConfigKey = ConfigKey> = (
  evt: CustomEvent<ConfigChangeDetail<K>>
) => void;

const configKeys = Object.keys(defaultConfig) as ConfigKey[];

const configFrags = Object.fromEntries(
  configKeys.map((key) => [key, new DocumentFragment()])
) as Record<ConfigKey, DocumentFragment>;

/** What localStorage holds: the known options (plus the untyped migration marker). */
type StoredConfig = Partial<ConfigValues>;

const enumValues: Partial<Record<ConfigKey, readonly string[]>> = {
  panelCareMode: Object.keys(panelCareModes),
  forceVideoCodec: Object.keys(videoCodecModes)
};

function isValidValue(key: ConfigKey, value: unknown): boolean {
  if (typeof value !== typeof defaultConfig[key]) return false;
  const allowed = enumValues[key];
  return allowed === undefined || allowed.includes(value as string);
}

function loadStoredConfig(): StoredConfig | null {
  const storage = window.localStorage.getItem(CONFIG_KEY);

  if (storage === null) {
    return null;
  }

  try {
    const migrated = migrateStoredConfig(JSON.parse(storage));
    if (migrated === null) return null;

    // A hand-edited or downgraded value of the wrong type would break the panel; fall back to the default instead.
    for (const key of configKeys) {
      if (migrated[key] !== undefined && !isValidValue(key, migrated[key])) {
        delete migrated[key];
      }
    }

    // Checked above: every known key holds a value of its declared type.
    return migrated;
  } catch {
    return null;
  }
}

// Use defaultConfig as a prototype so writes to localConfig don't change it.
const localConfig: StoredConfig =
  loadStoredConfig() ?? (Object.create(defaultConfig) as StoredConfig);

function configExists(key: string): key is ConfigKey {
  return Object.hasOwn(defaultConfig, key);
}

export function configGetDesc(key: ConfigKey): string {
  if (!configExists(key)) {
    throw new Error('tried to get desc for unknown config key: ' + String(key));
  }

  return UI_LABELS[key];
}

export function configRead<K extends ConfigKey>(key: K): ConfigValues[K] {
  if (!configExists(key)) {
    throw new Error('tried to read unknown config key: ' + String(key));
  }

  const stored: ConfigValues[K] | undefined = localConfig[key];
  if (stored !== undefined) return stored;

  localConfig[key] = defaultConfig[key];
  return defaultConfig[key];
}

export function configWrite<K extends ConfigKey>(
  key: K,
  value: ConfigValues[K]
): void {
  if (!configExists(key)) {
    throw new Error('tried to write unknown config key: ' + String(key));
  }

  const oldValue: ConfigValues[K] = localConfig[key] ?? defaultConfig[key];

  localConfig[key] = value;
  window.localStorage[CONFIG_KEY] = JSON.stringify(localConfig);

  configFrags[key].dispatchEvent(
    new CustomEvent<ConfigChangeDetail<K>>('ytxConfigChange', {
      detail: { key, newValue: value, oldValue }
    })
  );
}

/** Add a listener for changes in the value of a specified config option. */
export function configAddChangeListener<K extends ConfigKey>(
  key: K,
  callback: ConfigChangeListener<K>
): void {
  configFrags[key].addEventListener(
    'ytxConfigChange',
    callback as EventListener
  );
}

/** Remove a listener added with configAddChangeListener. */
export function configRemoveChangeListener<K extends ConfigKey>(
  key: K,
  callback: ConfigChangeListener<K>
): void {
  configFrags[key].removeEventListener(
    'ytxConfigChange',
    callback as EventListener
  );
}

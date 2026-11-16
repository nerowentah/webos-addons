import { migrateStoredConfig } from './migrate';
import {
  createConfigStore,
  type ConfigChangeDetail as StoreChangeDetail,
  type ConfigStore
} from './config-store';
import { UI_LABELS } from './ui-text';
import type { PanelCareMode } from '../platform/panel-type';

const CONFIG_KEY = 'ytx-configuration';

// Official SponsorBlock API; the community mirror is asked only when the official server fails.
export const sponsorblockAPI = 'https://sponsor.ajay.app/api';
export const sponsorblockFallbackAPI = 'https://sponsorblock.inf.re/api';

// One deadline per server, covering the headers and the body: a server that
// stalls mid-answer must not block the fallback server or the next refresh.
export const sponsorblockTimeoutMs = 5000;

/** Force Video Codec modes. 'auto' leaves negotiation to the player and server; everything else narrows what the player accepts (see force-codec.ts). 'no_av1' stays separate from 'vp9' so avoiding AV1 does not also exclude other codecs. */
export const videoCodecModes = {
  auto: 'Auto',
  av1: 'AV1',
  vp9: 'VP9',
  avc: 'AVC (H.264)',
  hevc: 'HEVC (H.265)',
  no_av1: 'Avoid AV1'
};
type VideoCodecMode = keyof typeof videoCodecModes;

/** Text Size: scales YT-X's own text (panel, toasts, badge, popup) only. */
export const textScaleModes = {
  normal: '100%',
  large: '125%',
  huge: '150%',
  maximum: '200%'
};
type TextScaleMode = keyof typeof textScaleModes;

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

/** Playback Speed: the rates the panel cycles through; the key is the rate itself. */
export const playbackSpeedModes = {
  '1': '1x',
  '1.25': '1.25x',
  '1.5': '1.5x',
  '1.75': '1.75x',
  '2': '2x'
};
type PlaybackSpeedMode = keyof typeof playbackSpeedModes;

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
  blockWebosCast: false,
  removeEndscreen: false,
  keepPlaying: true,
  autoAccountSelect: false,
  panelCareMode: 'auto' as PanelCareMode,
  disableAnimations: false,
  forceVideoCodec: 'auto' as VideoCodecMode,
  uiTextScale: 'normal' as TextScaleMode,
  playbackSpeed: '1' as PlaybackSpeedMode,
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

type ConfigChangeDetail<K extends ConfigKey = ConfigKey> = StoreChangeDetail<
  ConfigValues,
  K
>;

export type ConfigChangeListener<K extends ConfigKey = ConfigKey> = (
  evt: CustomEvent<ConfigChangeDetail<K>>
) => void;

const enumValues: Partial<Record<ConfigKey, readonly string[]>> = {
  panelCareMode: Object.keys(panelCareModes),
  forceVideoCodec: Object.keys(videoCodecModes),
  uiTextScale: Object.keys(textScaleModes),
  playbackSpeed: Object.keys(playbackSpeedModes)
};

// Created on first use so importing this module touches neither window nor storage.
let store: ConfigStore<ConfigValues> | undefined;
const getStore = (): ConfigStore<ConfigValues> =>
  (store ??= createConfigStore<ConfigValues>({
    defaults: defaultConfig,
    enumValues,
    storageKey: CONFIG_KEY,
    storage: window.localStorage,
    migrate: (raw) => migrateStoredConfig(raw) as Partial<ConfigValues> | null
  }));

export function configGetDesc(key: ConfigKey): string {
  if (!Object.hasOwn(defaultConfig, key)) {
    throw new Error('tried to get desc for unknown config key: ' + String(key));
  }

  return UI_LABELS[key];
}

export function configRead<K extends ConfigKey>(key: K): ConfigValues[K] {
  installReplay();
  return getStore().read(key);
}

// The native Cobalt build runs two bundles on one page (early hooks, late UI),
// each with its own store; a write in one is replayed into the other.
const ORIGIN_ID = Math.random().toString(36).slice(2);
const WRITE_EVENT = 'ytx-config-write';

interface WriteBroadcast {
  origin: string;
  key: ConfigKey;
  value: ConfigValues[ConfigKey];
}

let replayInstalled = false;
function installReplay(): void {
  if (replayInstalled || typeof window === 'undefined') return;
  replayInstalled = true;
  window.addEventListener(WRITE_EVENT, (evt) => {
    const detail = (evt as CustomEvent<WriteBroadcast>).detail;
    if (detail.origin === ORIGIN_ID) return;
    // Straight to the store: replaying through configWrite would echo it back.
    getStore().write(detail.key, detail.value as never);
  });
}

export function configWrite<K extends ConfigKey>(
  key: K,
  value: ConfigValues[K]
): void {
  installReplay();
  getStore().write(key, value);
  window.dispatchEvent(
    new CustomEvent<WriteBroadcast>(WRITE_EVENT, {
      detail: { origin: ORIGIN_ID, key, value }
    })
  );
}

/** Add a listener for changes in the value of a specified config option. */
export function configAddChangeListener<K extends ConfigKey>(
  key: K,
  callback: ConfigChangeListener<K>
): void {
  getStore().addChangeListener(key, callback);
}

/** Remove a listener added with configAddChangeListener. */
export function configRemoveChangeListener<K extends ConfigKey>(
  key: K,
  callback: ConfigChangeListener<K>
): void {
  getStore().removeChangeListener(key, callback);
}

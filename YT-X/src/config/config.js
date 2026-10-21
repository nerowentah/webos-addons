import { UI_LABELS } from './ui-text.js';

const CONFIG_KEY = 'ytx-configuration';

// Official SponsorBlock API; the community mirror is asked only when the official server fails.
export const sponsorblockAPI = 'https://sponsor.ajay.app/api';
export const sponsorblockFallbackAPI = 'https://sponsorblock.inf.re/api';

// One deadline per server, covering the headers and the body: a server that
// stalls mid-answer must not block the fallback server or the next refresh.
export const sponsorblockTimeoutMs = 5000;

/** Fixed SponsorBlock category colors, shared by the progress-bar overlay and the popup so the two surfaces agree; not user-configurable. */
export const segmentColors = {
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

/** Force Video Codec modes. 'auto' leaves negotiation to the player and server; everything else narrows what the player accepts (see force-codec.js). 'no_av1' stays separate from 'vp9' so avoiding AV1 does not also exclude other codecs. */
export const videoCodecModes = {
  auto: 'Auto',
  av1: 'AV1',
  vp9: 'VP9',
  avc: 'AVC (H.264)',
  hevc: 'HEVC (H.265)',
  no_av1: 'Avoid AV1'
};

/**
 * Panel Care Mode: 'auto' resolves via tv-specs' UA model read (see resolvePanelCareMode); 'oled' is the true-black burn-in treatment, 'qned' a dark-grey, low-contrast UI that limits MiniLED blooming; unknown models resolve to 'off'.
 * Labels must stay this short - they render in the cycle control's one-line, fixed-width value column, where text overflows into the arrows.
 */
export const panelCareModes = {
  auto: 'Auto',
  off: 'Off',
  oled: 'OLED',
  qned: 'QNED'
};

const configOptions = new Map([
  ['enableAdBlock', { default: true, desc: UI_LABELS.enableAdBlock }],
  [
    'keepPlaybackTracking',
    { default: true, desc: UI_LABELS.keepPlaybackTracking }
  ],
  ['removeShorts', { default: false, desc: UI_LABELS.removeShorts }],
  ['removeMembersOnly', { default: true, desc: UI_LABELS.removeMembersOnly }],
  ['removeLiveVideos', { default: false, desc: UI_LABELS.removeLiveVideos }],
  [
    'removeUpcomingVideos',
    { default: false, desc: UI_LABELS.removeUpcomingVideos }
  ],
  [
    'removeTopLiveGames',
    { default: false, desc: UI_LABELS.removeTopLiveGames }
  ],
  [
    'removeMostRelevant',
    { default: false, desc: UI_LABELS.removeMostRelevant }
  ],
  [
    'enableTrackingBlock',
    { default: false, desc: UI_LABELS.enableTrackingBlock }
  ],
  [
    'disableAutoCaptions',
    { default: false, desc: UI_LABELS.disableAutoCaptions }
  ],
  ['loadRowsAhead', { default: false, desc: UI_LABELS.loadRowsAhead }],
  ['keyboardSearch', { default: false, desc: UI_LABELS.keyboardSearch }],
  ['enableSponsorBlock', { default: true, desc: UI_LABELS.enableSponsorBlock }],
  [
    'enableMutedSegments',
    { default: false, desc: UI_LABELS.enableMutedSegments }
  ],
  ['sbPeriodicRefresh', { default: true, desc: UI_LABELS.sbPeriodicRefresh }],
  [
    'enableSponsorBlockSponsor',
    { default: true, desc: UI_LABELS.enableSponsorBlockSponsor }
  ],
  [
    'enableSponsorBlockIntro',
    { default: true, desc: UI_LABELS.enableSponsorBlockIntro }
  ],
  [
    'enableSponsorBlockOutro',
    { default: true, desc: UI_LABELS.enableSponsorBlockOutro }
  ],
  [
    'enableSponsorBlockInteraction',
    { default: true, desc: UI_LABELS.enableSponsorBlockInteraction }
  ],
  [
    'enableSponsorBlockSelfPromo',
    { default: true, desc: UI_LABELS.enableSponsorBlockSelfPromo }
  ],
  [
    'enableSponsorBlockMusicOfftopic',
    { default: true, desc: UI_LABELS.enableSponsorBlockMusicOfftopic }
  ],
  [
    'enableSponsorBlockPreview',
    { default: false, desc: UI_LABELS.enableSponsorBlockPreview }
  ],
  ['hideLogo', { default: false, desc: UI_LABELS.hideLogo }],
  [
    'pointerSettingsButton',
    { default: true, desc: UI_LABELS.pointerSettingsButton }
  ],
  ['forceHighResVideo', { default: false, desc: UI_LABELS.forceHighResVideo }],
  [
    'showQualityOnStart',
    { default: false, desc: UI_LABELS.showQualityOnStart }
  ],
  ['showTimeRemaining', { default: false, desc: UI_LABELS.showTimeRemaining }],
  ['blockWebosCast', { default: true, desc: UI_LABELS.blockWebosCast }],
  ['removeEndscreen', { default: false, desc: UI_LABELS.removeEndscreen }],
  ['keepPlaying', { default: true, desc: UI_LABELS.keepPlaying }],
  ['autoAccountSelect', { default: false, desc: UI_LABELS.autoAccountSelect }],
  ['panelCareMode', { default: 'auto', desc: UI_LABELS.panelCareMode }],
  ['disableAnimations', { default: false, desc: UI_LABELS.disableAnimations }],
  ['fixMultilineTitles', { default: true, desc: UI_LABELS.fixMultilineTitles }],
  ['forceVideoCodec', { default: 'auto', desc: UI_LABELS.forceVideoCodec }],
  ['skipSegmentsOnce', { default: false, desc: UI_LABELS.skipSegmentsOnce }],
  [
    'enableSponsorBlockFiller',
    { default: false, desc: UI_LABELS.enableSponsorBlockFiller }
  ],
  [
    'enableSponsorBlockHook',
    { default: false, desc: UI_LABELS.enableSponsorBlockHook }
  ],
  [
    'enableSponsorBlockHighlight',
    { default: false, desc: UI_LABELS.enableSponsorBlockHighlight }
  ]
]);

const defaultConfig = (() => {
  let ret = {};
  for (const [k, v] of configOptions) {
    ret[k] = v.default;
  }
  return ret;
})();

/** @type {Record<string, DocumentFragment>} as const */
const configFrags = (() => {
  let ret = {};
  for (const k of configOptions.keys()) {
    ret[k] = new DocumentFragment();
  }
  return ret;
})();

function loadStoredConfig() {
  const storage = window.localStorage.getItem(CONFIG_KEY);

  if (storage === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(storage);

    // Migrate the legacy OLED-Care toggle to the panel care selector.
    if (parsed && Object.keys(parsed).includes('enableOledCareMode')) {
      if (
        parsed.enableOledCareMode === true &&
        parsed.panelCareMode === undefined
      ) {
        parsed.panelCareMode = 'oled';
      }
      delete parsed.enableOledCareMode;
    }

    // Drop the retired UI theme key (Classic Red is now the only theme);
    // unknown-key configRead() throws, so a stored value would break the panel.
    if (parsed && Object.keys(parsed).includes('uiTheme')) {
      delete parsed.uiTheme;
    }

    // Drop the retired Liquid Glass toggle; deleting it (rather than a hidden no-op checkbox) also keeps unknown-key configRead() from throwing.
    if (parsed && Object.keys(parsed).includes('removeBlackBorders')) {
      delete parsed.removeBlackBorders;
    }

    // Drop the retired clock toggles (the on-screen clock is gone); leftover values would break configRead(), which throws on unknown keys.
    if (parsed) {
      delete parsed.showWatch;
      delete parsed.alwaysShowClock;
    }

    // Drop the retired badge toggle (the on-screen badge is always shown now).
    if (parsed) {
      delete parsed.showYtxButton;
    }

    // One-time swap: the badge toggle's meaning inverted (Pointer-Only Button
    // became Fixed Settings Panel Button), so a stored value flips once to keep
    // each user's chosen behavior. The marker stops the swap after the value is
    // written back; until then a re-run stays deterministic because storage is
    // only swapped in memory.
    if (parsed && !parsed.badgeModeV2) {
      if (parsed.pointerSettingsButton !== undefined) {
        parsed.pointerSettingsButton = !parsed.pointerSettingsButton;
      }
      parsed.badgeModeV2 = true;
    }

    // Drop the retired thumbnail toggle (upgrading is unconditional now).
    if (parsed) {
      delete parsed.upgradeThumbnails;
    }

    // Drop the retired scroll-wheel-seek toggle; the feature was never exposed
    // in the panel and has been removed.
    if (parsed) {
      delete parsed.enableScrollSeek;
    }

    // Drop the retired auto-translated subtitle options and their module.
    if (parsed) {
      delete parsed.subtitleTranslateLang;
      delete parsed.subtitleAutoEnable;
    }

    // Drop the retired remote-key shortcut bindings (Shortcuts tab is gone).
    if (parsed) {
      for (const key of Object.keys(parsed)) {
        if (key.startsWith('shortcut_key_')) {
          delete parsed[key];
        }
      }
    }

    // Drop the retired segment color keys (colors are now a fixed palette).
    if (parsed) {
      for (const key of [
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
      ]) {
        delete parsed[key];
      }
    }

    return parsed;
  } catch {
    return null;
  }
}

// Use defaultConfig as a prototype so writes to localConfig don't change it.
let localConfig = loadStoredConfig() ?? Object.create(defaultConfig);

function configExists(key) {
  return configOptions.has(key);
}

export function configGetDesc(key) {
  if (!configExists(key)) {
    throw new Error('tried to get desc for unknown config key: ' + key);
  }

  return configOptions.get(key).desc;
}

export function configRead(key) {
  if (!configExists(key)) {
    throw new Error('tried to read unknown config key: ' + key);
  }

  if (localConfig[key] === undefined) {
    localConfig[key] = defaultConfig[key];
  }

  return localConfig[key];
}

export function configWrite(key, value) {
  if (!configExists(key)) {
    throw new Error('tried to write unknown config key: ' + key);
  }

  const oldValue =
    localConfig[key] !== undefined ? localConfig[key] : defaultConfig[key];

  localConfig[key] = value;
  window.localStorage[CONFIG_KEY] = JSON.stringify(localConfig);

  configFrags[key].dispatchEvent(
    new CustomEvent('ytxConfigChange', {
      detail: { key, newValue: value, oldValue }
    })
  );
}

/**
 * Add a listener for changes in the value of a specified config option
 * @param {string} key Config option to monitor
 * @param {(evt: Event) => void} callback Function to be called on change
 */
export function configAddChangeListener(key, callback) {
  const frag = configFrags[key];

  frag.addEventListener('ytxConfigChange', callback);
}

/**
 * Remove a listener for changes in the value of a specified config option
 * @param {string} key Config option to monitor
 * @param {(evt: Event) => void} callback Function to be called on change
 */
export function configRemoveChangeListener(key, callback) {
  const frag = configFrags[key];

  frag.removeEventListener('ytxConfigChange', callback);
}

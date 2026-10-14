import { UI_LABELS } from './ui-text.js';

const CONFIG_KEY = 'ytx-configuration';

// Official SponsorBlock API, with the community mirror asked only when the
// official server fails.
export const sponsorblockAPI = 'https://sponsor.ajay.app/api';
export const sponsorblockFallbackAPI = 'https://sponsorblock.inf.re/api';

// One deadline per server, covering the headers and the body: a server that
// stalls mid-answer must not block the fallback server or the next refresh.
export const sponsorblockTimeoutMs = 5000;

/**
 * Standard SponsorBlock segment colors.
 *
 * Fixed palette keyed by the SponsorBlock API category (note the API's
 * 'music_offtopic'). Used by both the progress-bar overlay and the popup so
 * the two surfaces always agree. Not user-configurable.
 */
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

/**
 * Force Video Codec.
 *
 * 'auto' leaves the player and the server to negotiate, which is what the app
 * has always done. Everything else narrows what the player will accept - see
 * force-codec.js. 'no_av1' is kept separate from 'vp9' because opting out of
 * AV1 should not also cost a set its AVC fallback.
 */
export const videoCodecModes = {
  auto: 'Auto',
  av1: 'AV1',
  vp9: 'VP9',
  avc: 'AVC (H.264)',
  hevc: 'HEVC (H.265)',
  no_av1: 'Avoid AV1'
};

/**
 * Panel Care Mode.
 *
 * 'off' leaves the UI untouched. 'auto' asks tv-specs to read the model out of
 * the app UA and picks 'oled' or 'qned' from it, so a QNED that has never
 * opened the panel still gets the right treatment; see resolvePanelCareMode().
 * 'oled' applies the true-black treatment that reduces OLED burn-in risk (and
 * is what the app has always done). 'qned' targets QNED / MiniLED (LCD) panels,
 * which have no permanent burn-in but benefit from a dark-grey, low-contrast UI
 * and semi-transparent scrims that keep MiniLED local-dimming zones from
 * blooming/haloing around bright text.
 *
 * auto resolves to 'off' when the model is unknown or unrecognised, so 'auto' is
 * never brighter than the user would have got by leaving it off.
 *
 * The labels are deliberately bare - just the panel type, no "Care" suffix or
 * "True Black UI" hint. They render in the cycle control's value column, which
 * holds one line at a fixed width, so a descriptive label overflows into the
 * arrows instead of wrapping. videoCodecModes, the other cycle control in this
 * panel, keeps its labels to the same discipline ('AVC (H.264)', 'Avoid AV1');
 * the row's own name already says "Panel Care Mode", so repeating it per value
 * only competes with the value. The reasoning for each mode lives in the doc
 * comment above, which is where someone changing a label will look.
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
  ['enableScrollSeek', { default: false, desc: UI_LABELS.enableScrollSeek }],
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
    { default: false, desc: UI_LABELS.pointerSettingsButton }
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
    console.info('Config not set; using defaults.');
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

    // Drop the retired UI theme key. Classic Red is now the only theme, so
    // there is nothing for a stored 'blue-force-field' or 'classic-red' to
    // select. This has to happen here rather than being left to sit unused:
    // configRead() throws on an unknown key, and the stored value is read back
    // straight into localConfig, so a leftover key would break the panel.
    if (parsed && Object.keys(parsed).includes('uiTheme')) {
      delete parsed.uiTheme;
    }

    // Drop the retired Liquid Glass toggle along with its stylesheet. The
    // selectors it drove were legacy ytd-* names that this build's ytlr-* React
    // markup no longer renders, so the option could only ever restyle nothing.
    // Deleted rather than left inert because configRead() throws on an unknown
    // key: keeping the option as a hidden no-op would preserve a checkbox the
    // feature no longer backs.
    if (parsed && Object.keys(parsed).includes('removeBlackBorders')) {
      delete parsed.removeBlackBorders;
    }

    // Drop the retired clock toggles along with the widget they drove. The
    // on-screen clock is gone, so both keys are now unknown to configRead(),
    // which throws on an unknown key - a stored value left in place would
    // break the panel on the next load for anyone who had enabled the clock.
    if (parsed) {
      delete parsed.showWatch;
      delete parsed.alwaysShowClock;
    }

    // The on-screen YT-X badge is always shown now, so the toggle is gone. A
    // leftover value would sit in localConfig unknown to configRead() (which
    // throws on an unknown key) and break the panel on the next load.
    if (parsed) {
      delete parsed.showYtxButton;
    }

    // Thumbnail upgrading is now unconditional, so the toggle is gone. A
    // leftover value would sit in localConfig unknown to configRead() (which
    // throws on an unknown key) and break the panel on the next load.
    if (parsed) {
      delete parsed.upgradeThumbnails;
    }

    // Drop the retired auto-translated subtitle options along with the module
    // that drove them. configRead() no longer knows either key, so a leftover
    // value would sit in localConfig unknown to the panel.
    if (parsed) {
      delete parsed.subtitleTranslateLang;
      delete parsed.subtitleAutoEnable;
    }

    // Drop the retired remote-key shortcut bindings. The Shortcuts tab and its
    // `shortcut_key_*` options are gone, so configRead() no longer knows these
    // keys; a leftover value would sit in localConfig unknown to the panel.
    if (parsed) {
      for (const key of Object.keys(parsed)) {
        if (key.startsWith('shortcut_key_')) {
          delete parsed[key];
        }
      }
    }

    // Drop the retired segment color keys along with the Segment Colors UI.
    // Segment colors are now a fixed palette, so configRead() no longer knows
    // these keys - a leftover value would sit in localConfig unknown to the
    // panel and break it on the next load.
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
  } catch (err) {
    console.warn('Error parsing stored config:', err);
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
    console.warn(
      'Populating key',
      key,
      'with default value',
      defaultConfig[key]
    );

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

  console.info('Changing key', key, 'from', oldValue, 'to', value);
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

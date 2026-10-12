const CONFIG_KEY = 'ytx-configuration';

// Official SponsorBlock API.
export const sponsorblockAPI = 'https://sponsor.ajay.app/api';

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
  ['enableAdBlock', { default: true, desc: 'Enable ad blocking' }],
  ['upgradeThumbnails', { default: true, desc: 'Upgrade thumbnail quality' }],
  ['removeShorts', { default: false, desc: 'Remove shorts' }],
  ['removeMembersOnly', { default: true, desc: 'Hide members-only videos' }],
  ['enableSponsorBlock', { default: true, desc: 'Enable SponsorBlock' }],
  [
    'enableSponsorBlockSponsor',
    { default: true, desc: 'Skip sponsor segments' }
  ],
  ['enableSponsorBlockIntro', { default: true, desc: 'Skip intro segments' }],
  ['enableSponsorBlockOutro', { default: true, desc: 'Skip outro segments' }],
  [
    'enableSponsorBlockInteraction',
    {
      default: true,
      desc: 'Skip interaction reminder segments'
    }
  ],
  [
    'enableSponsorBlockSelfPromo',
    {
      default: true,
      desc: 'Skip self promotion segments'
    }
  ],
  [
    'enableSponsorBlockMusicOfftopic',
    {
      default: true,
      desc: 'Skip non-music segments in music videos'
    }
  ],
  [
    'enableSponsorBlockPreview',
    {
      default: false,
      desc: 'Skip recaps and previews'
    }
  ],
  [
    'hideLogo',
    {
      default: false,
      desc: 'Hide YouTube logo'
    }
  ],
  [
    'showYtxButton',
    {
      default: true,
      desc: 'Show the YT-X settings button on screen'
    }
  ],
  [
    'forceHighResVideo',
    {
      default: false,
      desc: 'Force max resolution video playback'
    }
  ],
  [
    'removeEndscreen',
    {
      default: false,
      desc: 'Remove end screens from video'
    }
  ],
  [
    'keepPlaying',
    {
      default: true,
      desc: 'Keep playing (prevent auto-pause)'
    }
  ],
  [
    'autoAccountSelect',
    {
      default: false,
      desc: 'Bypass initial account selection on startup'
    }
  ],
  ['panelCareMode', { default: 'auto', desc: 'Panel Care Mode' }],
  ['videoShelfOpacity', { default: 100, desc: 'Video shelf opacity' }],
  ['fixMultilineTitles', { default: true, desc: 'Fix Multiline Titles' }],
  ['forceVideoCodec', { default: 'auto', desc: 'Force Video Codec' }],
  ['skipSegmentsOnce', { default: false, desc: 'Skip Segments Once' }],
  [
    'enableSponsorBlockFiller',
    { default: false, desc: 'Skip tangents/jokes segments' }
  ],
  [
    'enableSponsorBlockHook',
    { default: false, desc: 'Skip hook/greetings segments' }
  ],
  [
    'enableSponsorBlockHighlight',
    { default: false, desc: 'Skip to highlight segments' }
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

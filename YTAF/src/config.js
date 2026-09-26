const CONFIG_KEY = 'ytaf-configuration';

// Official SponsorBlock API.
export const sponsorblockAPI = 'https://sponsor.ajay.app/api';

export const segmentTypes = {
  sponsor: { color: '#00d400', name: 'sponsored' },
  intro: { color: '#00ffff', name: 'intro' },
  outro: { color: '#0202ed', name: 'outro' },
  interaction: { color: '#cc00ff', name: 'interaction reminder' },
  selfpromo: { color: '#ffff00', name: 'self-promotion' },
  musicofftopic: { color: '#ff9900', name: 'non-music part' },
  preview: { color: '#008fd6', name: 'recap or preview' },
  poi_highlight: { color: '#ff1684', name: 'highlight' },
  filler: { color: '#7300ff', name: 'tangents/jokes' },
  hook: { color: '#395699', name: 'hook/greetings' }
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
 * 'off' leaves the UI untouched. 'oled' applies the true-black treatment that
 * reduces OLED burn-in risk (and is what the app has always done). 'qned'
 * targets QNED / MiniLED (LCD) panels, which have no permanent burn-in but
 * benefit from a dark-grey, low-contrast UI and semi-transparent scrims that
 * keep MiniLED local-dimming zones from blooming/haloing around bright text.
 */
export const panelCareModes = {
  off: 'Off',
  oled: 'OLED-Care (True Black UI)',
  qned: 'QNED MiniLED-Care (Dark Comfort UI)'
};

const configOptions = new Map([
  ['enableAdBlock', { default: true, desc: 'Enable ad blocking' }],
  ['upgradeThumbnails', { default: true, desc: 'Upgrade thumbnail quality' }],
  [
    'removeShorts',
    { default: false, desc: 'Remove Shorts from subscriptions' }
  ],
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
    'showWatch',
    {
      default: false,
      desc: 'Display time in UI'
    }
  ],
  [
    'alwaysShowClock',
    {
      default: false,
      desc: 'Always show the clock, even on hover'
    }
  ],
  [
    'showYtafButton',
    {
      default: true,
      desc: 'Show the YTAF settings button on screen'
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
    'autoAccountSelect',
    {
      default: false,
      desc: 'Bypass initial account selection on startup'
    }
  ],
  ['uiTheme', { default: 'blue-force-field', desc: 'UI Theme' }],
  ['panelCareMode', { default: 'off', desc: 'Panel Care Mode' }],
  ['videoShelfOpacity', { default: 100, desc: 'Video shelf opacity' }],
  ['fixMultilineTitles', { default: true, desc: 'Fix Multiline Titles' }],
  ['removeBlackBorders', { default: false, desc: 'New Liquid Glass UI' }],
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

for (const [key, value] of Object.entries(segmentTypes)) {
  configOptions.set(`${key}Color`, {
    default: value.color,
    desc: `Color for ${value.name}`
  });
}

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

export function configGetDefault(key) {
  if (!configExists(key)) {
    throw new Error('tried to get default for unknown config key: ' + key);
  }

  return configOptions.get(key).default;
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
    new CustomEvent('ytafConfigChange', {
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

  frag.addEventListener('ytafConfigChange', callback);
}

/**
 * Remove a listener for changes in the value of a specified config option
 * @param {string} key Config option to monitor
 * @param {(evt: Event) => void} callback Function to be called on change
 */
export function configRemoveChangeListener(key, callback) {
  const frag = configFrags[key];

  frag.removeEventListener('ytafConfigChange', callback);
}

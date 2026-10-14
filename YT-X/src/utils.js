const CONTENT_INTENT_REGEX = /^.+(?=Content)/g;

export function extractLaunchParams() {
  if (!window.launchParams) return {};

  try {
    return JSON.parse(window.launchParams);
  } catch {
    // Platform-launched params are not guaranteed to be valid JSON.
    console.warn('ignoring malformed launchParams');
    return {};
  }
}

function getYTURL() {
  const ytURL = new URL('https://www.youtube.com/tv#/');
  ytURL.searchParams.append('env_forceFullAnimation', '1');
  ytURL.searchParams.append('env_enableWebSpeech', '1');
  ytURL.searchParams.append('env_enableVoice', '1');
  return ytURL;
}

/**
 * Creates a new URLSearchPrams with the contents of `a` and `b`
 * @param {URLSearchParams} a
 * @param {URLSearchParams} b
 * @returns {URLSearchParams}
 */
function concatSearchParams(a, b) {
  return new URLSearchParams([...a.entries(), ...b.entries()]);
}

/**
 * The launch params' content target: YouTube's `contentTarget`, falling back to
 * the app's custom `target` (see handleLaunch for why both exist).
 * @param {unknown} params
 * @returns {string | undefined}
 */
export function contentTargetOf(params) {
  const { target, contentTarget = target } = params ?? {};
  return contentTarget;
}

export function handleLaunch(params) {
  console.info('handleLaunch', params);
  let ytURL = getYTURL();

  // We use our custom "target" param, since launches with "contentTarget"
  // parameter do not respect "handlesRelaunch" appinfo option. We still
  // fallback to "contentTarget" if our custom param is not specified.
  //
  let contentTarget = contentTargetOf(params);

  /** TODO: Handle google assistant
   * Sample: {contentTarget: "v=v=<ID>", storeCaller: "voice", subReason: "voiceAgent", voiceEngine: "googleAssistant"}
   */

  switch (typeof contentTarget) {
    case 'string': {
      if (contentTarget.length > 2048) {
        console.warn('Overlong contentTarget ignored');
        break;
      }
      let direct;
      try {
        direct = new URL(contentTarget);
      } catch {
        direct = null;
      }
      if (
        direct &&
        direct.protocol === 'https:' &&
        direct.origin === ytURL.origin
      ) {
        console.info('Launching from direct contentTarget');
        ytURL = direct;
      } else {
        // Out of app dial launch with second screen on home: { contentTarget: 'pairingCode=<UUID>&theme=cl&dialLaunch=watch' }
        console.info('Launching from partial contentTarget');
        if (contentTarget.indexOf('v=v=') === 0)
          contentTarget = contentTarget.substring(2);

        ytURL.search = concatSearchParams(
          ytURL.searchParams,
          new URLSearchParams(contentTarget)
        );
      }
      break;
    }
    case 'object': {
      if (contentTarget === null) break;
      console.info('Voice launch');

      const { intent, intentParam } = contentTarget;
      if (typeof intent !== 'string' || typeof intentParam !== 'string') {
        console.warn('Invalid voice launch params');
        break;
      }
      // Ctrl+F tvhtml5LaunchUrlComponentChanged & REQUEST_ORIGIN_GOOGLE_ASSISTANT in base.js for info
      const search = ytURL.searchParams;
      // contentTarget.intent's seen so far: PlayContent, SearchContent
      const voiceContentIntent = intent
        .match(CONTENT_INTENT_REGEX)?.[0]
        ?.toLowerCase();

      search.set('inApp', true);
      search.set('vs', 9); // Voice System is VOICE_SYSTEM_LG_THINKQ
      voiceContentIntent && search.set('va', voiceContentIntent);

      // order is important
      search.append('launch', 'voice');
      voiceContentIntent === 'search' && search.append('launch', 'search');

      search.set('vq', intentParam.slice(0, 512));
      break;
    }
    default: {
      console.info('Default launch');
    }
  }

  window.location.href = ytURL.toString();
}

/**
 * Wait for a child element to be added for which a predicate is true.
 *
 * When `observeAttributes` is false, the predicate is checked only when a node
 * is first added. If you want the predicate to run every time an attribute is
 * modified, set `observeAttributes` to true.
 * @template {Node} T
 * @param {Element} parent Root of tree to watch
 * @param {(node: Node) => node is T} predicate Function that checks whether its argument is the desired element
 * @param {boolean} observeAttributes Also run predicate on attribute changes
 * @param {AbortSignal=} abortSignal Signal that can be used to stop waiting
 * @return {Promise<T>} Matched element
 */
export async function waitForChildAdd(
  parent,
  predicate,
  observeAttributes,
  abortSignal
) {
  return new Promise((resolve, reject) => {
    const obs = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        switch (mut.type) {
          case 'attributes': {
            if (predicate(mut.target)) {
              obs.disconnect();
              resolve(mut.target);
              return;
            }
            break;
          }
          case 'childList': {
            for (const node of mut.addedNodes) {
              if (predicate(node)) {
                obs.disconnect();
                resolve(node);
                return;
              }
            }
            break;
          }
        }
      }
    });

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        obs.disconnect();
        reject(new Error('aborted'));
      });
    }

    obs.observe(parent, {
      subtree: true,
      attributes: observeAttributes,
      childList: true
    });
  });
}

export const SELECTORS = {
  PLAYER_ID: 'ytlr-player__player-container-player',
  PLAYER_CONTAINER: 'ytlr-player__player-container',
  WATCH_PAGE_CLASS: 'WEB_PAGE_TYPE_WATCH',
  SHORTS_PAGE_CLASS: 'WEB_PAGE_TYPE_SHORTS',
  ACCOUNT_SELECTOR: 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR',
  SEARCH_PAGE_CLASS: 'WEB_PAGE_TYPE_SEARCH'
};

export const REMOTE_KEYS = {
  ENTER: { code: 13, key: 'Enter' },
  BACK: { code: 461, key: 'Back' },
  LEFT: { code: 37, key: 'ArrowLeft' },
  UP: { code: 38, key: 'ArrowUp' },
  RIGHT: { code: 39, key: 'ArrowRight' },
  DOWN: { code: 40, key: 'ArrowDown' },
  RED: { code: 403, key: 'Red', alt: [166] },
  GREEN: { code: 404, key: 'Green', alt: [172] },
  YELLOW: { code: 405, key: 'Yellow', alt: [170] },
  BLUE: { code: 406, key: 'Blue', alt: [167, 191] }
};

// Numeric keys 0-9 are mechanical: keyCode 48 + n.
for (let i = 0; i <= 9; i++) REMOTE_KEYS[i] = { code: 48 + i, key: String(i) };

// Single source of truth for colour-key codes, including the alternate codes
// emitted by some webOS remotes. Consumed by keyboard-search and the shortcut
// handlers instead of maintaining a parallel table.
export const COLOR_CODE_MAP = new Map();
for (const name of ['RED', 'GREEN', 'YELLOW', 'BLUE']) {
  const def = REMOTE_KEYS[name];
  const lower = name.toLowerCase();
  COLOR_CODE_MAP.set(def.code, lower);
  if (def.alt) {
    def.alt.forEach((code) => {
      COLOR_CODE_MAP.set(code, lower);
    });
  }
}

// Stamped onto every KeyboardEvent this app synthesises. Listeners that must
// only react to a real remote press cannot rely on `evt.isTrusted === false`
// alone: on Chromium 38 events built via document.createEvent can report
// isTrusted as undefined, and `undefined === false` is false.
export const SYNTHETIC_KEY_FLAG = '__ytxSynthetic';

// Define Property Descriptor factory to reduce object allocation.
const createDescriptor = (val) => ({ get: () => val });

// Feature-detect once: the KeyboardEvent constructor, else the legacy
// document.createEvent path.
let createEventStrategy;
try {
  new KeyboardEvent('keydown');
  createEventStrategy = (type, opts) => new KeyboardEvent(type, opts);
} catch {
  createEventStrategy = (type, opts) => {
    const evt = document.createEvent('KeyboardEvent');
    if (evt.initKeyboardEvent) {
      evt.initKeyboardEvent(type, true, false, window, opts.key, 0, '', false);
    } else {
      evt.initEvent(type, true, true);
    }
    return evt;
  };
}

/**
 * Dispatches a synthetic keydown+keyup pair for `keyDef`. The events carry
 * SYNTHETIC_KEY_FLAG so this app's own listeners can tell them from a real
 * remote press. `keyCode`/`which`/`charCode` are redefined because the
 * KeyboardEvent constructor ignores them.
 */
export function sendKey(keyDef, target = document.body) {
  if (!keyDef || !keyDef.code) {
    console.warn('[Utils] Invalid key definition');
    return;
  }

  const eventOpts = {
    bubbles: true,
    cancelable: false,
    composed: true,
    view: window,
    key: keyDef.key,
    code: keyDef.key,
    keyCode: keyDef.code,
    which: keyDef.code,
    charCode: keyDef.charCode || 0
  };

  const keyDownEvt = createEventStrategy('keydown', eventOpts);
  const keyUpEvt = createEventStrategy('keyup', eventOpts);

  keyDownEvt[SYNTHETIC_KEY_FLAG] = true;
  keyUpEvt[SYNTHETIC_KEY_FLAG] = true;

  const codeDesc = createDescriptor(keyDef.code);
  const charDesc = createDescriptor(keyDef.charCode || 0);

  Object.defineProperties(keyDownEvt, {
    keyCode: codeDesc,
    which: codeDesc,
    charCode: charDesc
  });
  Object.defineProperties(keyUpEvt, {
    keyCode: codeDesc,
    which: codeDesc,
    charCode: charDesc
  });

  target.dispatchEvent(keyDownEvt);
  target.dispatchEvent(keyUpEvt);
}

let _isWatchPage = false;
let _isShortsPage = false;
let _isAccountSelectorPage = false;
let _isSearchPage = false;

// Cache document.body to avoid DOM lookup overhead if used frequently
let _body = typeof document !== 'undefined' ? document.body : null;

function updatePageState() {
  if (!_body) {
    _body = document.body;
    if (!_body) return;
  }

  const cl = _body.classList;
  const newWatch = cl.contains(SELECTORS.WATCH_PAGE_CLASS);
  const newShorts = cl.contains(SELECTORS.SHORTS_PAGE_CLASS);
  const newAccountSelector = cl.contains(SELECTORS.ACCOUNT_SELECTOR);
  const newSearch = cl.contains(SELECTORS.SEARCH_PAGE_CLASS);

  if (
    newWatch === _isWatchPage &&
    newShorts === _isShortsPage &&
    newAccountSelector === _isAccountSelectorPage &&
    newSearch === _isSearchPage
  ) {
    return;
  }

  _isWatchPage = newWatch;
  _isShortsPage = newShorts;
  _isAccountSelectorPage = newAccountSelector;
  _isSearchPage = newSearch;

  window.dispatchEvent(
    new CustomEvent('ytx-page-update', {
      detail: {
        isWatch: _isWatchPage,
        isShorts: _isShortsPage,
        isAccountSelector: _isAccountSelectorPage,
        isSearch: _isSearchPage
      }
    })
  );
}

if (typeof document !== 'undefined') {
  const initObserver = () => {
    _body = document.body;
    const pageObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Cheap pre-filter: only care if a WEB_PAGE_TYPE_ class actually
        // changed. Body classes flip constantly for focus/animation state.
        const oldV = m.oldValue || '';
        const newV = m.target.className || '';
        if (newV === oldV) continue;
        if (
          oldV.indexOf('WEB_PAGE_TYPE_') === -1 &&
          newV.indexOf('WEB_PAGE_TYPE_') === -1
        ) {
          continue;
        }
        updatePageState();
        break;
      }
    });
    pageObserver.observe(_body, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true
    });
    updatePageState();
  };

  if (document.body) {
    initObserver();
  } else {
    document.addEventListener('DOMContentLoaded', initObserver);
  }
}

export const isWatchPage = () => _isWatchPage;
export const isShortsPage = () => _isShortsPage;
export const isSearchPage = () => _isSearchPage;

// Cached <video> lookup. Re-querying document.querySelector('video') per
// access is wasteful; cache it for the lifetime of a watch/shorts session
// and invalidate when the page state changes.
let _cachedVideo = null;
export function getVideo() {
  if (_cachedVideo && _cachedVideo.isConnected) return _cachedVideo;
  _cachedVideo = document.querySelector('video');
  return _cachedVideo;
}
if (typeof window !== 'undefined') {
  window.addEventListener('ytx-page-update', (e) => {
    // Drop the cache whenever we leave a video page; the next getVideo() call
    // will re-query on demand.
    if (!e.detail.isWatch && !e.detail.isShorts) _cachedVideo = null;
  });
}

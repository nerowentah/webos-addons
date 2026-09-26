const CONTENT_INTENT_REGEX = /^.+(?=Content)/g;

export function extractLaunchParams() {
  if (window.launchParams) {
    return JSON.parse(window.launchParams);
  } else {
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

export function handleLaunch(params) {
  console.info('handleLaunch', params);
  let ytURL = getYTURL();

  // We use our custom "target" param, since launches with "contentTarget"
  // parameter do not respect "handlesRelaunch" appinfo option. We still
  // fallback to "contentTarget" if our custom param is not specified.
  //
  let { target, contentTarget = target } = params;

  /** TODO: Handle google assistant
   * Sample: {contentTarget: "v=v=<ID>", storeCaller: "voice", subReason: "voiceAgent", voiceEngine: "googleAssistant"}
   */

  switch (typeof contentTarget) {
    case 'string': {
      if (contentTarget.indexOf(ytURL.origin) === 0) {
        console.info('Launching from direct contentTarget');
        ytURL = contentTarget;
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
      console.info('Voice launch');

      const { intent, intentParam } = contentTarget;
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

      search.set('vq', intentParam);
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

const SELECTORS = {
  PLAYER_ID: 'ytlr-player__player-container-player',
  PLAYER_CONTAINER: 'ytlr-player__player-container',
  WATCH_PAGE_CLASS: 'WEB_PAGE_TYPE_WATCH',
  SHORTS_PAGE_CLASS: 'WEB_PAGE_TYPE_SHORTS'
};

let _isWatchPage = false;
let _isShortsPage = false;

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

  if (newWatch === _isWatchPage && newShorts === _isShortsPage) {
    return;
  }

  _isWatchPage = newWatch;
  _isShortsPage = newShorts;

  window.dispatchEvent(
    new CustomEvent('ytaf-page-update', {
      detail: {
        isWatch: _isWatchPage,
        isShorts: _isShortsPage
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
  window.addEventListener('ytaf-page-update', (e) => {
    // Drop the cache whenever we leave a video page; the next getVideo() call
    // will re-query on demand.
    if (!e.detail.isWatch && !e.detail.isShorts) _cachedVideo = null;
  });
}

export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

import {
  BASE_LAUNCH_URL,
  buildLaunchUrl,
  parseLaunchParams
} from './launch-url';
import type { PageUpdateDetail } from './globals';

export { contentTargetOf } from './launch-url';
export * from './keys';

export function extractLaunchParams() {
  return parseLaunchParams(window.launchParams);
}

/** Initial launch: opens the content target, or plain YouTube when there is none. */
export function handleLaunch(params: unknown): void {
  window.location.replace(buildLaunchUrl(params) ?? BASE_LAUNCH_URL);
}

/** Relaunch of the running app: only navigates when the params carry a usable content target, so a bare relaunch does not reload the page. */
export function handleRelaunch(params: unknown): void {
  const url = buildLaunchUrl(params);
  if (url) window.location.replace(url);
}

/**
 * Wait for a child element to be added for which a predicate is true; with
 * `observeAttributes` the predicate also runs on attribute changes.
 * Rejects with `signal.reason` on abort, or with whatever the predicate throws; the observer is always disconnected.
 * @param parent Root of tree to watch
 * @param predicate Checks whether its argument is the desired element
 * @param observeAttributes Also run predicate on attribute changes
 * @param signal Signal that can be used to stop waiting
 */
export function waitForChildAdd<T extends Node>(
  parent: Node,
  predicate: (node: Node) => node is T,
  observeAttributes?: boolean,
  signal?: AbortSignal
): Promise<T>;
export function waitForChildAdd(
  parent: Node,
  predicate: (node: Node) => boolean,
  observeAttributes?: boolean,
  signal?: AbortSignal
): Promise<Node>;
export function waitForChildAdd(
  parent: Node,
  predicate: (node: Node) => boolean,
  observeAttributes = false,
  signal?: AbortSignal
): Promise<Node> {
  return new Promise<Node>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const cleanup = () => {
      obs.disconnect();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(signal?.reason);
    };

    /** True once the wait has settled. */
    const test = (node: Node): boolean => {
      try {
        if (!predicate(node)) return false;
        cleanup();
        resolve(node);
      } catch (err) {
        cleanup();
        reject(err);
      }
      return true;
    };

    const obs = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        if (mut.type === 'attributes') {
          if (test(mut.target)) return;
        } else {
          for (const node of mut.addedNodes) {
            if (test(node)) return;
          }
        }
      }
    });

    signal?.addEventListener('abort', onAbort, { once: true });
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
} as const;

const PAGE_TYPE_PREFIX = 'WEB_PAGE_TYPE_';

let _isWatchPage = false;
let _isShortsPage = false;
let _isAccountSelectorPage = false;
let _isSearchPage = false;

function updatePageState() {
  const body = document.body;
  if (!body) return;

  const cl = body.classList;
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
    new CustomEvent<PageUpdateDetail>('ytx-page-update', {
      detail: {
        isWatch: _isWatchPage,
        isShorts: _isShortsPage,
        isAccountSelector: _isAccountSelectorPage,
        isSearch: _isSearchPage
      }
    })
  );
}

let stopPageState: (() => void) | null = null;

/**
 * Starts tracking the WEB_PAGE_TYPE_* class on <body>, dispatching `ytx-page-update` on change. Idempotent; works before <body> exists and follows a replaced <body>. Returns the teardown (also `teardownPageState`).
 */
export function initPageState(): () => void {
  if (stopPageState) return stopPageState;

  const bodyObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // Cheap pre-filter: body classes flip constantly for focus/animation state, so only a WEB_PAGE_TYPE_ change matters.
      const oldV = m.oldValue ?? '';
      const newV = (m.target as Element).getAttribute('class') ?? '';
      if (newV === oldV) continue;
      if (
        !oldV.includes(PAGE_TYPE_PREFIX) &&
        !newV.includes(PAGE_TYPE_PREFIX)
      ) {
        continue;
      }
      updatePageState();
      break;
    }
  });

  let observedBody: HTMLElement | null = null;
  const bindBody = () => {
    if (document.body === observedBody) return;
    bodyObserver.disconnect();
    observedBody = document.body;
    if (observedBody) {
      bodyObserver.observe(observedBody, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true
      });
    }
    updatePageState();
  };

  // <html>'s direct children only: sees <body> arrive or get replaced.
  const rootObserver = new MutationObserver(bindBody);
  rootObserver.observe(document.documentElement, { childList: true });
  bindBody();

  stopPageState = () => {
    rootObserver.disconnect();
    bodyObserver.disconnect();
    stopPageState = null;
    _isWatchPage = false;
    _isShortsPage = false;
    _isAccountSelectorPage = false;
    _isSearchPage = false;
  };
  return stopPageState;
}

export function teardownPageState(): void {
  stopPageState?.();
}

if (typeof document !== 'undefined') initPageState();

export const isWatchPage = () => _isWatchPage;
export const isShortsPage = () => _isShortsPage;
export const isSearchPage = () => _isSearchPage;

// Cached <video> lookup, invalidated when the page state changes.
let _cachedVideo: HTMLVideoElement | null = null;
export function getVideo(): HTMLVideoElement | null {
  if (_cachedVideo?.isConnected) return _cachedVideo;
  _cachedVideo = document.querySelector('video');
  return _cachedVideo;
}
if (typeof window !== 'undefined') {
  window.addEventListener('ytx-page-update', (e) => {
    const detail = e.detail as PageUpdateDetail | null | undefined;
    // Drop the cache when leaving a video page; the next getVideo() re-queries.
    if (detail && !detail.isWatch && !detail.isShorts) _cachedVideo = null;
  });
}

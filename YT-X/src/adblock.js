/* eslint no-redeclare: 0 */
/* global fetch:writable */
import { configRead, configAddChangeListener } from './config';
import { raiseRowsAhead, detectRowsAheadType } from './rows-ahead.js';
import {
  upgradeResponseThumbnails,
  thumbnailHookRequired
} from './thumbnail-quality.js';

/**
 * A minimal reimplementation of the following uBlock Origin rule:
 * https://github.com/uBlockOrigin/uAssets/blob/master/filters/filters.txt
 *
 * The original only reached the ad surfaces an anonymous session sees. A signed
 * in account gets additional, differently-named renderers for the same thing -
 * the "Up next" rail, mastheads, in-feed ad slots, and the search promo cards -
 * so this drops them by renderer name instead of by response path.
 *
 * `playbackTracking` is deliberately NOT in the denylist. It is not an ad
 * surface: it carries the videostats/qoe/atr beacon URLs the player reports
 * watch-time to, so dropping it records nothing and leaves the video out of
 * watch history and resume. Whether to strip it is a user choice
 * (`keepPlaybackTracking`), handled explicitly below rather than swept up by
 * the generic renderer walk.
 *
 * Several opt-in filters share this hook but are independent of Ad Block:
 * blanking `trackingParams` (`enableTrackingBlock`) is done on the raw text
 * before the parse, swallowing the auto-selected caption track
 * (`disableAutoCaptions`) is a small edit to the parsed player response, and
 * the cosmetic filters (`removeLiveVideos`, `removeUpcomingVideos`,
 * `removeTopLiveGames`, `removeMostRelevant`) walk the parsed body. Raising the
 * autoload threshold of a response's section lists (`loadRowsAhead`) is another
 * such independent pass, and is the only one that runs even with every filter
 * off.
 */

/**
 * Renderer keys whose entire object is a promotion or an ad slot.
 *
 * These are all leaf nodes: the wrapper object holds nothing but the ad, so
 * dropping the whole entry is correct and is what YouTube itself would do with
 * an empty response. The `*` prefix is the one exception shape handled below -
 * YouTube adds a suffix to some of these between response versions, and
 * stripping it is cheaper than chasing each rename.
 */
const AD_RENDERERS = new Set([
  // Top-level response envelopes.
  'adPlacements',
  'adSlots',
  'playerAds',
  'adBreakHeartbeatParams',
  'adParams',
  'ads',
  'adPayload',
  'auxAds',
  'injectedAds',
  'linearAds',
  'nonLinearAds',
  'playerLegacyDesktopWatchAds',
  // The "Includes paid promotion" banner, on the response and its
  // playerResponse. An ad surface, not the ad itself, so it lives here rather
  // than in a player-ads helper.
  'paidContentOverlay',
  // Home / browse: full-width and shelf-embedded slots.
  'adSlotRenderer',
  'adSlotContentRenderer',
  'inFeedAdLayoutRenderer',
  'adLayoutRenderer',
  'compactAdRenderer',
  'promotedItemRenderer',
  'sponsorRenderer',
  'engagementPanelRenderer',
  'videoMastheadAdV3Renderer',
  'videoMastheadAdRenderer',
  'videoMastheadV3Renderer',
  'tvMastheadRenderer',
  'tvMastheadAdV3Renderer',
  'tvMastheadAdRenderer',
  'displayAdRenderer',
  'statementBannerRenderer',
  'bannerPromoRenderer',
  'billboardRenderer',
  'promoCardRenderer',
  // "Up next" / queue / subscriptions: promoted videos carry no ad marker of
  // their own on the Leanback surface, only the renderer name.
  'compactPromotedVideoRenderer',
  'promotedVideoRenderer',
  'promotedSparklesWebRenderer',
  'promotedSparklesTextSearchRenderer',
  'videoPromotionRenderer',
  'searchPyvRenderer',
  'promotedItemSectionRenderer',
  'promotedShelfRenderer',
  'brandVideoShelfRenderer',
  'brandVideoSingletonRenderer',
  'horizontalCardListRendererAd',
  'shelfRendererAd',
  'adSlotRendererAd'
]);

/**
 * Renderer keys that must be dropped together with their siblings.
 *
 * A promoted shelf is a `<container>`-ish wrapper whose `items` array holds the
 * promos. Removing only the leaf renderers would leave the empty wrapper, which
 * YouTube renders as a blank row with a heading, so the whole array goes.
 */
const AD_LIST_OWNERS = new Set([
  'promotedShelfRenderer',
  'promotedItemSectionRenderer',
  'promotedVideoSectionRenderer',
  'shelfRendererAd'
]);

/**
 * uBlock's rule name for this filter. Kept in the log line so a user reporting
 * "ads still show" can be matched against uBlock's own stats.
 */
const FILTER = 'uAssets/filters.txt';

/**
 * Cosmetic content filters (independent of Ad Block): live and upcoming tiles,
 * and the two titled shelves. Detection is value-based on the exact enums, so a
 * `BADGE_STYLE_TYPE_LIVE_NOW` or a title that merely contains a word is never
 * caught.
 */
const BADGE_STYLE_LIVE = 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE';
const BADGE_STYLE_UPCOMING = 'THUMBNAIL_OVERLAY_BADGE_STYLE_UPCOMING';
const CONTENT_TYPE_LIVE = 'TILE_CONTENT_TYPE_LIVE';
const TIME_STATUS_STYLE_LIVE =
  'THUMBNAIL_OVERLAY_TIME_STATUS_RENDERER_STYLE_LIVE';
const TIME_STATUS_STYLE_UPCOMING =
  'THUMBNAIL_OVERLAY_TIME_STATUS_RENDERER_STYLE_UPCOMING';

// Bits of cosmeticMask, so an item's badges are read once.
const BADGE_LIVE = 1;
const BADGE_UPCOMING = 2;

/**
 * Depth caps for the cosmetic walk. The badge sits a handful of hops below a
 * tile; the cap bounds a half-megabyte home page in a webview rather than being
 * exact, and the value-based match cannot false-positive.
 */
const MAX_COSMETIC_DEPTH = 24;
const MAX_MARKER_DEPTH = 16;

/**
 * Subtrees a removable tile can never be in. playerResponse is where the
 * upcoming/live metadata can also appear, but there is no tile down there.
 */
const SKIP_KEYS = new Set(['playerResponse', 'responseContext']);

/**
 * Renderers that are a container (a shelf, a section, a grid or a bare
 * horizontal list) rather than a leaf tile. A container is only filtered
 * through, never dropped as if it were a tile.
 */
const CONTAINER_KEYS = new Set([
  'shelfRenderer',
  'itemSectionRenderer',
  'gridRenderer',
  'horizontalListRenderer'
]);

/**
 * The two titled shelves, compared trimmed and lower-cased. The TV sends the
 * title in the account's language and only the English titles are confirmed.
 */
const SHELF_TITLES_LIVE_GAMES = new Set(['top live games']);
const SHELF_TITLES_MOST_RELEVANT = new Set(['most relevant']);

/** Names removed by the current cosmetic pass, for the log line. */
let cosmeticRemoved = [];

let hitCount = 0;

/** Log once, not once per key, so a big response cannot flood the console. */
function logHit(key) {
  hitCount += 1;
  if (hitCount <= 25) {
    console.info(`[adblock] ${FILTER} removed ${key}`);
  } else if (hitCount === 26) {
    console.info('[adblock] further removals suppressed');
  }
}

/**
 * True if a key names an ad renderer, tolerating the version suffixes YouTube
 * appends (`adSlotRendererFoo`, `displayAdRendererV2`).
 */
function isAdKey(key) {
  if (AD_RENDERERS.has(key)) return true;
  for (const name of AD_RENDERERS) {
    if (name.length > 8 && key.startsWith(name)) return true;
  }
  return false;
}

/**
 * Walk a response body and drop every ad renderer, at any depth.
 *
 * Explicit-stack rather than recursion: YouTube's initial-data payloads nest
 * seven or eight levels and the ad can sit at any of them, and a response large
 * enough to hold a full home page is also large enough that blowing the JS call
 * stack is a real risk on a webview.
 *
 * The mutation is in place on the parsed object, which is what the site reads.
 * Cycles cannot occur because the value came from JSON.parse, but a seen set is
 * kept anyway to stay safe if this is ever pointed at a non-JSON graph.
 */
function scrubAds(root) {
  const seen = new Set();
  const stack = [root];
  const removedKeys = [];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object') continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      // Compact in place, dropping ad elements. Reverse order so splice does
      // not shift the indices still to be walked.
      for (let i = node.length - 1; i >= 0; i -= 1) {
        const item = node[i];
        if (item !== null && typeof item === 'object') {
          const keys = Object.keys(item);
          const isAdWrapper =
            keys.length > 0 &&
            keys.every((k) => isAdKey(k) || k === 'tracking');
          if (isAdWrapper) {
            removedKeys.push(keys[0]);
            node.splice(i, 1);
            continue;
          }
        }
        stack.push(item);
      }
      continue;
    }

    for (const key of Object.keys(node)) {
      const value = node[key];

      if (isAdKey(key)) {
        delete node[key];
        removedKeys.push(key);
        continue;
      }

      // A promoted list whose every child is an ad still has a heading; the
      // list itself goes, not just its items.
      if (
        value !== null &&
        typeof value === 'object' &&
        AD_LIST_OWNERS.has(key)
      ) {
        delete node[key];
        removedKeys.push(key);
        continue;
      }

      if (value !== null && typeof value === 'object') stack.push(value);
    }
  }

  return removedKeys;
}

/** Flatten a YouTube text object to a string. `runs` covers the split variant. */
function readText(text) {
  if (text === null || typeof text !== 'object') return '';
  if (typeof text.simpleText === 'string') return text.simpleText;
  if (!Array.isArray(text.runs)) return '';
  return text.runs.map((run) => run?.text ?? '').join('');
}

/** The shelf heading: the plain title, or the avatar-lockup header variant. */
function getShelfTitle(shelf) {
  const title = readText(shelf.title);
  if (title !== '') return title;
  const lockup = shelf.headerRenderer?.shelfHeaderRenderer?.avatarLockup;
  return readText(lockup?.avatarLockupRenderer?.title ?? lockup?.title);
}

/** A titled shelf that goes whole, before any per-tile work. */
function shouldDropShelfByTitle(shelf) {
  if (shelf === null || typeof shelf !== 'object') return false;
  const title = getShelfTitle(shelf);
  if (title === '') return false;
  const key = title.trim().toLowerCase();
  if (removeTopLiveGames && SHELF_TITLES_LIVE_GAMES.has(key)) return true;
  return removeMostRelevant && SHELF_TITLES_MOST_RELEVANT.has(key);
}

/** True if this element is a container, not a leaf tile. */
function isContainer(item) {
  for (const key of Object.keys(item)) {
    if (CONTAINER_KEYS.has(key)) return true;
  }
  return false;
}

/** The per-tile detection: does this subtree carry a wanted badge? */
function hasWantedBadge(node, mask, depth) {
  if (node === null || typeof node !== 'object') return false;
  if (depth > MAX_MARKER_DEPTH) return false;
  if (hasBadgeValue(node, mask)) return true;

  if (Array.isArray(node)) {
    for (const item of node) {
      if (hasWantedBadge(item, mask, depth + 1)) return true;
    }
    return false;
  }

  for (const key in node) {
    if (SKIP_KEYS.has(key)) continue;
    if (hasWantedBadge(node[key], mask, depth + 1)) return true;
  }
  return false;
}

function hasBadgeValue(node, mask) {
  if (mask & BADGE_LIVE && node.contentType === CONTENT_TYPE_LIVE) return true;
  if (mask & BADGE_UPCOMING && node.upcomingEventData !== undefined)
    return true;

  for (const prop of ['style', 'badgeStyle']) {
    const value = node[prop];
    if (typeof value !== 'string') continue;
    if (
      mask & BADGE_LIVE &&
      (value === BADGE_STYLE_LIVE ||
        value === 'LIVE' ||
        value === TIME_STATUS_STYLE_LIVE)
    ) {
      return true;
    }
    if (
      mask & BADGE_UPCOMING &&
      (value === BADGE_STYLE_UPCOMING ||
        value === 'UPCOMING' ||
        value === TIME_STATUS_STYLE_UPCOMING)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Filters a shelf's content lists in place and reports how many items they held
 * and how many are left, so a shelf this filter emptied can be dropped whole -
 * left in place it renders as a heading over skeleton tiles that never fill.
 */
function filterShelfLists(shelf, depth) {
  const content = shelf.content;
  if (content === null || typeof content !== 'object') {
    return { had: 0, left: 0 };
  }

  let had = 0;
  let left = 0;
  const lists = [
    content.horizontalListRenderer?.items,
    content.gridRenderer?.items,
    content.expandedShelfContentsRenderer?.items
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    had += list.length;
    scrubList(list, depth + 1);
    left += list.length;
  }
  return { had, left };
}

/** Whether a shelf goes: by title, or because this filter emptied it. */
function shelfIsDropped(shelf, depth) {
  if (shouldDropShelfByTitle(shelf)) return true;

  const { had, left } = filterShelfLists(shelf, depth);
  return had > 0 && left === 0;
}

/** Filters one item list in place, dropping the tiles it covers. */
function scrubList(list, depth) {
  if (depth > MAX_COSMETIC_DEPTH) return;

  // Reverse order so splice does not shift the indices still to be walked.
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    if (item === null || typeof item !== 'object') continue;

    if (item.shelfRenderer) {
      if (shelfIsDropped(item.shelfRenderer, depth + 1)) {
        list.splice(i, 1);
        cosmeticRemoved.push('shelfRenderer');
      }
      continue;
    }

    // A container is filtered through, never dropped as a tile.
    if (isContainer(item)) {
      sweep(item, depth + 1);
      continue;
    }

    if (cosmeticMask && hasWantedBadge(item, cosmeticMask, 0)) {
      list.splice(i, 1);
      cosmeticRemoved.push('item');
    }
  }
}

/** Walks an object/array, filtering every shelf and tile list in place. */
function sweep(node, depth) {
  if (node === null || typeof node !== 'object') return;
  if (depth > MAX_COSMETIC_DEPTH) return;

  if (Array.isArray(node)) {
    scrubList(node, depth);
    return;
  }

  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (value === null || typeof value !== 'object') continue;

    if (key === 'shelfRenderer') {
      if (shelfIsDropped(value, depth)) {
        delete node[key];
        cosmeticRemoved.push(key);
      }
      continue;
    }

    sweep(value, depth + 1);
  }
}

/**
 * Cached config flags. JSON.parse runs for thousands of small blobs, so the
 * settings are read once and refreshed from the config change events rather
 * than per call. `filtersEnabled` is the cheap guard every parse pays.
 */
let enableAdBlock = false;
let keepPlaybackTracking = true;
let enableTrackingBlock = false;
let disableAutoCaptions = false;
let removeLiveVideos = false;
let removeUpcomingVideos = false;
let removeTopLiveGames = false;
let removeMostRelevant = false;
let cosmeticMask = 0;
let cosmeticEnabled = false;
let filtersEnabled = false;
// Independent of the filters above: rows-ahead edits the parsed body's
// continuations, not the ad/cosmetic surfaces, so it is its own guard and runs
// even when every filter is off.
let loadRowsAhead = false;

function refreshFilters() {
  enableAdBlock = !!configRead('enableAdBlock');
  keepPlaybackTracking = !!configRead('keepPlaybackTracking');
  enableTrackingBlock = !!configRead('enableTrackingBlock');
  disableAutoCaptions = !!configRead('disableAutoCaptions');
  removeLiveVideos = !!configRead('removeLiveVideos');
  removeUpcomingVideos = !!configRead('removeUpcomingVideos');
  removeTopLiveGames = !!configRead('removeTopLiveGames');
  removeMostRelevant = !!configRead('removeMostRelevant');
  loadRowsAhead = !!configRead('loadRowsAhead');
  cosmeticMask =
    (removeLiveVideos ? BADGE_LIVE : 0) |
    (removeUpcomingVideos ? BADGE_UPCOMING : 0);
  cosmeticEnabled =
    removeLiveVideos ||
    removeUpcomingVideos ||
    removeTopLiveGames ||
    removeMostRelevant;
  filtersEnabled =
    enableAdBlock ||
    enableTrackingBlock ||
    disableAutoCaptions ||
    cosmeticEnabled;
}

refreshFilters();
for (const key of [
  'enableAdBlock',
  'keepPlaybackTracking',
  'enableTrackingBlock',
  'disableAutoCaptions',
  'removeLiveVideos',
  'removeUpcomingVideos',
  'removeTopLiveGames',
  'removeMostRelevant',
  'loadRowsAhead'
]) {
  configAddChangeListener(key, refreshFilters);
}

/**
 * A trackingParams value is an opaque token with no quotes or escapes; one
 * carrying a backslash is left as sent. The leading quote keeps the key out of
 * a clickTrackingParams match - endcard clicks still need that one. Blanking
 * the value in the text is one native pass, where walking the parsed tree for
 * the same edit costs more than the parse.
 */
const TRACKING_PARAMS_KEY = '"trackingParams"';
const TRACKING_PARAMS_RE = /"trackingParams"\s*:\s*"[^"\\]*"/g;
const TRACKING_PARAMS_EMPTY = '"trackingParams":""';

function stripTrackingParams(text) {
  if (text.indexOf(TRACKING_PARAMS_KEY) === -1) return text;
  return text.replace(TRACKING_PARAMS_RE, TRACKING_PARAMS_EMPTY);
}

/**
 * Subtitles that switch themselves on: the player names a default track and an
 * initial state per audio track. Without the default and with the state off a
 * video starts without subtitles; turning them on by hand still works.
 */
function captionsOff(holder) {
  const tracks = holder?.captions?.playerCaptionsTracklistRenderer?.audioTracks;
  if (!Array.isArray(tracks)) return;

  for (const track of tracks) {
    if (track === null || typeof track !== 'object') continue;
    delete track.defaultCaptionTrackIndex;
    track.captionsInitialState = 'CAPTIONS_INITIAL_STATE_OFF_RECOMMENDED';
  }
}

/**
 * Response-shape signatures, tested in order. Keep in sync with the paths the
 * thumbnail rewriter (thumbnail-quality.js) dispatches on; a null result makes
 * it fall back to a bounded scan, which is correct but costs more, so the
 * order matters: the more specific shapes come first and SEARCH is excluded
 * from a browse envelope.
 */
const RESPONSE_TYPE_SIGNATURES = [
  {
    type: 'SHORTS_SEQUENCE',
    detectionPath: ['entries'],
    matchFn: (data) => Array.isArray(data.entries)
  },
  { type: 'PLAYER', detectionPath: ['streamingData'] },
  { type: 'NEXT', detectionPath: ['contents', 'singleColumnWatchNextResults'] },
  {
    type: 'HOME_BROWSE',
    detectionPath: [
      'contents',
      'tvBrowseRenderer',
      'content',
      'tvSurfaceContentRenderer'
    ]
  },
  {
    type: 'BROWSE_TABS',
    detectionPath: [
      'contents',
      'tvBrowseRenderer',
      'content',
      'tvSecondaryNavRenderer'
    ]
  },
  {
    type: 'SEARCH',
    detectionPath: ['contents', 'sectionListRenderer'],
    excludePath: ['contents', 'tvBrowseRenderer']
  },
  { type: 'CONTINUATION', detectionPath: ['continuationContents'] },
  { type: 'ACTION', detectionPath: ['onResponseReceivedActions'] },
  { type: 'ACTION', detectionPath: ['onResponseReceivedEndpoints'] }
];

function getByPath(obj, parts) {
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

function detectResponseType(data) {
  for (let i = 0; i < RESPONSE_TYPE_SIGNATURES.length; i++) {
    const sig = RESPONSE_TYPE_SIGNATURES[i];
    if (sig.excludePath && getByPath(data, sig.excludePath) !== undefined) {
      continue;
    }
    if (getByPath(data, sig.detectionPath) !== undefined) {
      if (sig.matchFn && !sig.matchFn(data)) continue;
      return sig.type;
    }
  }
  return null;
}

const origParse = JSON.parse;
JSON.parse = function () {
  if (!filtersEnabled && !loadRowsAhead && !thumbnailHookRequired()) {
    return origParse.apply(this, arguments);
  }

  let text = arguments[0];

  // Blanked in the text, in one pass, before the parse.
  if (enableTrackingBlock && typeof text === 'string') {
    text = stripTrackingParams(text);
  }

  const r =
    arguments.length > 1
      ? origParse.call(this, text, arguments[1])
      : origParse.call(this, text);

  if (r === null || typeof r !== 'object') {
    return r;
  }

  // Rows ahead is independent of the filters, so it runs first and whatever
  // the filters do below leaves the raised continuations in place.
  if (loadRowsAhead) {
    raiseRowsAhead(r, detectRowsAheadType(r));
  }

  if (enableAdBlock) {
    // Pre-existing envelope deletes, kept explicit because they are the cases
    // that are certain to appear and are worth a distinct log line.
    if (r.adPlacements) {
      delete r.adPlacements;
      logHit('adPlacements');
    }

    if (Array.isArray(r.adSlots)) {
      delete r.adSlots;
      logHit('adSlots');
    }

    if (r.playerAds) {
      delete r.playerAds;
      logHit('playerAds');
    }

    // Opt-in only: stripping playbackTracking kills watch history and resume,
    // so it is kept unless the user explicitly turns the toggle off. Handled
    // here rather than in AD_RENDERERS because it is not an ad surface.
    if (!keepPlaybackTracking && r.playbackTracking) {
      delete r.playbackTracking;
      logHit('playbackTracking');
    }

    for (const key of scrubAds(r)) logHit(key);
  }

  if (disableAutoCaptions) {
    captionsOff(r);
    captionsOff(r.playerResponse);
  }

  if (cosmeticEnabled) {
    cosmeticRemoved = [];
    sweep(r, 0);
    for (const key of cosmeticRemoved) logHit(key);
  }

  // Max Thumbnail Quality: rewrite thumbnail URLs in the parsed body. Always on
  // and run last, so shelves and ad slots removed above are never rewritten.
  // The response type is detected once here and handed to the rewriter.
  upgradeResponseThumbnails(r, detectResponseType(r));

  return r;
};

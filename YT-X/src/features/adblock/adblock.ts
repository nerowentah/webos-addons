import { claimHook } from '../../core/hook-once';
import {
  configRead,
  configAddChangeListener,
  type BoolKey
} from '../../config/config';
import {
  getByPath,
  isArray,
  isContainer,
  isRecord,
  readText,
  type JsonObject
} from '../../youtube/json';
import { raiseRowsAhead, detectRowsAheadType } from './rows-ahead';
import { detectResponseType } from './response-type';
import {
  upgradeResponseThumbnails,
  thumbnailHookRequired
} from './thumbnail-quality';

/**
 * Minimal reimplementation of the uBlock Origin rule: https://github.com/uBlockOrigin/uAssets/blob/master/filters/filters.txt. The original only reached the ad surfaces an anonymous session sees; a signed-in account gets additional, differently-named renderers for the same thing, so this drops them by renderer name instead of by response path.
 *
 * `playbackTracking` is deliberately NOT in the denylist: it is not an ad surface - it carries the videostats/qoe/atr beacon URLs the player reports watch-time to, so dropping it records nothing and leaves the video out of watch history and resume. Whether to strip it is a user choice (`keepPlaybackTracking`), handled explicitly below rather than swept up by the generic renderer walk.
 *
 * Several opt-in filters share this hook but are independent of Ad Block: `enableTrackingBlock`, `disableAutoCaptions`, `removeLiveVideos`/`removeUpcomingVideos`/`removeTopLiveGames`/`removeMostRelevant`, and `loadRowsAhead` - the last of which runs even with every filter off.
 */

/**
 * Renderer keys whose entire object is a promotion or an ad slot - all leaf nodes, so dropping the whole entry is correct. isAdKey additionally matches version suffixes YouTube appends to some of these between response versions (`adSlotRendererFoo`), which is cheaper than chasing each rename.
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
  // "Includes paid promotion" banner - an ad surface, not the ad itself.
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
 * Renderer keys that must be dropped together with their siblings: a promoted shelf is a wrapper whose `items` holds the promos, and removing only the leaf renderers would leave an empty wrapper YouTube renders as a blank row with a heading, so the whole array goes.
 */
const AD_LIST_OWNERS = new Set([
  'promotedShelfRenderer',
  'promotedItemSectionRenderer',
  'promotedVideoSectionRenderer',
  'shelfRendererAd'
]);

/**
 * Cosmetic content filters (independent of Ad Block). Detection is value-based on exact enums to avoid false matches.
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
 * Depth caps for the cosmetic walk. The badge sits a handful of hops below a tile; the cap bounds a half-megabyte home page in a webview rather than being exact, and the value-based match cannot false-positive.
 */
const MAX_COSMETIC_DEPTH = 24;
const MAX_MARKER_DEPTH = 16;

/** Subtrees a removable tile can never be in; playerResponse carries upcoming/live metadata but no tile. */
const SKIP_KEYS = new Set(['playerResponse', 'responseContext']);

/**
 * Renderers that are a container (shelf, section, grid, bare horizontal list) rather than a leaf tile; a container is only filtered through, never dropped as a tile.
 */
const CONTAINER_KEYS = new Set([
  'shelfRenderer',
  'itemSectionRenderer',
  'gridRenderer',
  'horizontalListRenderer'
]);

/**
 * The two titled shelves, compared trimmed and lower-cased. The TV sends the title in the account's language and only the English titles are confirmed.
 */
const SHELF_TITLES_LIVE_GAMES = new Set(['top live games']);
const SHELF_TITLES_MOST_RELEVANT = new Set(['most relevant']);

/** True if a key names an ad renderer, tolerating the version suffixes YouTube appends (`adSlotRendererFoo`, `displayAdRendererV2`). */
function isAdKey(key: string): boolean {
  if (AD_RENDERERS.has(key)) return true;
  for (const name of AD_RENDERERS) {
    if (name.length > 8 && key.startsWith(name)) return true;
  }
  return false;
}

/**
 * Raw-text twin of isAdKey: a key longer than 8 characters matches by prefix (`"name`), a shorter one exactly (`"name"`). A payload with no such key cannot hold an ad renderer, so scrubAds is skipped for it.
 */
const AD_KEY_TEXT_RE = new RegExp(
  [...AD_RENDERERS, ...AD_LIST_OWNERS]
    .map((name) => `"${name}${name.length > 8 ? '' : '"'}`)
    .join('|')
);

/**
 * Walk a response body and drop every ad renderer, at any depth. Explicit-stack rather than recursion: initial-data payloads nest seven or eight levels and a home-page-sized response is large enough that blowing the webview call stack is a real risk. Mutates in place; a seen set guards against non-JSON graphs even though JSON.parse cannot produce cycles.
 */
function scrubAds(root: object): string[] {
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  const removedKeys: string[] = [];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!isContainer(node)) continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (isArray(node)) {
      // Reverse order so splice does not shift the indices still to be walked.
      for (let i = node.length - 1; i >= 0; i -= 1) {
        const item = node[i];
        if (isContainer(item)) {
          const keys = Object.keys(item);
          const [first] = keys;
          const isAdWrapper =
            first !== undefined &&
            keys.every((k) => isAdKey(k) || k === 'tracking');
          if (isAdWrapper) {
            removedKeys.push(first);
            node.splice(i, 1);
            continue;
          }
        }
        stack.push(item);
      }
      continue;
    }

    const record = node as JsonObject;
    for (const key of Object.keys(record)) {
      const value = record[key];

      if (isAdKey(key)) {
        delete record[key];
        removedKeys.push(key);
        continue;
      }

      // A promoted list whose every child is an ad still has a heading; the list itself goes, not just its items.
      if (isContainer(value) && AD_LIST_OWNERS.has(key)) {
        delete record[key];
        removedKeys.push(key);
        continue;
      }

      if (isContainer(value)) stack.push(value);
    }
  }

  return removedKeys;
}

/** The shelf heading: the plain title, or the avatar-lockup header variant. */
function getShelfTitle(shelf: JsonObject): string {
  const title = readText(shelf['title']);
  if (title !== '') return title;
  const lockup = getByPath(shelf, [
    'headerRenderer',
    'shelfHeaderRenderer',
    'avatarLockup'
  ]);
  return readText(
    getByPath(lockup, ['avatarLockupRenderer', 'title']) ??
      getByPath(lockup, ['title'])
  );
}

/** A titled shelf that goes whole, before any per-tile work. */
function shouldDropShelfByTitle(shelf: unknown): boolean {
  if (!isRecord(shelf)) return false;
  const title = getShelfTitle(shelf);
  if (title === '') return false;
  const key = title.trim().toLowerCase();
  if (removeTopLiveGames && SHELF_TITLES_LIVE_GAMES.has(key)) return true;
  return removeMostRelevant && SHELF_TITLES_MOST_RELEVANT.has(key);
}

/** True if this element is a container, not a leaf tile. */
function isShelfContainer(item: object): boolean {
  for (const key of Object.keys(item)) {
    if (CONTAINER_KEYS.has(key)) return true;
  }
  return false;
}

/** The per-tile detection: does this subtree carry a wanted badge? */
function hasWantedBadge(node: unknown, mask: number, depth: number): boolean {
  if (!isContainer(node)) return false;
  if (depth > MAX_MARKER_DEPTH) return false;

  if (isArray(node)) {
    for (const item of node) {
      if (hasWantedBadge(item, mask, depth + 1)) return true;
    }
    return false;
  }

  const record = node as JsonObject;
  if (hasBadgeValue(record, mask)) return true;

  for (const key in record) {
    if (SKIP_KEYS.has(key)) continue;
    if (hasWantedBadge(record[key], mask, depth + 1)) return true;
  }
  return false;
}

function hasBadgeValue(node: JsonObject, mask: number): boolean {
  if (mask & BADGE_LIVE && node['contentType'] === CONTENT_TYPE_LIVE)
    return true;
  if (mask & BADGE_UPCOMING && node['upcomingEventData'] !== undefined)
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
 * Filters a shelf's content lists in place and reports how many items they held and how many are left, so a shelf this filter emptied can be dropped whole - left in place it renders as a heading over skeleton tiles that never fill.
 */
function filterShelfLists(
  shelf: JsonObject,
  depth: number
): { had: number; left: number } {
  const content = shelf['content'];
  if (!isContainer(content)) {
    return { had: 0, left: 0 };
  }

  let had = 0;
  let left = 0;
  const lists = [
    getByPath(content, ['horizontalListRenderer', 'items']),
    getByPath(content, ['gridRenderer', 'items']),
    getByPath(content, ['expandedShelfContentsRenderer', 'items'])
  ];
  for (const list of lists) {
    if (!isArray(list)) continue;
    had += list.length;
    scrubList(list, depth + 1);
    left += list.length;
  }
  return { had, left };
}

/** Whether a shelf goes: by title, or because this filter emptied it. */
function shelfIsDropped(shelf: unknown, depth: number): boolean {
  if (shouldDropShelfByTitle(shelf)) return true;
  if (!isRecord(shelf)) return false;

  const { had, left } = filterShelfLists(shelf, depth);
  return had > 0 && left === 0;
}

/** Filters one item list in place, dropping the tiles it covers. */
function scrubList(list: unknown[], depth: number): void {
  if (depth > MAX_COSMETIC_DEPTH) return;

  // Reverse order so splice does not shift indices still to be walked.
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    if (!isContainer(item)) continue;

    if (isRecord(item)) {
      const shelf = item['shelfRenderer'];
      if (shelf) {
        if (shelfIsDropped(shelf, depth + 1)) {
          list.splice(i, 1);
        }
        continue;
      }

      // A container is filtered through, never dropped as a tile.
      if (isShelfContainer(item)) {
        sweep(item, depth + 1);
        continue;
      }
    }

    if (cosmeticMask && hasWantedBadge(item, cosmeticMask, 0)) {
      list.splice(i, 1);
    }
  }
}

/** Walks an object/array, filtering every shelf and tile list in place. */
function sweep(node: unknown, depth: number): void {
  if (!isContainer(node)) return;
  if (depth > MAX_COSMETIC_DEPTH) return;

  if (isArray(node)) {
    scrubList(node, depth);
    return;
  }

  const record = node as JsonObject;
  for (const key of Object.keys(record)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = record[key];
    if (!isContainer(value)) continue;

    if (key === 'shelfRenderer') {
      if (shelfIsDropped(value, depth)) {
        delete record[key];
      }
      continue;
    }

    sweep(value, depth + 1);
  }
}

/**
 * Cached config flags. JSON.parse runs for thousands of small blobs, so settings are read once and refreshed from config change events rather than per call. `filtersEnabled` is the cheap guard every parse pays; `loadRowsAhead` is independent and runs even when every filter is off.
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
// Independent of the filters above: rows-ahead edits the parsed body's continuations, not the ad/cosmetic surfaces, so it is its own guard and runs even when every filter is off.
let loadRowsAhead = false;

function refreshFilters(): void {
  enableAdBlock = configRead('enableAdBlock');
  keepPlaybackTracking = configRead('keepPlaybackTracking');
  enableTrackingBlock = configRead('enableTrackingBlock');
  disableAutoCaptions = configRead('disableAutoCaptions');
  removeLiveVideos = configRead('removeLiveVideos');
  removeUpcomingVideos = configRead('removeUpcomingVideos');
  removeTopLiveGames = configRead('removeTopLiveGames');
  removeMostRelevant = configRead('removeMostRelevant');
  loadRowsAhead = configRead('loadRowsAhead');
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
const FILTER_KEYS = [
  'enableAdBlock',
  'keepPlaybackTracking',
  'enableTrackingBlock',
  'disableAutoCaptions',
  'removeLiveVideos',
  'removeUpcomingVideos',
  'removeTopLiveGames',
  'removeMostRelevant',
  'loadRowsAhead'
] as const satisfies readonly BoolKey[];
for (const key of FILTER_KEYS) {
  configAddChangeListener(key, refreshFilters);
}

/**
 * A trackingParams value is an opaque token with no quotes or escapes; one carrying a backslash is left as sent. The leading quote keeps the key out of a clickTrackingParams match (endcard clicks still need that one). Blanking the value in the text is one native pass, where walking the parsed tree for the same edit costs more than the parse.
 */
const TRACKING_PARAMS_KEY = '"trackingParams"';
const TRACKING_PARAMS_RE = /"trackingParams"\s*:\s*"[^"\\]*"/g;
const TRACKING_PARAMS_EMPTY = '"trackingParams":""';

function stripTrackingParams(text: string): string {
  if (text.indexOf(TRACKING_PARAMS_KEY) === -1) return text;
  return text.replace(TRACKING_PARAMS_RE, TRACKING_PARAMS_EMPTY);
}

/**
 * Subtitles that switch themselves on: without the default track and with captionsInitialState off, a video starts without subtitles; turning them on by hand still works.
 */
function captionsOff(holder: unknown): void {
  const tracks = getByPath(holder, [
    'captions',
    'playerCaptionsTracklistRenderer',
    'audioTracks'
  ]);
  if (!isArray(tracks)) return;

  for (const track of tracks) {
    if (!isRecord(track)) continue;
    delete track['defaultCaptionTrackIndex'];
    track['captionsInitialState'] = 'CAPTIONS_INITIAL_STATE_OFF_RECOMMENDED';
  }
}

const origParse = JSON.parse;
const installParse = claimHook('adblock-parse');
const adblockParse = function (
  this: unknown,
  text: string,
  reviver?: Parameters<typeof JSON.parse>[1]
) {
  if (!filtersEnabled && !loadRowsAhead && !thumbnailHookRequired()) {
    const plain: unknown = origParse.call(this, text, reviver);
    return plain;
  }

  // Blanked in the text, in one pass, before the parse.
  const source =
    enableTrackingBlock && typeof text === 'string'
      ? stripTrackingParams(text)
      : text;

  const r: unknown =
    reviver === undefined
      ? origParse.call(this, source)
      : origParse.call(this, source, reviver);

  if (!isContainer(r)) {
    return r;
  }

  // Rows ahead is independent of the filters, so it runs first; whatever the filters do below leaves the raised continuations in place.
  if (loadRowsAhead) {
    const rowsAheadType = detectRowsAheadType(r);
    if (rowsAheadType !== null) raiseRowsAhead(r, rowsAheadType);
  }

  if (enableAdBlock) {
    if (isRecord(r)) {
      // Pre-existing envelope deletes, kept explicit because they are certain to appear.
      if (r['adPlacements']) {
        delete r['adPlacements'];
      }

      if (isArray(r['adSlots'])) {
        delete r['adSlots'];
      }

      if (r['playerAds']) {
        delete r['playerAds'];
      }

      // Opt-in only: stripping playbackTracking kills watch history and resume, so it is kept unless the user explicitly turns the toggle off. Handled here rather than in AD_RENDERERS because it is not an ad surface.
      if (!keepPlaybackTracking && r['playbackTracking']) {
        delete r['playbackTracking'];
      }
    }

    // Not skipped when a reviver may have renamed keys, or the input is not text.
    if (
      typeof source !== 'string' ||
      reviver !== undefined ||
      AD_KEY_TEXT_RE.test(source)
    ) {
      scrubAds(r);
    }
  }

  if (disableAutoCaptions) {
    captionsOff(r);
    captionsOff(getByPath(r, ['playerResponse']));
  }

  if (cosmeticEnabled) {
    sweep(r, 0);
  }

  // Max Thumbnail Quality: rewrite thumbnail URLs in the parsed body. Always on and run last, so shelves and ad slots removed above are never rewritten. The response type is detected once here and handed to the rewriter.
  upgradeResponseThumbnails(r, detectResponseType(r));

  return r;
};
if (installParse) JSON.parse = adblockParse;

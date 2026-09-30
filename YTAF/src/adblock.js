/* eslint no-redeclare: 0 */
/* global fetch:writable */
import { configRead } from './config';

/**
 * A minimal reimplementation of the following uBlock Origin rule:
 * https://github.com/uBlockOrigin/uAssets/blob/master/filters/filters.txt
 *
 * The original only reached the ad surfaces an anonymous session sees. A signed
 * in account gets additional, differently-named renderers for the same thing -
 * the "Up next" rail, mastheads, in-feed ad slots, and the search promo cards -
 * so this drops them by renderer name instead of by response path.
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
  'playbackTracking',
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

const origParse = JSON.parse;
JSON.parse = function () {
  /** @type {unknown} */
  const r = origParse.apply(this, arguments);

  if (!configRead('enableAdBlock')) {
    return r;
  }

  // Pre-existing envelope deletes, kept explicit because they are the cases
  // that are certain to appear and are worth a distinct log line.
  if (r?.adPlacements) {
    delete r.adPlacements;
    logHit('adPlacements');
  }

  if (Array.isArray(r?.adSlots)) {
    delete r.adSlots;
    logHit('adSlots');
  }

  if (r?.playerAds) {
    delete r.playerAds;
    logHit('playerAds');
  }

  if (r !== null && typeof r === 'object') {
    for (const key of scrubAds(r)) logHit(key);
  }

  return r;
};

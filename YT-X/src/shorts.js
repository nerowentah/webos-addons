/* eslint no-redeclare: 0 */
/* global fetch:writable */
import { configRead } from './config';

const SHELF_SHORTS = 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS';

const origParse = JSON.parse;
JSON.parse = function () {
  const r = origParse.apply(this, arguments);
  if (!configRead('removeShorts')) {
    return r;
  }

  // First page of subscriptions tab
  const gridRenderer = findFirstObject(r, 'gridRenderer');
  if (gridRenderer?.items) {
    removeShorts(gridRenderer);
  }

  // Pagination
  const gridContinuation = findFirstObject(r, 'gridContinuation');
  if (gridContinuation?.items) {
    removeShorts(gridContinuation);
  }

  // Shelf on subscriptions tab
  const sectionListRenderer = findFirstObject(r, 'sectionListRenderer');
  if (sectionListRenderer?.contents) {
    removeShelvesWithShorts(sectionListRenderer);
  }

  // Side menu (guide): Shorts is its own entry in the left rail. Guide entries
  // only ever appear inside the guide payload, so acting on arrays that hold
  // them cannot touch feed or player content. The raw payload is checked first
  // so the full-tree walk only runs for the (rare) guide response.
  const text = arguments[0];
  if (
    typeof text === 'string' &&
    (text.includes('guideEntryRenderer') || text.includes('guideShelfRenderer'))
  ) {
    removeShortsFromGuide(r, 0);
  }

  return r;
};

function removeShorts(container) {
  container.items = container.items.filter(
    (elm) => elm?.tileRenderer?.onSelectCommand?.reelWatchEndpoint == null
  );
}

function removeShelvesWithShorts(container) {
  container.contents = container.contents.filter(
    (elm) => elm?.shelfRenderer?.tvhtml5ShelfRendererType != SHELF_SHORTS
  );
}

/**
 * Renderers that own a guide entry, so an array of them is a guide rail.
 *
 * Only a guide payload nests these keys, so `removeShortsFromGuide` acts only
 * where the walk proves it is looking at the side menu - never at a browse or
 * player response, even though those also carry `navigationEndpoint`s.
 */
const GUIDE_KEYS = new Set(['guideEntryRenderer', 'guideShelfRenderer']);

const MAX_GUIDE_DEPTH = 32;

/**
 * Drop the Shorts entries from every guide rail in the response.
 *
 * The leanback guide is a short list (a few dozen entries), so a bounded walk
 * over it is cheap and lets the filter reach entries nested in a shelf as well
 * as the top-level rail.
 */
function removeShortsFromGuide(node, depth) {
  if (node === null || typeof node !== 'object' || depth > MAX_GUIDE_DEPTH) {
    return;
  }

  if (Array.isArray(node)) {
    // Reverse order so splice does not shift the indices still to be walked;
    // mutates the array the parent holds, so the rail stays live in the payload.
    // Kept elements are descended into, so entries nested in a shelf (for
    // example items -> guideSectionRenderer.items -> guideEntryRenderer) are
    // still reached.
    for (let i = node.length - 1; i >= 0; i -= 1) {
      if (isShortsGuideEntry(node[i])) node.splice(i, 1);
      else removeShortsFromGuide(node[i], depth + 1);
    }
    return;
  }

  for (const key in node) {
    removeShortsFromGuide(node[key], depth + 1);
  }
}

/** True if a guide element is the Shorts rail entry. */
function isShortsGuideEntry(elm) {
  if (elm === null || typeof elm !== 'object') return false;

  for (const key of GUIDE_KEYS) {
    const entry = elm[key];
    if (entry !== undefined && isShortsEndpoint(entry)) return true;
  }

  return false;
}

function isShortsEndpoint(entry) {
  const nav = entry?.navigationEndpoint;
  if (nav?.reelWatchEndpoint != null) return true;

  const url = nav?.commandMetadata?.webCommandMetadata?.url;
  if (typeof url === 'string' && url.startsWith('/shorts')) return true;

  const browse = nav?.browseEndpoint;
  if (browse == null) return false;
  if (browse.browseId === 'FEshorts') return true;
  if (browse.canonicalBaseUrl === '/shorts') return true;

  // The Shorts entry is addressed by a browse params that base64-decodes to
  // 'shorts'; matching on the literal ASCII covers the channel "Shorts" tab
  // variant as well as the side-menu entries that reuse it. The params arrive
  // URL-encoded (for example a trailing `%3D`), so decode before atob.
  if (typeof browse.params !== 'string') return false;
  try {
    return atob(decodeURIComponent(browse.params)).includes('shorts');
  } catch {
    return false;
  }
}

function findFirstObject(haystack, needle) {
  for (const key in haystack) {
    if (key === needle) {
      return haystack[key];
    }
    if (typeof haystack[key] === 'object') {
      const result = findFirstObject(haystack[key], needle);
      if (result) return result;
    }
  }
  return null;
}

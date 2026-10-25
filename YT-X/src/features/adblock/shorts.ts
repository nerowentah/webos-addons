import { claimHook } from '../../core/hook-once';
import { configRead } from '../../config/config';
import { registerParseProcessor } from '../../youtube/hooks/json-parse';
import {
  getByPath,
  isArray,
  isContainer,
  isRecord,
  type JsonObject
} from '../../youtube/json';

const SHELF_SHORTS = 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS';

if (claimHook('shorts-parse')) {
  registerParseProcessor((r, text) => {
    if (!configRead('removeShorts')) {
      return;
    }

    const found = findFirstObjects(r, [
      'gridRenderer',
      'gridContinuation',
      'sectionListRenderer'
    ]);

    // First page of subscriptions tab
    const gridRenderer = found['gridRenderer'];
    if (isRecord(gridRenderer) && isArray(gridRenderer['items'])) {
      removeShorts(gridRenderer, gridRenderer['items']);
    }

    // Pagination
    const gridContinuation = found['gridContinuation'];
    if (isRecord(gridContinuation) && isArray(gridContinuation['items'])) {
      removeShorts(gridContinuation, gridContinuation['items']);
    }

    // Shelf on subscriptions tab
    const sectionListRenderer = found['sectionListRenderer'];
    if (
      isRecord(sectionListRenderer) &&
      isArray(sectionListRenderer['contents'])
    ) {
      removeShelvesWithShorts(
        sectionListRenderer,
        sectionListRenderer['contents']
      );
    }

    // Side menu (guide): guide entries only appear in the guide payload, so
    // filtering there cannot touch feed or player content.
    if (
      typeof text === 'string' &&
      (text.includes('guideEntryRenderer') ||
        text.includes('guideShelfRenderer'))
    ) {
      removeShortsFromGuide(r, 0);
    }
  });
}

function removeShorts(container: JsonObject, items: unknown[]): void {
  container['items'] = items.filter(
    (elm) =>
      getByPath(elm, [
        'tileRenderer',
        'onSelectCommand',
        'reelWatchEndpoint'
      ]) == null
  );
}

function removeShelvesWithShorts(
  container: JsonObject,
  contents: unknown[]
): void {
  container['contents'] = contents.filter(
    (elm) =>
      getByPath(elm, ['shelfRenderer', 'tvhtml5ShelfRendererType']) !=
      SHELF_SHORTS
  );
}

/**
 * Renderers that own a guide entry, so an array of them is a guide rail; these
 * keys only nest inside a guide payload.
 */
const GUIDE_KEYS = new Set(['guideEntryRenderer', 'guideShelfRenderer']);

const MAX_GUIDE_DEPTH = 32;

/** Drop the Shorts entries from every guide rail in the response. */
function removeShortsFromGuide(node: unknown, depth: number): void {
  if (!isContainer(node) || depth > MAX_GUIDE_DEPTH) {
    return;
  }

  if (isArray(node)) {
    // Reverse order so splice does not shift indices still to be walked, and
    // descend into kept elements to reach entries nested in a shelf.
    for (let i = node.length - 1; i >= 0; i -= 1) {
      if (isShortsGuideEntry(node[i])) node.splice(i, 1);
      else removeShortsFromGuide(node[i], depth + 1);
    }
    return;
  }

  for (const key in node) {
    removeShortsFromGuide((node as JsonObject)[key], depth + 1);
  }
}

/** True if a guide element is the Shorts rail entry. */
function isShortsGuideEntry(elm: unknown): boolean {
  if (!isRecord(elm)) return false;

  for (const key of GUIDE_KEYS) {
    const entry = elm[key];
    if (entry !== undefined && isShortsEndpoint(entry)) return true;
  }

  return false;
}

function isShortsEndpoint(entry: unknown): boolean {
  const nav = getByPath(entry, ['navigationEndpoint']);
  if (getByPath(nav, ['reelWatchEndpoint']) != null) return true;

  const url = getByPath(nav, ['commandMetadata', 'webCommandMetadata', 'url']);
  if (typeof url === 'string' && url.startsWith('/shorts')) return true;

  const browse = getByPath(nav, ['browseEndpoint']);
  if (!isRecord(browse)) return false;
  if (browse['browseId'] === 'FEshorts') return true;
  if (browse['canonicalBaseUrl'] === '/shorts') return true;

  // Params base64-decode to the literal ASCII 'shorts' (channel tab and
  // side-menu variants); they arrive URL-encoded, so decode before atob.
  const params = browse['params'];
  if (typeof params !== 'string') return false;
  try {
    return atob(decodeURIComponent(params)).includes('shorts');
  } catch {
    return false;
  }
}

/** First truthy value per needle key in one pre-order walk (same result as a separate search per key); stops once every needle is found. */
function findFirstObjects(
  root: object,
  needles: readonly string[]
): Record<string, unknown> {
  const found: Record<string, unknown> = {};
  let remaining = needles.length;

  const walk = (haystack: JsonObject): boolean => {
    for (const key in haystack) {
      const value = haystack[key];
      if (value && found[key] === undefined && needles.includes(key)) {
        found[key] = value;
        if (--remaining === 0) return true;
      }
      if (isContainer(value) && walk(value as JsonObject)) return true;
    }
    return false;
  };

  walk(root as JsonObject);
  return found;
}

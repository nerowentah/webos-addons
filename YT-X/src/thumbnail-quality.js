/** Rewrites thumbnail URLs inside adblock.js's JSON.parse hook so the app is only handed the high-quality URL. maxresdefault does not exist for every video and YouTube answers a miss with a small grey placeholder rather than a 404 (see PLACEHOLDER_MAX_BYTES), hence the speculative qualityMode and the verification queue. */
const DEBUG = false;

/** qualityMode: 'safe' (fixed). Modes: 'safe' only emits rungs known to exist or probe-confirmed (never grey); 'eager' draws maxres then corrects a miss; 'sd' is eager stopped at sddefault (cheaper decode, less sharp). */
const qualityMode = 'safe';

/** Emit WebP derivatives (~25-30% smaller) when the runtime can decode them. Off by default: `vi_webp` coverage is per-video/all-or-nothing with nothing in the response advertising it, so a miss costs a grey tile until the probe lands. */
const USE_WEBP = false;

const ENABLE_LIVE_PROMOTION = true;

// Probe budget: HEADs fire from idle callbacks, never from the parse itself.
const MAX_CONCURRENT_PROBES = 3;
// Hard ceiling on distinct videos ever probed in one session.
const PROBE_ATTEMPT_LIMIT = 4000;
// Waits this long after the last response before verifying; doubles as a scroll detector without a scroll listener.
const PROBE_IDLE_DELAY = 1200;
// Past the idle gate per parse: sized to about one visible row so a grey tile is corrected in one round.
const PROBE_URGENT_BURST = 4;
// Remote arrow keys are the other scroll signal; also pauses promotions, which write a background-image mid-row-animation. Covers the remote's key-repeat interval with margin.
const NAV_PAUSE_MS = 350;
const NAV_KEY_CODES = { 37: true, 38: true, 39: true, 40: true };
// Probes for rendered tiles skip the idle gate: an on-screen grey box is the whole reason verification exists.
const PROBE_VISIBLE_BURST = 6;
// The rendered set only changes as fast as the user scrolls; sampling it costs a document-wide selector match.
const VISIBLE_SAMPLE_TTL = 250;
// Below this the queue drains in a round or two and ordering cannot matter.
const VISIBILITY_SORT_MIN_QUEUE = 6;
const PROBE_TIMEOUT = 5000;
// A missing derivative comes back 200 OK with a tiny grey placeholder body, and decodes at 120x90.
const PLACEHOLDER_MAX_BYTES = 5000;
const PLACEHOLDER_MAX_WIDTH = 120;

const PROMOTION_DEBOUNCE = 150;
// A correction whose tile is not on screen yet is retried rather than dropped.
const PROMOTION_RETRY_DELAY = 900;
const PROMOTION_MAX_ATTEMPTS = 5;
const CACHE_KEY = 'ytx-thumb-quality';
// Ladder+revision marker for stored answers (e.g. "5r2"), kept beside the cache so its one-split parse stays unchanged.
const CACHE_CAP_KEY = 'ytx-thumb-quality-cap';
// Revision 2: timeouts/network errors are no longer saved as misses; caches from older revisions may hold such misses and are dropped once.
const CACHE_REVISION = 2;
const CACHE_LIMIT = 1200;
const CACHE_SAVE_DEBOUNCE = 4000;
const PENDING_LIMIT = 1500;

// Fallback-scan bounds for when no schema path matched. Depth 16 is not arbitrary: a tile container sits at depth 13 (see tileRenderer path) and the playlistPanelVideoWrapper shape adds two more; a cap of 12 could not rescue the exact shapes the scan exists to rescue.
const SCAN_MAX_NODES = 6000;
const SCAN_MAX_DEPTH = 16;

// Quality ladder, worst to best; the index is the rank stored in the cache. hqdefault exists for every video ever; maxresdefault only when the source was >= 720p; hq720/maxres are both 1280x720 16:9 for most uploads; sd/mq/hq defaults are 4:3 letterboxed.
const QUALITY_NAMES = [
  'default',
  'mqdefault',
  'hqdefault',
  'sddefault',
  'hq720',
  'maxresdefault'
];
const RANK = {
  default: 0,
  mqdefault: 1,
  hqdefault: 2,
  sddefault: 3,
  hq720: 4,
  maxresdefault: 5
};

/** The rung that is always present. Nothing is ever emitted below this. */
const FLOOR_RANK = RANK.hqdefault;

/** Rungs generated for every video ever uploaded. Above this needs proof. */
const GUARANTEED_RANK = RANK.hqdefault;

/** The best rung a mode emits or probes for. A single rung, deliberately: maxresdefault and hq720 are both 1280x720 for most uploads, so probing the second rung doubled verification traffic to distinguish identical-size files. A miss falls straight to the guaranteed floor. */
function usefulRankFor(mode) {
  return mode === 'sd' ? RANK.sddefault : RANK.maxresdefault;
}

function drawsUnproven(mode) {
  return mode === 'sd' || mode === 'eager';
}

let usefulRank = usefulRankFor(qualityMode);

// A probe that learned nothing (timeout/network error), unlike a miss: a missing rung is answered with a 404 or a tiny grey placeholder, which a HEAD reads and an image loads.
const UNKNOWN = 'unknown';

// Anchored so it cannot match mid-string; `\w+` on the basename so A/B-test variants (hqdefault_custom_2) are captured then rejected by the RANK lookup rather than rewritten to a name with no custom-variant equivalent.
const THUMB_URL_RE =
  /^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]+)\/(\w+)\.(?:jpg|jpeg|webp|png)/;
const THUMB_IN_CSS_RE = /i\.ytimg\.com\/vi(?:_webp)?\/([\w-]+)\//;

const DOM_SELECTOR =
  'ytlr-thumbnail-details, ytlr-surface-page, thumbnail image';

// Must be synchronous: the first browse response can arrive before an async detection settles, and a mid-session flip would emit two URL families for one video and halve the HTTP cache hit rate.
const webpSupported = (() => {
  if (!USE_WEBP) return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  } catch {
    return false;
  }
})();

const enabled = true;

/** videoId -> verified rank. Survives navigation and restarts. */
const qualityCache = new Map();
/** 'safe' only: session floor from a probe that learned nothing; kept out of the saved cache so the next session asks again. */
const unconfirmed = new Set();
/** Insertion-ordered probe backlog of videoIds. */
const probeQueue = new Set();
// The videos the current parse queued; deferProbes() makes them the latest parse and empties it.
const queuedByParse = [];
// The latest parse's queued videos: the only ones the urgent budget is spent on, so a parse never pays for earlier backlogs.
const latestParse = new Set();
/** Every videoId enqueued this session (one attempt each); evictions from the verification cache allow a re-probe. */
const probeAttempted = new Set();
const pendingPromotions = new Map();
const promotionAttempts = new Map();
/** videoId -> the thumbnail entry objects we wrote an unverified URL into. These are the app's own objects (JSON.parse handed it the same references), so a correction is written back into the model and a tile that has not rendered yet never becomes grey; the DOM sweep only needs to cover tiles already on screen. */
const pendingEntries = new Map();
/** videoId -> highest rank already known good, so corrections cannot regress. */
const provenFloor = new Map();

let activeProbes = 0;
let saveTimer = null;
let promoteTimer = null;
let probePump = null;
let probeTimer = null;
// Monotonic clock: a wall clock set back (the TV syncing time) would otherwise stretch the idle gate.
let lastParseAt = -Infinity;
let lastNavAt = -Infinity;
// Bumped when the verification cache is reset (mode change across rungs): a probe in flight against the old ladder must not write into the new.
let probeGeneration = 0;
let urgentLeft = 0;
let visibleBudget = 0;
let visibleSample = null;
let visibleSampleAt = 0;

const now = () => window.performance.now();

const idle = (cb) => window.requestIdleCallback(cb, { timeout: 500 });

function debugLog(...args) {
  if (DEBUG) console.info('[ThumbQuality]', ...args);
}

/** Sets `key`, dropping the oldest entry at `limit`; returns the dropped key, or null. */
function capSet(map, key, value, limit) {
  let evicted = null;
  // Only a new key makes room: overwriting one must not cost another video.
  if (map.size >= limit && !map.has(key)) {
    evicted = map.keys().next().value;
    map.delete(evicted);
  }
  map.set(key, value);
  return evicted;
}

// Compact "id:rank,id:rank" rather than JSON: parses with one split on startup and avoids the hooked JSON.stringify entirely.

function capMarker() {
  return usefulRank + 'r' + CACHE_REVISION;
}

/** Forgets the stored answers and records the ladder the next ones are measured against. */
function dropStoredCache() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
    window.localStorage.setItem(CACHE_CAP_KEY, capMarker());
  } catch {
    // Storage refused: the answers are still forgotten for this session.
  }
}

function loadCache() {
  try {
    // The cache is only valid against the ladder/revision that wrote it; any other marker means every stored answer is suspect - drop once, start over.
    if (window.localStorage.getItem(CACHE_CAP_KEY) !== capMarker()) {
      dropStoredCache();
      return;
    }
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parts = raw.split(',');
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      const sep = entry.lastIndexOf(':');
      if (sep < 1) continue;
      const rank = +entry.slice(sep + 1);
      if (rank >= 0 && rank < QUALITY_NAMES.length)
        qualityCache.set(entry.slice(0, sep), rank);
    }
    debugLog(`loaded ${qualityCache.size} cached qualities`);
  } catch {
    // Private mode / quota / storage disabled — the cache is an optimisation.
  }
}

function saveCache() {
  saveTimer = null;
  try {
    const out = [];
    // Map iteration is insertion-ordered, so dropping from the front evicts the oldest entries.
    let skip = qualityCache.size - CACHE_LIMIT;
    qualityCache.forEach((rank, id) => {
      if (skip-- > 0) return;
      if (!unconfirmed.has(id)) out.push(id + ':' + rank);
    });
    window.localStorage.setItem(CACHE_KEY, out.join(','));
    window.localStorage.setItem(CACHE_CAP_KEY, capMarker());
  } catch {
    // Ignore.
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveCache, CACHE_SAVE_DEBOUNCE);
}

/** Build a thumbnail URL. `forceJpeg` because the hqdefault floor is only guaranteed in the `/vi/` family - `vi_webp` coverage is not universal and a webp fallback for a webp miss would land on the same 404, leaving the tile grey permanently. */
function buildUrl(videoId, name, forceJpeg) {
  return webpSupported && !forceJpeg
    ? 'https://i.ytimg.com/vi_webp/' + videoId + '/' + name + '.webp'
    : 'https://i.ytimg.com/vi/' + videoId + '/' + name + '.jpg';
}

/** Resolve one thumbnail URL to its upgraded form, or null to leave it alone. Emits the useful rung clamped to the safe ceiling (what is known to exist, from this response or a cached probe); when useful exceeds safe a probe is scheduled and the better rung lands on a later parse, so the tile is correct meanwhile rather than grey. Entry width/height are left alone; the app sizes tiles from them. */
function upgradeEntry(entry, proven) {
  const url = entry.url;
  // Cheap rejection first: almost every string in a response is not a URL.
  if (typeof url !== 'string' || url.charCodeAt(0) !== 104 /* h */) return null;
  if (url.indexOf('i.ytimg.com/vi') === -1) return null;

  const match = THUMB_URL_RE.exec(url);
  if (!match) return null;

  const videoId = match[1];
  const currentRank = RANK[match[2]];
  // Unknown basename (A/B custom variant, storyboard, something new): no safe mapping, leave as sent.
  if (currentRank === undefined) return null;

  const verified = qualityCache.get(videoId);

  let ceiling = proven === undefined ? GUARANTEED_RANK : proven;
  const ceilingBeforeMode =
    verified !== undefined && verified > ceiling ? verified : ceiling;

  if (verified !== undefined) {
    // A verified answer outranks the mode: drawing unproven rungs is a policy for the *unknown*, not a licence to re-emit a rung already watched 404. scheduleProbe is gated on `verified === undefined`, so a wrong answer here would never be revisited.
    ceiling = ceilingBeforeMode;
  } else if (drawsUnproven(qualityMode)) {
    ceiling = usefulRank;
  }

  // Every mode wants the best rung that exists up to its own cap; they differ only in whether an *unproven* rung may be rendered meanwhile. Not capped by slot width - that would land on hqdefault, matching the ceiling, so no probe would ever run.
  const useful = usefulRank;
  let target = useful > ceiling ? ceiling : useful;
  if (target < currentRank) target = currentRank;

  // A probe is coming and this entry's answer may still change (up in 'safe' once confirmed, down in the unproven-drawing modes on a miss); either way it needs write-back.
  const unresolved =
    verified === undefined && (useful > ceiling || target > ceilingBeforeMode);
  if (unresolved) scheduleProbe(videoId);

  // Above the guarantee we rely on per-family proof (a probe verified the exact URL it fetched); at or below it we rely on hqdefault always existing, which is a `/vi/` guarantee only.
  const next = buildUrl(
    videoId,
    QUALITY_NAMES[target],
    target <= GUARANTEED_RANK
  );
  // Tracked even when the URL stays as sent: the probe's answer still has to be written back into this entry.
  if (unresolved) trackPending(videoId, entry, ceilingBeforeMode);
  if (next === url) return 0;
  entry.url = next;
  return 1;
}

/** Remember an entry we gambled on, capped so a long session cannot grow it unboundedly; eviction only costs that entry the write-back, the DOM sweep still covers it. */
function trackPending(videoId, entry, floor) {
  let entries = pendingEntries.get(videoId);
  if (!entries) {
    if (pendingEntries.size >= PENDING_LIMIT) {
      const oldest = pendingEntries.keys().next().value;
      pendingEntries.delete(oldest);
      provenFloor.delete(oldest);
    }
    entries = [];
    pendingEntries.set(videoId, entries);
  }
  // What this video is already known to support, so a correction can never walk an entry below it (e.g. a maxres miss must not drag an hq720 rung YouTube itself shipped down to hqdefault).
  const known = provenFloor.get(videoId);
  if (known === undefined || floor > known) provenFloor.set(videoId, floor);
  if (entries.length < 8) entries.push(entry);
}

/** Rewrite every URL in a thumbnail container in place. Handles both `{ thumbnails: [...] }` (tileRenderer and friends) and `{ sources: [...] }` (the newer *ViewModel schema). */
function upgradeContainer(container) {
  if (!container) return 0;
  const list = container.thumbnails || container.sources;
  if (!Array.isArray(list) || list.length === 0) return 0;

  // The highest rung YouTube itself put in this container is an existence proof for that derivative - free verification (e.g. hq720 on the watch page, emittable without a probe).
  let proven = GUARANTEED_RANK;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry || typeof entry.url !== 'string') continue;
    const m = THUMB_URL_RE.exec(entry.url);
    const r = m ? RANK[m[2]] : undefined;
    if (r !== undefined && r > proven) proven = r;
  }

  let changed = 0;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry) continue;
    if (typeof entry.url !== 'string') continue;
    changed += upgradeEntry(entry, proven);
  }
  return changed;
}

// Everything below is O(1) per item: no recursion, no searching. Shapes seen in real home/continuation/watch responses, plus the legacy renderers kept as cheap insurance.

function upgradeItem(item) {
  if (!item || typeof item !== 'object') return 0;
  let changed = 0;

  // A watch-page playlist row wraps the tile one level deeper.
  const tile =
    item.tileRenderer ||
    item.playlistPanelVideoWrapperRenderer?.primaryRenderer?.tileRenderer;

  if (tile) {
    const header = tile.header?.tileHeaderRenderer;
    changed += upgradeContainer(header?.thumbnail);
    changed += upgradeContainer(header?.thumbnailViewModel?.image);
    // The long-press menu carries a copy of the same URL; rewriting it keeps both pointing at one file so opening the menu is an HTTP cache hit.
    changed += upgradeContainer(
      tile.onLongPressCommand?.showMenuCommand?.thumbnail
    );
    return changed;
  }

  changed += upgradeContainer(item.previewButtonRenderer?.thumbnail);
  changed += upgradeContainer(item.pivotVideoRenderer?.thumbnail);
  changed += upgradeContainer(
    item.lockupViewModel?.contentImage?.thumbnailViewModel?.image
  );
  // Legacy renderers — not produced by current tvhtml5 builds, but free.
  changed += upgradeContainer(item.gridVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.compactVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.videoRenderer?.thumbnail);
  return changed;
}

function upgradeItems(items) {
  if (!Array.isArray(items)) return 0;
  let changed = 0;
  for (let i = 0; i < items.length; i++) changed += upgradeItem(items[i]);
  return changed;
}

function upgradeSectionList(contents) {
  if (!Array.isArray(contents)) return 0;
  let changed = 0;

  for (let i = 0; i < contents.length; i++) {
    const section = contents[i];
    if (!section) continue;

    const shelf = section.shelfRenderer;
    if (shelf) {
      const content = shelf.content;
      if (content) {
        changed += upgradeItems(content.horizontalListRenderer?.items);
        changed += upgradeItems(content.gridRenderer?.items);
        changed += upgradeItems(content.expandedShelfContentsRenderer?.items);
      }
      continue;
    }

    if (section.gridRenderer) {
      changed += upgradeItems(section.gridRenderer.items);
      continue;
    }
    if (section.horizontalListRenderer) {
      changed += upgradeItems(section.horizontalListRenderer.items);
      continue;
    }
    // Search interleaves bare items among the shelves.
    changed += upgradeItem(section);
  }
  return changed;
}

function getByPath(obj, parts) {
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

// Paths mirror RESPONSE_TYPE_SIGNATURES in adblock.js so both engines agree on where a given response keeps its content.

const P = {
  HOME: [
    'contents',
    'tvBrowseRenderer',
    'content',
    'tvSurfaceContentRenderer',
    'content',
    'sectionListRenderer',
    'contents'
  ],
  TABS: [
    'contents',
    'tvBrowseRenderer',
    'content',
    'tvSecondaryNavRenderer',
    'sections'
  ],
  SEARCH: ['contents', 'sectionListRenderer', 'contents'],
  CONT_SECTION: ['continuationContents', 'sectionListContinuation', 'contents'],
  CONT_TVSURFACE: [
    'continuationContents',
    'tvSurfaceContentContinuation',
    'content',
    'sectionListRenderer',
    'contents'
  ],
  CONT_GRID: ['continuationContents', 'gridContinuation', 'items'],
  CONT_HORIZ: ['continuationContents', 'horizontalListContinuation', 'items'],
  PIVOT: [
    'contents',
    'singleColumnWatchNextResults',
    'pivot',
    'sectionListRenderer',
    'contents'
  ],
  AUTOPLAY: [
    'contents',
    'singleColumnWatchNextResults',
    'autoplay',
    'autoplay'
  ],
  REPLAY_BG: [
    'playerOverlays',
    'playerOverlayRenderer',
    'replay',
    'playerOverlayReplayRenderer',
    'background'
  ],
  CURRENT_THUMB: ['currentVideoThumbnail'],
  MICROFORMAT: ['microformat', 'playerMicroformatRenderer', 'thumbnail'],
  VIDEO_DETAILS: ['videoDetails', 'thumbnail']
};

function upgradeAutoplaySets(sets) {
  if (!Array.isArray(sets)) return 0;
  let changed = 0;
  for (let i = 0; i < sets.length; i++) {
    const item =
      sets[i]?.nextVideoRenderer?.autoplayVideoWrapperRenderer
        ?.primaryEndpointRenderer?.autoplayEndpointRenderer?.item;
    if (item) changed += upgradeItem(item);
  }
  return changed;
}

function upgradeAutoplay(autoplay) {
  if (!autoplay) return 0;
  let changed = 0;
  changed += upgradeAutoplaySets(autoplay.sets);
  changed += upgradeAutoplaySets(autoplay.modifiedSets);
  changed += upgradeContainer(
    autoplay.replayVideoRenderer?.pivotVideoRenderer?.thumbnail
  );
  return changed;
}

function upgradeBrowseTabs(sections) {
  if (!Array.isArray(sections)) return 0;
  let changed = 0;
  for (let i = 0; i < sections.length; i++) {
    const tabs = sections[i]?.tvSecondaryNavSectionRenderer?.tabs;
    if (!Array.isArray(tabs)) continue;
    for (let j = 0; j < tabs.length; j++) {
      const content = tabs[j]?.tabRenderer?.content;
      if (!content) continue;
      changed += upgradeSectionList(content.sectionListRenderer?.contents);
      changed += upgradeSectionList(
        content.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents
      );
    }
  }
  return changed;
}

function upgradeActions(actions) {
  if (!Array.isArray(actions)) return 0;
  let changed = 0;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!action) continue;
    changed += upgradeItems(
      action.reloadContinuationItemsCommand?.continuationItems
    );
    changed += upgradeItems(
      action.appendContinuationItemsAction?.continuationItems
    );
  }
  return changed;
}

/** Continuation payloads, in all four shapes. Called for every response, not only responseType 'CONTINUATION': a shelf continuation under the playing video keeps `contents.singleColumnWatchNextResults` attached and detectResponseType() checks NEXT before CONTINUATION, so the response is typed NEXT while its thumbnails live under `continuationContents.sectionListContinuation`. */
function upgradeContinuation(data) {
  let changed = 0;
  changed += upgradeSectionList(getByPath(data, P.CONT_SECTION));
  changed += upgradeSectionList(getByPath(data, P.CONT_TVSURFACE));
  changed += upgradeItems(getByPath(data, P.CONT_GRID));
  changed += upgradeItems(getByPath(data, P.CONT_HORIZ));
  return changed;
}

// Continuations that carry no video thumbnails; live chat polls every few seconds while a stream plays, and a scan of each would cost up to SCAN_MAX_NODES for nothing.
const NO_THUMBNAIL_CONTINUATIONS = {
  liveChatContinuation: true,
  commentRepliesContinuation: true,
  commentSectionContinuation: true
};

function isThumbnailFreeContinuation(contents) {
  if (!contents || typeof contents !== 'object') return false;
  let any = false;
  for (const key in contents) {
    if (!NO_THUMBNAIL_CONTINUATIONS[key]) return false;
    any = true;
  }
  return any;
}

/** Last-resort bounded walk, used only when the schema paths produced nothing - keeps the module working through an InnerTube reshuffle instead of silently doing nothing, without putting a full traversal on the hot path. */
function scanForThumbnails(root) {
  if (!root || typeof root !== 'object') return 0;
  const queue = [root, 0];
  let index = 0;
  let visited = 0;
  let changed = 0;

  while (index < queue.length) {
    if (++visited > SCAN_MAX_NODES) break;
    const node = queue[index++];
    const depth = queue[index++];
    if (!node || typeof node !== 'object' || depth > SCAN_MAX_DEPTH) continue;

    if (Array.isArray(node.thumbnails) || Array.isArray(node.sources))
      changed += upgradeContainer(node);

    const nextDepth = depth + 1;
    for (const key in node) {
      const value = node[key];
      if (value && typeof value === 'object') queue.push(value, nextDepth);
    }
  }
  if (DEBUG && changed)
    debugLog(`fallback scan upgraded ${changed} (visited ${visited})`);
  return changed;
}

/** Entry point called from adblock.js's JSON.parse hook. `responseType` is the type adblock already detected, so this costs no extra detection pass. */
export function upgradeResponseThumbnails(data, responseType) {
  if (!enabled || !data || typeof data !== 'object' || Array.isArray(data))
    return 0;

  // Stamped on every parse, including ones that rewrite nothing: an empty continuation is still evidence the surface is moving, and drainProbes() reads this to decide whether the app has gone quiet.
  lastParseAt = now();

  // Checked before the switch: any response type can carry a continuation alongside its own contents, and the type it gets classified as depends on whichever signature detectResponseType() happens to test first.
  let changed = data.continuationContents ? upgradeContinuation(data) : 0;
  let scanned = false;

  switch (responseType) {
    case 'HOME_BROWSE':
      changed += upgradeSectionList(getByPath(data, P.HOME));
      break;
    case 'BROWSE_TABS':
      changed += upgradeBrowseTabs(getByPath(data, P.TABS));
      break;
    case 'SEARCH':
      changed += upgradeSectionList(getByPath(data, P.SEARCH));
      break;
    case 'CONTINUATION':
      // Already handled above; a live chat or comment poll carries no video thumbnails and must not fall through to the scan.
      if (isThumbnailFreeContinuation(data.continuationContents))
        return changed;
      break;
    case 'SHORTS_SEQUENCE':
      changed += upgradeItems(data.entries);
      break;
    case 'ACTION':
      // A body can carry both lists, and the second is not a fallback.
      changed += upgradeActions(data.onResponseReceivedActions);
      changed += upgradeActions(data.onResponseReceivedEndpoints);
      break;
    case 'NEXT':
      changed += upgradeSectionList(getByPath(data, P.PIVOT));
      changed += upgradeAutoplay(getByPath(data, P.AUTOPLAY));
      changed += upgradeContainer(getByPath(data, P.REPLAY_BG));
      changed += upgradeContainer(getByPath(data, P.CURRENT_THUMB));
      break;
    case 'PLAYER':
      changed += upgradeContainer(getByPath(data, P.VIDEO_DETAILS));
      changed += upgradeContainer(getByPath(data, P.MICROFORMAT));
      changed += upgradeContainer(getByPath(data, P.REPLAY_BG));
      break;
    default:
      changed += scanForThumbnails(data);
      scanned = true;
  }

  // A known response type that yielded nothing means the shape moved.
  if (changed === 0 && !scanned) changed += scanForThumbnails(data);

  if (DEBUG && changed)
    debugLog(`${responseType}: rewrote ${changed} thumbnail URLs`);
  // Not gated on `changed`: a response that rewrote nothing can still have queued probes (a URL already at its rung), and those must start now. deferProbes() returns at once when the queue is empty.
  deferProbes();
  // Scrolling brings stale tiles on screen and produces parses, so this is the cheapest possible retry trigger.
  if (pendingPromotions.size > 0 && !promoteTimer) {
    promoteTimer = setTimeout(runPromotionSweep, PROMOTION_DEBOUNCE);
  }
  return changed;
}

/** Whether adblock.js needs to keep its JSON.parse hook installed for us. */
export function thumbnailHookRequired() {
  return enabled;
}

/** Whether the URL exists, by a HEAD request: true, false, UNKNOWN (timeout), or null when the HEAD could not tell (no readable Content-Length, or a request error - which is also what a cross-origin 404 without CORS headers looks like), in which case the caller loads the image instead. A grey placeholder answered 200 with a tiny body is missing. */
function headExists(url) {
  return new Promise((resolve) => {
    let xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('HEAD', url, true);
    } catch {
      resolve(UNKNOWN);
      return;
    }
    xhr.timeout = PROBE_TIMEOUT;
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return resolve(false);
      const length = parseInt(xhr.getResponseHeader('Content-Length'), 10);
      resolve(isNaN(length) ? null : length > PLACEHOLDER_MAX_BYTES);
    };
    xhr.onerror = () => resolve(null);
    xhr.ontimeout = () => resolve(UNKNOWN);
    xhr.onabort = () => resolve(UNKNOWN);
    try {
      xhr.send();
    } catch {
      resolve(UNKNOWN);
    }
  });
}

/** Verify by loading the image rather than asking about it. For rendered tiles this resolves out of the browser cache (including the cached 404 whose body is the grey placeholder, caught on its width); also the fallback when a HEAD could not tell, since XHR is subject to CORS and a cross-origin 404 need not carry readable headers. An `error` here is a load that never got an answer, not a miss. This is the same signal the network hooks were being asked for, taken at the layer that actually has it - a CSS background-image load never passes through fetch or XHR. */
function imageExists(url) {
  return new Promise((resolve) => {
    let img;
    try {
      img = new Image();
    } catch {
      resolve(UNKNOWN);
      return;
    }
    let settled = false;
    let timer = null;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => finish(img.naturalWidth > PLACEHOLDER_MAX_WIDTH);
    img.onerror = () => finish(UNKNOWN);
    timer = setTimeout(() => finish(UNKNOWN), PROBE_TIMEOUT);
    img.src = url;
  });
}

function scheduleProbe(videoId) {
  if (!enabled) return;
  if (qualityCache.has(videoId)) return;
  // One attempt per video per session whatever the outcome: the same tiles stream past on every scroll, and re-queueing them turned a settled surface into a permanent trickle of requests. (Only a verification-cache eviction takes a video out again.)
  if (probeAttempted.has(videoId)) return;
  if (probeAttempted.size >= PROBE_ATTEMPT_LIMIT) return;
  probeAttempted.add(videoId);
  probeQueue.add(videoId);
  queuedByParse.push(videoId);
}

/** The useful rung if it exists, else the guaranteed floor; null when the probe learned nothing (timeout or network error). */
async function resolveQuality(videoId, onScreen) {
  // On screen: the browser already holds the answer, so ask it. Off screen: a HEAD - an <img> there would pull down a full image nobody is looking at.
  const rank = usefulRank;
  const url = buildUrl(videoId, QUALITY_NAMES[rank]);
  let exists = await (onScreen ? imageExists : headExists)(url);
  // A HEAD that could not tell: ask the image, never assume.
  if (exists === null) exists = await imageExists(url);
  if (exists === UNKNOWN) return null;
  return exists ? rank : FLOOR_RANK;
}

function applyCorrection(videoId, rank) {
  const entries = pendingEntries.get(videoId);
  if (!entries) return;
  pendingEntries.delete(videoId);
  const url = buildUrl(videoId, QUALITY_NAMES[rank], rank <= GUARANTEED_RANK);
  for (let i = 0; i < entries.length; i++) {
    if (entries[i] && entries[i].url !== url) entries[i].url = url;
  }
}

function settledRank(videoId, resolved) {
  const floor = provenFloor.get(videoId);
  provenFloor.delete(videoId);
  return floor !== undefined && floor > resolved ? floor : resolved;
}

function onProbeDone(videoId, rank, generation) {
  // Correcting a tile changes what is on screen, so the cached sample is stale.
  visibleSample = null;
  activeProbes--;

  // Answered against a ladder that no longer applies (the mode changed while in flight): dropped; the video is probed again when a parse next mentions it.
  if (generation !== probeGeneration) {
    drainProbes();
    return;
  }

  // Nothing learned (null): nothing is saved, so the next session asks again; the video is not re-queued this session (probeAttempted), so a flaky network cannot become a retry loop. Unproven-drawing modes keep what they drew - a timeout is no evidence - while 'safe' holds the floor for this session. A miss is an answer, and saved.
  const unknown = typeof rank !== 'number';
  if (unknown && drawsUnproven(qualityMode)) {
    pendingEntries.delete(videoId);
    provenFloor.delete(videoId);
    drainProbes();
    return;
  }
  const resolved = unknown ? FLOOR_RANK : rank;
  // A video the cache no longer remembers may be probed again when it comes back; the one-attempt rule is for videos that were never answered.
  const evicted = capSet(qualityCache, videoId, resolved, CACHE_LIMIT);
  if (evicted !== null) {
    probeAttempted.delete(evicted);
    unconfirmed.delete(evicted);
  }
  if (unknown) {
    unconfirmed.add(videoId);
  } else {
    unconfirmed.delete(videoId);
    scheduleSave();
  }

  // Write the truth back into the response objects the app still holds; a tile that has not scrolled into view yet reads `.url` at render time, so this corrects it before it is ever drawn - no grey frame at all.
  const settled = settledRank(videoId, resolved);
  applyCorrection(videoId, settled);

  // Also queue a DOM sweep for tiles that were already on screen; the sweep skips elements already on the right URL, so queuing unconditionally cannot lose a promotion.
  if (ENABLE_LIVE_PROMOTION) {
    pendingPromotions.set(videoId, settled);
    if (!promoteTimer)
      promoteTimer = setTimeout(runPromotionSweep, PROMOTION_DEBOUNCE);
  }

  drainProbes();
}

/** Called from the parse. The first videos this parse queued are the top of the response - what the user is looking at - so a small burst of them goes through immediately; everything else waits for the surface to settle. */
function deferProbes() {
  if (!enabled || probeQueue.size === 0) {
    queuedByParse.length = 0;
    return;
  }
  // A parse that queued nothing leaves the latest parse and its budget as they are: its head is still the freshest content on screen.
  if (queuedByParse.length > 0) {
    latestParse.clear();
    for (let i = 0; i < queuedByParse.length; i++)
      latestParse.add(queuedByParse[i]);
    queuedByParse.length = 0;
    urgentLeft = PROBE_URGENT_BURST;
  }
  visibleBudget = PROBE_VISIBLE_BURST;
  drainProbes();
  if (!probeTimer) probeTimer = setTimeout(drainProbes, PROBE_IDLE_DELAY);
}

/** videoIds the app currently has thumbnails rendered for - a free visibility signal, since the list is virtualised and "has a rendered thumbnail" already means "on or near screen". Deliberately not IntersectionObserver: the virtualised list recycles nodes rapidly, so observing every rendered tile is noisier than reading the already-rendered backgroundImage, which touches no layout. */
function sampleRenderedIds() {
  const at = now();
  if (visibleSample && at - visibleSampleAt < VISIBLE_SAMPLE_TTL)
    return visibleSample;

  let nodes;
  try {
    nodes = document.querySelectorAll(DOM_SELECTOR);
  } catch {
    return null;
  }

  const ids = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const background = nodes[i].style && nodes[i].style.backgroundImage;
    if (!background) continue;
    const match = THUMB_IN_CSS_RE.exec(background);
    if (match) ids.add(match[1]);
  }
  // Scrolling new tiles into view is itself a grant of budget; without this, scrolling through already-loaded content (which fetches nothing) would leave on-screen grey boxes waiting behind the idle gate.
  if (visibleSample === null || !sameIds(visibleSample, ids)) {
    visibleBudget = PROBE_VISIBLE_BURST;
  }

  visibleSample = ids;
  visibleSampleAt = at;
  return ids;
}

function sameIds(a, b) {
  if (a.size !== b.size) return false;
  const iterator = a.values();
  let step = iterator.next();
  while (!step.done) {
    if (!b.has(step.value)) return false;
    step = iterator.next();
  }
  return true;
}

function takeFrom(set, picked, limit) {
  const iterator = set.values();
  let step = iterator.next();
  while (!step.done && picked.length < limit) {
    const id = step.value;
    if (probeQueue.has(id) && picked.indexOf(id) === -1) picked.push(id);
    step = iterator.next();
  }
}

/** Up to `limit` queued ids: on-screen ones first, then the latest parse's in the order it queued them, then the head of the queue. Each tier is read from its own small set against the queue, so a pick costs the size of those sets plus `limit`, not a pass over the whole queue. */
function pickProbeIds(rendered, limit) {
  const picked = [];
  if (limit <= 0) return picked;
  if (rendered) takeFrom(rendered, picked, limit);
  if (picked.length < limit) takeFrom(latestParse, picked, limit);
  if (picked.length < limit) takeFrom(probeQueue, picked, limit);
  return picked;
}

/** Whether a picked video may go now, spending the budget of its tier: on-screen work first, then the latest parse's head, everything else waits for the surface to settle so it never competes with an active scroll. A tile one tier refuses falls through to the tiers below rather than holding the queue. */
function admitToTier(videoId, onScreen) {
  if (onScreen && visibleBudget > 0) {
    visibleBudget--;
    return true;
  }
  if (urgentLeft > 0 && latestParse.has(videoId)) {
    urgentLeft--;
    return true;
  }
  return now() - lastParseAt >= PROBE_IDLE_DELAY;
}

function startProbe(videoId, onScreen, generation) {
  probeQueue.delete(videoId);
  latestParse.delete(videoId);
  if (qualityCache.has(videoId)) return;
  activeProbes++;
  resolveQuality(videoId, onScreen).then(
    (rank) => onProbeDone(videoId, rank, generation),
    () => onProbeDone(videoId, null, generation)
  );
}

function runProbeRound() {
  probePump = null;
  if (!enabled || document.hidden) return;

  // The idle callback can land after a key press that arrived in between.
  const paused = navPauseLeft();
  if (paused > 0) {
    // Replace the idle timer, not defer to it: the queue is meant to resume as soon as the remote is quiet, not when the surface settles.
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = setTimeout(drainProbes, paused);
    return;
  }

  const limit = MAX_CONCURRENT_PROBES - activeProbes;
  if (limit <= 0) return;

  // Document order is a decent visibility proxy at first paint and a poor one afterwards: scroll far enough and on-screen tiles sit behind hundreds of earlier entries - minutes of waiting, at three concurrent probes, for a correction the user is looking at right now.
  const rendered =
    probeQueue.size >= VISIBILITY_SORT_MIN_QUEUE ? sampleRenderedIds() : null;
  const generation = probeGeneration;
  const ids = pickProbeIds(rendered, limit);
  let heldByIdle = false;
  for (let i = 0; i < ids.length; i++) {
    const onScreen = rendered ? rendered.has(ids[i]) : false;
    if (!admitToTier(ids[i], onScreen)) {
      heldByIdle = true;
      continue;
    }
    startProbe(ids[i], onScreen, generation);
  }

  // Whatever the gate held back gets picked up once the surface goes quiet: for the idle gate that is the rest of its delay, not a whole new one.
  if (probeQueue.size > 0 && !probeTimer) {
    const delay = heldByIdle
      ? Math.max(50, PROBE_IDLE_DELAY - (now() - lastParseAt))
      : PROBE_IDLE_DELAY;
    probeTimer = setTimeout(drainProbes, delay);
  }
}

function drainProbes() {
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
  if (!enabled || probePump || probeQueue.size === 0) return;

  // Mid-navigation: not even the on-screen tier - an <img> probe competes with the row animation for decode time, and its result queues a promotion on top.
  const paused = navPauseLeft();
  if (paused > 0) {
    probeTimer = setTimeout(drainProbes, paused);
    return;
  }
  probePump = idle(runProbeRound);
}

function onNavKey(e) {
  if (NAV_KEY_CODES[e.keyCode]) lastNavAt = now();
}

function navPauseLeft() {
  const left = NAV_PAUSE_MS - (now() - lastNavAt);
  return left > 0 ? left : 0;
}

// Live promotion: only runs when verification disagrees with what was already emitted, which after the first session is rare. Batched into one sweep so N corrections cost one querySelectorAll, not N.

function runPromotionSweep() {
  promoteTimer = null;
  if (!enabled || pendingPromotions.size === 0) return;
  if (document.hidden) {
    pendingPromotions.clear();
    return;
  }

  // Mid-navigation: a promotion decodes a bigger image and re-rasterises the tile while the rows are moving; nothing is lost, the pending map keeps the corrections.
  const paused = navPauseLeft();
  if (paused > 0) {
    promoteTimer = setTimeout(runPromotionSweep, paused);
    return;
  }

  let nodes;
  try {
    nodes = document.querySelectorAll(DOM_SELECTOR);
  } catch {
    pendingPromotions.clear();
    return;
  }

  const applied = new Set();
  let patched = 0;
  for (let i = 0; i < nodes.length; i++) {
    const element = nodes[i];
    const background = element.style && element.style.backgroundImage;
    if (!background) continue;

    const match = THUMB_IN_CSS_RE.exec(background);
    if (!match) continue;

    const rank = pendingPromotions.get(match[1]);
    if (rank === undefined) continue;

    const next = buildUrl(match[1], QUALITY_NAMES[rank], rank === FLOOR_RANK);
    if (background.indexOf(next) !== -1) continue;

    // Layered, not replaced: the current image stays visible underneath until the new one has decoded, so a promotion never flashes an empty tile.
    element.style.backgroundImage = 'url("' + next + '"), ' + background;
    applied.add(match[1]);
    patched++;
  }

  // A correction is NOT discarded just because this sweep found no home for it: the list is virtualised, so a probe's tile is often not in the DOM yet. Entries survive a few rounds then expire, bounding the map.
  pendingPromotions.forEach((rank, videoId) => {
    const attempts = (promotionAttempts.get(videoId) || 0) + 1;
    if (attempts >= PROMOTION_MAX_ATTEMPTS || applied.has(videoId)) {
      pendingPromotions.delete(videoId);
      promotionAttempts.delete(videoId);
    } else {
      promotionAttempts.set(videoId, attempts);
    }
  });
  if (pendingPromotions.size > 0 && !promoteTimer) {
    promoteTimer = setTimeout(runPromotionSweep, PROMOTION_RETRY_DELAY);
  }
  if (DEBUG && patched) debugLog(`promotion sweep patched ${patched} tiles`);
}

function handleVisibilityChange() {
  if (document.hidden) {
    // webOS does not reliably fire pagehide when the app is closed from the launcher, so backgrounding is the last dependable moment to persist.
    flushCache();
  } else {
    deferProbes();
  }
}

function flushCache() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveCache();
  }
}

/** Stops everything queued; `keepCache` false drops the pending save instead of writing it. */
export function cleanup(keepCache = true) {
  probeQueue.clear();
  visibleSample = null;
  visibleBudget = 0;
  pendingEntries.clear();
  provenFloor.clear();
  promotionAttempts.clear();
  queuedByParse.length = 0;
  latestParse.clear();
  urgentLeft = 0;
  probeAttempted.clear();
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
  pendingPromotions.clear();
  if (promoteTimer) {
    clearTimeout(promoteTimer);
    promoteTimer = null;
  }
  if (keepCache) {
    flushCache();
  } else if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  // In-flight probes are left to settle on their own; their results are still worth caching.
}

if (enabled) loadCache();
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pagehide', flushCache);
// Unconditional and passive: one property read per key press; registering it only while enabled would need matching teardown for no measurable gain.
document.addEventListener('keydown', onNavKey, {
  capture: true,
  passive: true
});

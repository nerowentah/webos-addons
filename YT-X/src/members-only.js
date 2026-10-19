/* eslint no-redeclare: 0 */
import { configRead } from './config';

/**
 * Remove members-only videos at the JSON layer. Unit of removal is the whole
 * named rack except a bare grid, whose public videos survive; markers match the
 * VALUE 'MEMBERS_ONLY' (style/badgeStyle), not the unstable wrapper key.
 */

/** Depth cap: a badge sits ~8 hops from its list, the rack pass deeper still; 16 only needs to bound the walk. */
const MAX_MARKER_DEPTH = 16;
const MAX_SCRUB_DEPTH = 16;

/** Never descended: playerResponse matches the marker but holds no tile, and both keys are pure traversal cost. */
const SKIP_KEYS = new Set(['playerResponse', 'responseContext']);

/** Fallback heading match, narrow on purpose: looser matching false-positives on fundraiser/commerce posts. */
const SECTION_TITLE_RE = /\bmembers?[-\s]?only\b/i;
const SECTION_SUBTITLE_RE = /videos available to members/i;

/** Renderers that own a heading: an emptied one must go too, or a bare title row is left behind. */
const SHELF_KEYS = new Set([
  'shelfRenderer',
  'itemSectionRenderer',
  'gridRenderer',
  'horizontalListRenderer'
]);

/** Racks removed whole on any members-only video; gridRenderer is absent on purpose, since a grid can be a channel's whole catalogue. */
const RACK_KEYS = new Set(['shelfRenderer', 'horizontalListRenderer']);

function isRack(item) {
  if (item === null || typeof item !== 'object') return false;
  for (const key of Object.keys(item)) {
    if (RACK_KEYS.has(key)) return true;
  }
  return false;
}

const TILE_KEY_RE = /(?:Renderer|ViewModel)$/;

const origParse = JSON.parse;

let hitCount = 0;

/** Lists this filter emptied, so a shelf is deleted only when we emptied it — never one YouTube served empty. */
let emptiedLists = new Set();

JSON.parse = function () {
  const r = origParse.apply(this, arguments);

  if (!configRead('removeMembersOnly')) {
    return r;
  }

  if (r !== null && typeof r === 'object') {
    emptiedLists = new Set();
    for (const key of scrubMembersOnly(r, 0)) logHit(key);
  }

  return r;
};

function logHit(key) {
  hitCount += 1;
  if (hitCount <= 25) {
    console.info(`[members-only] removed ${key}`);
  } else if (hitCount === 26) {
    console.info('[members-only] further removals suppressed');
  }
}

function hasMembersOnlyMarker(node, depth) {
  if (node === null || typeof node !== 'object') return false;
  if (depth > MAX_MARKER_DEPTH) return false;

  if (hasMarkerValue(node)) return true;

  if (Array.isArray(node)) {
    for (const item of node) {
      if (hasMembersOnlyMarker(item, depth + 1)) return true;
    }
    return false;
  }

  for (const key in node) {
    if (SKIP_KEYS.has(key)) continue;
    if (hasMembersOnlyMarker(node[key], depth + 1)) return true;
  }

  return false;
}

function hasMarkerValue(node) {
  for (const key of ['style', 'badgeStyle']) {
    const value = node[key];
    if (typeof value === 'string' && value.includes('MEMBERS_ONLY')) {
      return true;
    }
  }
  return false;
}

/** Members-only by its own heading alone: a deep text search would match a tile inside the section and take unrelated content with it. */
function isMembersOnlySection(renderer) {
  const title = readText(renderer.title);
  if (title !== '' && SECTION_TITLE_RE.test(title)) return true;

  const subtitle = readText(renderer.subtitle);
  return subtitle !== '' && SECTION_SUBTITLE_RE.test(subtitle);
}

function readText(text) {
  if (text === null || typeof text !== 'object') return '';
  if (typeof text.simpleText === 'string') return text.simpleText;
  if (!Array.isArray(text.runs)) return '';
  return text.runs.map((run) => run?.text ?? '').join('');
}

/**
 * Drops members-only items at any depth, plus emptied shelves; recursion is
 * post-order (not adblock.js's stack) so the emptied check runs after scrubbing.
 */
function scrubMembersOnly(node, depth) {
  if (node === null || typeof node !== 'object') return [];
  if (depth > MAX_SCRUB_DEPTH) return [];

  if (Array.isArray(node)) {
    return filterList(node, depth);
  }

  const removed = [];

  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;

    const value = node[key];
    if (value === null || typeof value !== 'object') continue;

    if (SHELF_KEYS.has(key) && isMembersOnlySection(value)) {
      delete node[key];
      removed.push(key);
      continue;
    }

    if (RACK_KEYS.has(key) && hasMembersOnlyMarker(value, 0)) {
      delete node[key];
      removed.push(key);
      continue;
    }

    for (const removedKey of scrubMembersOnly(value, depth + 1)) {
      removed.push(removedKey);
    }

    // Checked after the descent, so a child shelf just deleted counts as gone.
    if (SHELF_KEYS.has(key) && isStrandedShelf(value)) {
      delete node[key];
      removed.push(key);
    }
  }

  return removed;
}

/**
 * A heading-owning block, not a tile: descending rather than deleting is what
 * keeps a mixed shelf intact; the key match must stay exact, not a suffix test.
 */
function isListContainer(item) {
  if (item === null || typeof item !== 'object') return false;
  for (const key of Object.keys(item)) {
    if (SHELF_KEYS.has(key)) return true;
  }
  return false;
}

function filterList(list, depth) {
  const removed = [];

  // Reverse order so splice does not shift the indices still to be walked.
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];

    if (isListContainer(item)) {
      if (isRack(item) && hasMembersOnlyMarker(item, 0)) {
        removed.push(describeItem(item));
        list.splice(i, 1);
        continue;
      }

      for (const key of scrubMembersOnly(item, depth + 1)) removed.push(key);
      if (Object.keys(item).length === 0) list.splice(i, 1);
      continue;
    }

    if (!hasMembersOnlyMarker(item, 0)) continue;
    removed.push(describeItem(item));
    list.splice(i, 1);
  }

  if (removed.length > 0 && list.length === 0) {
    emptiedLists.add(list);
  }

  return removed;
}

/** True only when every list under it was emptied by us — never a shelf YouTube served empty or holding tiles we do not touch. */
function isStrandedShelf(renderer) {
  let sawEmptiedList = false;
  let hasSurvivor = false;

  const walk = (node, depth) => {
    if (hasSurvivor) return;
    if (node === null || typeof node !== 'object') return;
    if (depth > MAX_SCRUB_DEPTH) return;

    if (Array.isArray(node)) {
      if (emptiedLists.has(node)) {
        sawEmptiedList = true;
      } else if (node.length > 0) {
        hasSurvivor = true;
      }
      return;
    }

    for (const key in node) {
      if (SKIP_KEYS.has(key)) continue;
      walk(node[key], depth + 1);
    }
  };

  walk(renderer, 0);

  return sawEmptiedList && !hasSurvivor;
}

function describeItem(item) {
  if (item === null || typeof item !== 'object') return 'item';

  for (const key of Object.keys(item)) {
    if (TILE_KEY_RE.test(key)) return key;
  }

  return 'item';
}

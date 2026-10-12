/* eslint no-redeclare: 0 */
import { configRead } from './config';

/**
 * Remove members-only videos from the rendered feeds.
 *
 * A members-only video is a dead end for anyone who is not a member of the
 * channel - it shows a thumbnail and a title, then refuses to play - so it is
 * filtered out of the payload rather than merely hidden in the DOM. That also
 * avoids the layout jump a CSS rule leaves behind when a row reflows.
 *
 * ## Whole-section removal
 *
 * The unit removed is the section, not the tile. A named rack - the shape a
 * channel's "Members only" row arrives in, with the "videos available to
 * members of this channel" subtitle - is dropped entire as soon as any video
 * inside it carries the badge: heading and public videos together. Removing
 * only the badged tiles would leave a half-empty row with a gap, which is the
 * outcome this is written to avoid. RACK_KEYS below names those racks.
 *
 * The one exception is a bare grid: a channel's or playlist's whole catalogue
 * can be a single gridRenderer, and one members-only entry there must not
 * erase the public videos beside it. Those keep per-tile removal.
 *
 * ## Why the marker test is value-based
 *
 * The badge arrives under two different shapes depending on which renderer
 * carries it:
 *
 *   - the classic tile:  metadataBadgeRenderer.style == BADGE_STYLE_TYPE_MEMBERS_ONLY
 *   - the current lockup: badgeViewModel.badgeStyle  == BADGE_MEMBERS_ONLY
 *
 * so the wrapper key is not stable, and matching on its name means chasing
 * renames - yt-dlp hit exactly this and moved to a suffix match on
 * 'badgeRenderer', which still misses badgeViewModel. Both the two enum values
 * and the two wrapper names are covered by testing the *value* for the
 * substring 'MEMBERS_ONLY' instead, with no filter on the key at all.
 *
 * This is safe by construction rather than by exclusion: no other 'style' field
 * in a browse payload contains that substring. BADGE_STYLE_TYPE_VERIFIED,
 * BADGE_STYLE_TYPE_LIVE_NOW, VIDEO_STYLE_TYPE_NORMAL and friends all miss it.
 *
 * This also covers "members first" (early access), which YouTube badges with the
 * same enum value. That is deliberate. Whether YouTube ever distinguishes the
 * two at the badge level does not matter here, because anything carrying the
 * marker is dropped either way.
 *
 * The DOM layer, by contrast, is not a stable place to look: the
 * 'badge-style-type-members-only' and 'yt-badge-shape--membership' class names
 * both stopped matching on channel pages within weeks of each other, and the
 * replacement selector is an SVG path prefix plus an aria-label - DOM
 * implementation details. The JSON enum has been stable far longer, which is
 * why this module does its work here and nowhere else.
 */

/**
 * Depth limits, borrowed from the implementations that already do this at the
 * fetch layer, then widened: those walk desktop-web payloads, where a tile's
 * badge sits a few levels below the tile. This app talks to the Leanback API,
 * where the same badge is further out. Counted from the list element that
 * filterList hands to the scan, the worst realistic case is
 *
 *   shelfRenderer -> content -> horizontalListRenderer -> items
 *     -> richItemRenderer -> videoRenderer -> badges
 *     -> metadataBadgeRenderer -> style
 *
 * which is 8 hops before the value is even read - one more than the reference
 * cap of 6, which is why the tighter values matched only the shallow lockup
 * shape and silently missed every TV shelf.
 *
 * 16 rather than 12 because the whole-rack pass below (see RACK_KEYS) tests a
 * shelf from the rack rather than from the tile, which is four hops higher
 * up - shelfRenderer -> content -> horizontalListRenderer -> items. The cap
 * still bounds the walk on a half-megabyte home-page response in a webview
 * rather than being exact, and the value-based match cannot false-positive.
 */
const MAX_MARKER_DEPTH = 16;
const MAX_SCRUB_DEPTH = 16;

/**
 * Subtrees that can never contain a removable tile.
 *
 * playerResponse is where the members-only playability error lives (offerId
 * 'sponsors_only_video'), so it does match the marker - but there is no tile
 * down there to remove, and descending into a player response is the most
 * expensive part of the walk. Skipping it is cheaper and keeps the match from
 * having an effect it was not meant to have.
 */
const SKIP_KEYS = new Set(['playerResponse', 'responseContext']);

/**
 * Members-only sections announce themselves in their own heading rather than
 * through a badge - "Members only", or the subtitle "videos available to
 * members". This is a fallback for the emptied-shelf case below, not the
 * primary mechanism. Kept deliberately narrow: looser matching is a documented
 * false-positive source, since the membership-adjacent badges on fundraiser and
 * commerce posts read similarly.
 */
const SECTION_TITLE_RE = /\bmembers?[-\s]?only\b/i;
const SECTION_SUBTITLE_RE = /videos available to members/i;

/**
 * Renderers that own a heading, so an emptied one has to go too. Removing only
 * the tiles leaves a blank row under a title, which is the problem
 * AD_LIST_OWNERS solves in adblock.js.
 */
const SHELF_KEYS = new Set([
  'shelfRenderer',
  'itemSectionRenderer',
  'gridRenderer',
  'horizontalListRenderer'
]);

/**
 * Racks that are removed whole the moment they carry a members-only video.
 *
 * "Section" means a named rail or shelf - the shape a channel's "Members only"
 * row arrives in (a shelfRenderer, or a bare horizontalListRenderer). When
 * such a rack holds even one members-only video the entire rack goes: its
 * heading and its public videos alike. This is stricter than hiding the
 * members-only tiles, which would leave a half-empty row with a gap.
 *
 * gridRenderer is deliberately absent. A grid can be a channel's or a
 * playlist's entire catalogue, where one members-only entry must not erase
 * every public video beside it; those keep per-tile removal and only lose
 * their heading when this filter is what emptied them.
 */
const RACK_KEYS = new Set(['shelfRenderer', 'horizontalListRenderer']);

/** True if this element is one of the whole-removable racks named above. */
function isRack(item) {
  if (item === null || typeof item !== 'object') return false;
  for (const key of Object.keys(item)) {
    if (RACK_KEYS.has(key)) return true;
  }
  return false;
}

/** Any renderer or view model can hold tiles; this names one for the log. */
const TILE_KEY_RE = /(?:Renderer|ViewModel)$/;

const origParse = JSON.parse;

let hitCount = 0;

/**
 * Lists emptied by the current response, tracked so a shelf is only deleted when
 * *this* filter is what emptied it - never because YouTube served it empty, or
 * because a surface we did not filter happened to have no items.
 *
 * Reassigned per parse rather than cleared: a Set cannot be emptied in place
 * without retaining the arrays, and the arrays are about to become garbage.
 */
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

/** Log once, not once per tile, so a full home page cannot flood the console. */
function logHit(key) {
  hitCount += 1;
  if (hitCount <= 25) {
    console.info(`[members-only] removed ${key}`);
  } else if (hitCount === 26) {
    console.info('[members-only] further removals suppressed');
  }
}

/**
 * True if this object, or anything under it, carries a members-only badge.
 *
 * Stops descending on a match, so a tile is detected from its badge rather than
 * the badge from its tile - the distinction that decides whether the tile or
 * just its label disappears.
 */
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

/** The whole detection: does this object hold a members-only style value? */
function hasMarkerValue(node) {
  for (const key of ['style', 'badgeStyle']) {
    const value = node[key];
    if (typeof value === 'string' && value.includes('MEMBERS_ONLY')) {
      return true;
    }
  }
  return false;
}

/**
 * True if this renderer is a members-only section by its own heading.
 *
 * Shallow on purpose - title and subtitle only. A deep text search would match
 * on a tile sitting inside the section and take unrelated content with it.
 */
function isMembersOnlySection(renderer) {
  const title = readText(renderer.title);
  if (title !== '' && SECTION_TITLE_RE.test(title)) return true;

  const subtitle = readText(renderer.subtitle);
  return subtitle !== '' && SECTION_SUBTITLE_RE.test(subtitle);
}

/**
 * Flatten a YouTube text object to a string. `simpleText` covers headings;
 * `runs` covers the variants that split their text up.
 */
function readText(text) {
  if (text === null || typeof text !== 'object') return '';
  if (typeof text.simpleText === 'string') return text.simpleText;
  if (!Array.isArray(text.runs)) return '';
  return text.runs.map((run) => run?.text ?? '').join('');
}

/**
 * Walk a response body and drop every members-only item at any depth, plus the
 * shelves and sections that turn out to be members-only outright or are left
 * empty by the removals.
 *
 * Recursion rather than an explicit stack as in adblock.js: depth is bounded by
 * MAX_SCRUB_DEPTH, and the emptied-shelf check has to run *after* a subtree has
 * been scrubbed, which post-order traversal expresses directly.
 *
 * Returns the names removed, for the log line.
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

    // A section that says so takes its public content with it, so this is
    // tested before descending rather than being left to the emptiness rule.
    if (SHELF_KEYS.has(key) && isMembersOnlySection(value)) {
      delete node[key];
      removed.push(key);
      continue;
    }

    // A rack holding any members-only video goes whole, heading included, even
    // when it also holds public videos - the "remove the entire section"
    // behaviour. Covers racks that sit as a direct property rather than inside
    // a list; the array case is handled by filterList below.
    if (RACK_KEYS.has(key) && hasMembersOnlyMarker(value, 0)) {
      delete node[key];
      removed.push(key);
      continue;
    }

    for (const removedKey of scrubMembersOnly(value, depth + 1)) {
      removed.push(removedKey);
    }

    // Checked after the descent so a child shelf that was just deleted counts
    // as gone, rather than stranding the heading above it.
    if (SHELF_KEYS.has(key) && isStrandedShelf(value)) {
      delete node[key];
      removed.push(key);
    }
  }

  return removed;
}

/**
 * True if this list element is a block that owns its own heading and tile list -
 * a shelf, section or grid - rather than a tile.
 *
 * This distinction is what keeps a mixed shelf intact. Testing the element's
 * marker alone cannot tell the two apart: a shelf wrapping one members-only
 * video among ten public ones matches, and removing it would take the ten
 * public videos with it. So an element carrying a SHELF_KEY is descended into
 * instead of deleted, and only leaf tiles are eligible for removal.
 *
 * The match is exact on the element's own keys, which is what separates
 * 'shelfRenderer' (a container) from 'gridVideoRenderer' and 'videoRenderer'
 * (tiles) - a suffix test would group all three together.
 */
function isListContainer(item) {
  if (item === null || typeof item !== 'object') return false;
  for (const key of Object.keys(item)) {
    if (SHELF_KEYS.has(key)) return true;
  }
  return false;
}

/**
 * Drop the members-only elements of a tile list, recording it as emptied when
 * the filter is what emptied it.
 */
function filterList(list, depth) {
  const removed = [];

  // Reverse order so splice does not shift the indices still to be walked.
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];

    if (isListContainer(item)) {
      // Whole-section removal: a rack carrying any members-only video is
      // dropped entire, so a named row cannot survive as a gap or a lone
      // surviving tile. Checked before descending so the emptied-list and
      // stranded-heading machinery stays out of the picture for this case.
      if (isRack(item) && hasMembersOnlyMarker(item, 0)) {
        removed.push(describeItem(item));
        list.splice(i, 1);
        continue;
      }

      for (const key of scrubMembersOnly(item, depth + 1)) removed.push(key);
      // A container whose only renderer was just deleted is now an empty
      // wrapper; leaving it in the list renders as a blank section.
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

/**
 * True if this renderer held tiles, this filter emptied every list under it,
 * and nothing else is left to show.
 *
 * The "every list we emptied" condition is what makes this safe. A shelf
 * YouTube itself served empty, or one holding tiles this filter does not touch,
 * keeps its renderer.
 */
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

/** Name the removed tile for the log, so the line is actionable. */
function describeItem(item) {
  if (item === null || typeof item !== 'object') return 'item';

  for (const key of Object.keys(item)) {
    if (TILE_KEY_RE.test(key)) return key;
  }

  return 'item';
}

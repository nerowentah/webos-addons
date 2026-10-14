// Rows loaded ahead. The app asks for the next rows of a vertical list (the
// home feed, a browse tab, search results) once fewer rows than a threshold are
// left below the focused one: the response's own
// nextContinuationData.autoloadThresholdItemsFromEnd when above 0, else the
// section_list_continuation_threshold flag, else 3. YouTube sends the flag as 1,
// so the next rows are asked for only on the last row, and a quick run down the
// home screen reaches rows that have not arrived. The response's value outranks
// the flag, so the parse hook (adblock.js) raises it on every section list a
// response carries. A list filled on visibility (autoloadEnabled with
// autoloadOnVisible) does not read the threshold, and a reloadContinuationData
// is left as sent.

/** Rows left below the focused one when the app asks for the next ones. */
export const ROWS_AHEAD = 4;

// The section lists themselves (their `continuations` sit beside `contents`),
// per response type as detectRowsAheadType() detects it.
const SECTION_LISTS = {
  HOME_BROWSE: [
    [
      'contents',
      'tvBrowseRenderer',
      'content',
      'tvSurfaceContentRenderer',
      'content',
      'sectionListRenderer'
    ]
  ],
  SEARCH: [['contents', 'sectionListRenderer']],
  CONTINUATION: [
    ['continuationContents', 'sectionListContinuation'],
    [
      'continuationContents',
      'tvSurfaceContentContinuation',
      'content',
      'sectionListRenderer'
    ]
  ]
};
const BROWSE_TABS_NAV = [
  'contents',
  'tvBrowseRenderer',
  'content',
  'tvSecondaryNavRenderer'
];

/**
 * The response types this module acts on. Only the shapes whose top-level
 * layout carries section lists are named; every other response returns null and
 * is left alone. The order matters: the browse and search shapes overlap on
 * `contents`, so the browse tabs and home browse (which both divert through
 * tvBrowseRenderer) are tested before the bare SEARCH shape, which excludes
 * tvBrowseRenderer for the same reason.
 */
const TYPE_SIGNATURES = [
  {
    type: 'HOME_BROWSE',
    path: [
      'contents',
      'tvBrowseRenderer',
      'content',
      'tvSurfaceContentRenderer'
    ]
  },
  {
    type: 'BROWSE_TABS',
    path: ['contents', 'tvBrowseRenderer', 'content', 'tvSecondaryNavRenderer']
  },
  {
    type: 'SEARCH',
    path: ['contents', 'sectionListRenderer'],
    exclude: ['contents', 'tvBrowseRenderer']
  },
  { type: 'CONTINUATION', path: ['continuationContents'] }
];

function getByPath(obj, parts) {
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

/** The response type of `data`, or null when it is not one this module serves. */
export function detectRowsAheadType(data) {
  if (data === null || typeof data !== 'object') return null;
  for (let i = 0; i < TYPE_SIGNATURES.length; i++) {
    const sig = TYPE_SIGNATURES[i];
    if (sig.exclude && getByPath(data, sig.exclude) !== undefined) continue;
    if (getByPath(data, sig.path) !== undefined) return sig.type;
  }
  return null;
}

function raiseList(list) {
  const continuations = list && list.continuations;
  if (!Array.isArray(continuations)) return;
  for (let i = 0; i < continuations.length; i++) {
    const next = continuations[i] && continuations[i].nextContinuationData;
    if (!next) continue;
    // `>=` is false for undefined, so a missing value is raised as well.
    if (!(next.autoloadThresholdItemsFromEnd >= ROWS_AHEAD))
      next.autoloadThresholdItemsFromEnd = ROWS_AHEAD;
  }
}

/** Each tab of every section of a browse-tabs response, in either content shape. */
function raiseTabs(sections) {
  if (!Array.isArray(sections)) return;
  for (let i = 0; i < sections.length; i++) {
    const tabs = sections[i]?.tvSecondaryNavSectionRenderer?.tabs;
    if (!Array.isArray(tabs)) continue;
    for (let j = 0; j < tabs.length; j++) {
      const content = tabs[j]?.tabRenderer?.content;
      if (!content) continue;
      raiseList(content.sectionListRenderer);
      raiseList(content.tvSurfaceContentRenderer?.content?.sectionListRenderer);
    }
  }
}

/** Raises the threshold on every section list of a response of `type`. */
export function raiseRowsAhead(data, type) {
  if (type === 'BROWSE_TABS') {
    raiseTabs(getByPath(data, BROWSE_TABS_NAV)?.sections);
    return;
  }
  const lists = SECTION_LISTS[type];
  if (!lists) return;
  for (let i = 0; i < lists.length; i++) raiseList(getByPath(data, lists[i]));
}

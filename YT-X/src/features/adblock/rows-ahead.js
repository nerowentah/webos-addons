// The app asks for the next rows once fewer than the threshold remain below the
// focused one: the response's autoloadThresholdItemsFromEnd (raised by adblock.js), else the flag, else 3.

/** Rows left below the focused one when the app asks for the next ones. */
const ROWS_AHEAD = 4;

// The section lists per response type, as detectRowsAheadType() detects it.
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
 * Response types this module acts on; order matters because browse and search
 * overlap on `contents` (browse/tabs first, SEARCH excludes tvBrowseRenderer).
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

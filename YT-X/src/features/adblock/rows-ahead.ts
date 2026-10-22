// The app asks for the next rows once fewer than the threshold remain below the
// focused one: the response's autoloadThresholdItemsFromEnd (raised by adblock.ts), else the flag, else 3.
import { getByPath, isArray, isContainer, isRecord } from '../../youtube/json';

export type RowsAheadType =
  'HOME_BROWSE' | 'BROWSE_TABS' | 'SEARCH' | 'CONTINUATION';

/** Rows left below the focused one when the app asks for the next ones. */
const ROWS_AHEAD = 4;

// The section lists per response type, as detectRowsAheadType() detects it.
const SECTION_LISTS: Record<
  Exclude<RowsAheadType, 'BROWSE_TABS'>,
  readonly (readonly string[])[]
> = {
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

interface TypeSignature {
  type: RowsAheadType;
  path: readonly string[];
  exclude?: readonly string[];
}

/**
 * Response types this module acts on; order matters because browse and search
 * overlap on `contents` (browse/tabs first, SEARCH excludes tvBrowseRenderer).
 */
const TYPE_SIGNATURES: readonly TypeSignature[] = [
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

/** The response type of `data`, or null when it is not one this module serves. */
export function detectRowsAheadType(data: unknown): RowsAheadType | null {
  if (!isContainer(data)) return null;
  for (const sig of TYPE_SIGNATURES) {
    if (sig.exclude && getByPath(data, sig.exclude) !== undefined) continue;
    if (getByPath(data, sig.path) !== undefined) return sig.type;
  }
  return null;
}

function raiseList(list: unknown): void {
  const continuations = getByPath(list, ['continuations']);
  if (!isArray(continuations)) return;
  for (const continuation of continuations) {
    const next = getByPath(continuation, ['nextContinuationData']);
    if (!isRecord(next)) continue;
    const threshold = next['autoloadThresholdItemsFromEnd'];
    // A missing or non-numeric value is raised as well.
    if (typeof threshold !== 'number' || threshold < ROWS_AHEAD)
      next['autoloadThresholdItemsFromEnd'] = ROWS_AHEAD;
  }
}

/** Each tab of every section of a browse-tabs response, in either content shape. */
function raiseTabs(sections: unknown): void {
  if (!isArray(sections)) return;
  for (const section of sections) {
    const tabs = getByPath(section, ['tvSecondaryNavSectionRenderer', 'tabs']);
    if (!isArray(tabs)) continue;
    for (const tab of tabs) {
      const content = getByPath(tab, ['tabRenderer', 'content']);
      if (!content) continue;
      raiseList(getByPath(content, ['sectionListRenderer']));
      raiseList(
        getByPath(content, [
          'tvSurfaceContentRenderer',
          'content',
          'sectionListRenderer'
        ])
      );
    }
  }
}

/** Raises the threshold on every section list of a response of `type`. */
export function raiseRowsAhead(data: unknown, type: RowsAheadType): void {
  if (type === 'BROWSE_TABS') {
    raiseTabs(getByPath(data, [...BROWSE_TABS_NAV, 'sections']));
    return;
  }
  for (const path of SECTION_LISTS[type]) raiseList(getByPath(data, path));
}

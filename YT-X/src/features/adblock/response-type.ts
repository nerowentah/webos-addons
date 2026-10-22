import {
  getByPath,
  isArray,
  isRecord,
  type JsonObject
} from '../../youtube/json';

export type ResponseType =
  | 'SHORTS_SEQUENCE'
  | 'PLAYER'
  | 'NEXT'
  | 'HOME_BROWSE'
  | 'BROWSE_TABS'
  | 'SEARCH'
  | 'CONTINUATION'
  | 'ACTION';

interface ResponseTypeSignature {
  type: ResponseType;
  detectionPath: readonly string[];
  excludePath?: readonly string[];
  matchFn?: (data: JsonObject) => boolean;
}

/**
 * Response-shape signatures, tested in order. Keep in sync with the thumbnail rewriter (thumbnail-quality.ts); a null result falls back to a bounded scan (correct but more expensive). More specific shapes come first, and SEARCH is excluded from a browse envelope.
 */
const RESPONSE_TYPE_SIGNATURES: readonly ResponseTypeSignature[] = [
  {
    type: 'SHORTS_SEQUENCE',
    detectionPath: ['entries'],
    matchFn: (data) => isArray(data['entries'])
  },
  { type: 'PLAYER', detectionPath: ['streamingData'] },
  { type: 'NEXT', detectionPath: ['contents', 'singleColumnWatchNextResults'] },
  {
    type: 'HOME_BROWSE',
    detectionPath: [
      'contents',
      'tvBrowseRenderer',
      'content',
      'tvSurfaceContentRenderer'
    ]
  },
  {
    type: 'BROWSE_TABS',
    detectionPath: [
      'contents',
      'tvBrowseRenderer',
      'content',
      'tvSecondaryNavRenderer'
    ]
  },
  {
    type: 'SEARCH',
    detectionPath: ['contents', 'sectionListRenderer'],
    excludePath: ['contents', 'tvBrowseRenderer']
  },
  { type: 'CONTINUATION', detectionPath: ['continuationContents'] },
  { type: 'ACTION', detectionPath: ['onResponseReceivedActions'] },
  { type: 'ACTION', detectionPath: ['onResponseReceivedEndpoints'] }
];

/** The shape of a parsed response, or null when it matches none. */
export function detectResponseType(data: unknown): ResponseType | null {
  if (!isRecord(data)) return null;
  for (const sig of RESPONSE_TYPE_SIGNATURES) {
    if (sig.excludePath && getByPath(data, sig.excludePath) !== undefined) {
      continue;
    }
    if (getByPath(data, sig.detectionPath) !== undefined) {
      if (sig.matchFn && !sig.matchFn(data)) continue;
      return sig.type;
    }
  }
  return null;
}

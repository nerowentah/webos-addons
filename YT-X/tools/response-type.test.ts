// Tests for the response-shape detection in src/features/adblock/response-type.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from './load-src.ts';

interface ResponseTypeModule {
  detectResponseType(data: unknown): string | null;
}

const { detectResponseType } = await loadSrc<ResponseTypeModule>(
  'features/adblock/response-type.ts'
);

test('detectResponseType recognises each signature', () => {
  const cases: [unknown, string][] = [
    [{ entries: [] }, 'SHORTS_SEQUENCE'],
    [{ streamingData: {} }, 'PLAYER'],
    [{ contents: { singleColumnWatchNextResults: {} } }, 'NEXT'],
    [
      {
        contents: {
          tvBrowseRenderer: { content: { tvSurfaceContentRenderer: {} } }
        }
      },
      'HOME_BROWSE'
    ],
    [
      {
        contents: {
          tvBrowseRenderer: { content: { tvSecondaryNavRenderer: {} } }
        }
      },
      'BROWSE_TABS'
    ],
    [{ contents: { sectionListRenderer: {} } }, 'SEARCH'],
    [{ continuationContents: {} }, 'CONTINUATION'],
    [{ onResponseReceivedActions: [] }, 'ACTION'],
    [{ onResponseReceivedEndpoints: [] }, 'ACTION']
  ];
  for (const [data, expected] of cases) {
    assert.equal(detectResponseType(data), expected);
  }
});

test('SHORTS_SEQUENCE requires entries to be an array', () => {
  assert.equal(detectResponseType({ entries: {} }), null);
  assert.equal(detectResponseType({ entries: 'x' }), null);
});

test('SEARCH is excluded from a browse envelope', () => {
  assert.equal(
    detectResponseType({
      contents: { tvBrowseRenderer: {}, sectionListRenderer: {} }
    }),
    null
  );
});

test('earlier signatures win over later ones', () => {
  assert.equal(
    detectResponseType({ streamingData: {}, continuationContents: {} }),
    'PLAYER'
  );
});

test('non-objects and unknown shapes give null', () => {
  assert.equal(detectResponseType(null), null);
  assert.equal(detectResponseType([]), null);
  assert.equal(detectResponseType('x'), null);
  assert.equal(detectResponseType({ other: 1 }), null);
});

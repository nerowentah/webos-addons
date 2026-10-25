import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSrc } from '../lib/load-src.ts';

interface A11y {
  PAGE_IDS: readonly string[];
  cycleValueAttrs(
    index: number,
    count: number,
    text: string
  ): Record<string, string>;
  nextSectionHeadingId(): string;
  pageAttrs(index: number): Record<string, string>;
  tabAttrs(index: number, selected: boolean): Record<string, string>;
}

const a11y = await loadSrc<A11y>('ui/a11y.ts');
const { PAGE_IDS, cycleValueAttrs, nextSectionHeadingId, pageAttrs, tabAttrs } =
  a11y;

test('tabs reference their page and exactly mirror the selected state', () => {
  assert.deepEqual(tabAttrs(1, true), {
    role: 'tab',
    id: 'ytx-tab-1',
    'aria-controls': 'ytx-page-ui-tweaks',
    'aria-selected': 'true'
  });
  assert.equal(tabAttrs(0, false)['aria-selected'], 'false');
  assert.equal(PAGE_IDS.length, 5);
});

test('pages are labelled by their tab', () => {
  assert.deepEqual(pageAttrs(3), {
    role: 'tabpanel',
    'aria-labelledby': 'ytx-tab-3'
  });
});

test('section heading ids are unique', () => {
  const ids = new Set([1, 2, 3].map(() => nextSectionHeadingId()));
  assert.equal(ids.size, 3);
});

test('cycle value attributes pair the index with the visible text', () => {
  assert.deepEqual(cycleValueAttrs(2, 6, 'HEVC (H.265)'), {
    'aria-valuemin': '0',
    'aria-valuemax': '5',
    'aria-valuenow': '2',
    'aria-valuetext': 'HEVC (H.265)'
  });
  assert.equal(cycleValueAttrs(-1, 0, 'x')['aria-valuenow'], '0');
});

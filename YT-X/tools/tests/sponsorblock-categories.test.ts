// Tests for the SponsorBlock category table (src/features/sponsorblock/categories.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from '../lib/load-src.ts';

interface CategoriesModule {
  SEGMENT_CATEGORIES: readonly {
    id: string;
    color: string;
    configKey: string;
    skipName: string;
  }[];
  categoryInfo(
    category: string
  ): { color: string; configKey: string; skipName: string } | undefined;
}

const { SEGMENT_CATEGORIES, categoryInfo } = await loadSrc<CategoriesModule>(
  'features/sponsorblock/categories.ts'
);

test('category ids, colors and config keys are unique', () => {
  for (const field of ['id', 'color', 'configKey'] as const) {
    const values = SEGMENT_CATEGORIES.map((c) => c[field]);
    assert.equal(new Set(values).size, values.length, field);
  }
});

test('colors are 6-digit hex and config keys are SponsorBlock toggles', () => {
  for (const c of SEGMENT_CATEGORIES) {
    assert.match(c.color, /^#[0-9a-f]{6}$/);
    assert.match(c.configKey, /^enableSponsorBlock[A-Z]/);
  }
});

test('categoryInfo looks up by API category string', () => {
  assert.equal(categoryInfo('music_offtopic')?.skipName, 'non-music part');
  assert.equal(categoryInfo('sponsor')?.color, '#00d400');
  assert.equal(categoryInfo('nope'), undefined);
});

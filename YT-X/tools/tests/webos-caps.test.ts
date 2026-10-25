// Tests for version handling and the codec matrix in src/platform/webos-caps.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from '../lib/load-src.ts';

interface CapsModule {
  canDecodeAt(codec: string, playbackHeight: number | undefined): boolean;
  codecRefusalReason(
    codec: string,
    playbackHeight: number | undefined
  ): string | undefined;
  compareVersions(a: string, b: string): number;
  normalizeInternalVersion(raw: string | undefined): {
    version: number;
    scheme: string;
  };
  tvVersionFor(version: number): number | undefined;
}

const {
  canDecodeAt,
  codecRefusalReason,
  compareVersions,
  normalizeInternalVersion,
  tvVersionFor
} = await loadSrc<CapsModule>('platform/webos-caps.ts');

test('compareVersions orders dotted versions numerically', () => {
  assert.ok(compareVersions('10.2.0', '9.9.9') > 0);
  assert.ok(compareVersions('1.2', '1.10') < 0);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
});

test('compareVersions degrades malformed segments to 0', () => {
  assert.equal(compareVersions('1.x', '1.0'), 0);
  assert.equal(compareVersions('', '0'), 0);
});

test('tvVersionFor maps internal to TV numbering', () => {
  assert.equal(tvVersionFor(6), 6);
  assert.equal(tvVersionFor(7), 22);
  assert.equal(tvVersionFor(10), 25);
  assert.equal(tvVersionFor(99), undefined);
});

test('normalizeInternalVersion keeps internal numbers', () => {
  assert.deepEqual(normalizeInternalVersion('6.0'), {
    version: 6,
    scheme: 'internal'
  });
  assert.deepEqual(normalizeInternalVersion('10'), {
    version: 10,
    scheme: 'internal'
  });
});

test('normalizeInternalVersion converts TV numbers to internal', () => {
  assert.deepEqual(normalizeInternalVersion('22'), {
    version: 7,
    scheme: 'tv'
  });
  assert.deepEqual(normalizeInternalVersion('25.1'), {
    version: 10,
    scheme: 'tv'
  });
});

test('normalizeInternalVersion keeps unknown future TV numbers', () => {
  assert.deepEqual(normalizeInternalVersion('40'), {
    version: 40,
    scheme: 'tv'
  });
});

test('normalizeInternalVersion flags unparseable input', () => {
  for (const raw of [undefined, '', 'abc']) {
    assert.deepEqual(normalizeInternalVersion(raw), {
      version: 0,
      scheme: 'unrecognised'
    });
  }
});

test('canDecodeAt allows everything when the height is unknown', () => {
  for (const h of [undefined, 0, -1, Number.NaN, Infinity]) {
    assert.equal(canDecodeAt('av1', h), true);
  }
});

test('canDecodeAt restricts 4K to H.264 and HEVC', () => {
  assert.equal(canDecodeAt('avc', 2160), true);
  assert.equal(canDecodeAt('hevc', 2160), true);
  assert.equal(canDecodeAt('vp9', 2160), false);
  assert.equal(canDecodeAt('av1', 2160), false);
});

test('canDecodeAt allows AV1 and HEVC only at 8K', () => {
  assert.equal(canDecodeAt('av1', 4320), true);
  assert.equal(canDecodeAt('hevc', 4320), true);
  assert.equal(canDecodeAt('vp9', 4320), false);
  assert.equal(canDecodeAt('avc', 4320), false);
});

test('canDecodeAt allows every codec below 4K', () => {
  for (const codec of ['av1', 'vp9', 'avc', 'hevc'] as const) {
    assert.equal(canDecodeAt(codec, 1080), true);
  }
});

test('codecRefusalReason is undefined when decodable', () => {
  assert.equal(codecRefusalReason('avc', 2160), undefined);
  assert.equal(codecRefusalReason('av1', undefined), undefined);
});

test('codecRefusalReason explains a 4K refusal', () => {
  assert.match(codecRefusalReason('vp9', 2160) ?? '', /2160p.*VP9/);
});

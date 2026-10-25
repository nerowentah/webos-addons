// Tests for the SponsorBlock segment helpers (src/features/sponsorblock/segments.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from '../lib/load-src.ts';

interface Segment {
  category: string;
  segment: readonly [number, number];
  actionType: string | undefined;
  UUID: string | undefined;
}

interface SegmentsModule {
  MAX_SEGMENTS: number;
  TERMINAL_TOLERANCE_S: number;
  NATURAL_END_TAIL_S: number;
  backoffDelay(checks: number): number;
  segmentsSignature(segments: readonly Segment[]): string;
  toSegment(entry: unknown): Segment | null;
  segmentsFor(data: unknown, videoID: string): Segment[];
  skipTarget(end: number, duration: number, currentTime: number): number | null;
  nextHighlightStart(
    segments: readonly Segment[],
    currentTime: number
  ): number | null;
  markerFrame(
    track: { left: number; top: number; width: number; height: number },
    host: { left: number; top: number },
    duration: number,
    segment: readonly [number, number]
  ): { left: number; top: number; width: number; height: number } | null;
  pickSegment(
    segments: readonly Segment[],
    currentTime: number,
    excludedStarts: ReadonlySet<number> | null
  ): Segment | null;
}

const {
  MAX_SEGMENTS,
  TERMINAL_TOLERANCE_S,
  NATURAL_END_TAIL_S,
  backoffDelay,
  segmentsSignature,
  toSegment,
  segmentsFor,
  skipTarget,
  nextHighlightStart,
  markerFrame,
  pickSegment
} = await loadSrc<SegmentsModule>('features/sponsorblock/segments.ts');

const seg = (start: number, end: number, category = 'sponsor'): Segment => ({
  category,
  segment: [start, end],
  actionType: 'skip',
  UUID: undefined
});

test('toSegment accepts a finite 0 <= start < end entry', () => {
  const s = toSegment({
    category: 'sponsor',
    segment: [1, 2.5],
    actionType: 'mute',
    UUID: 'u1'
  });
  assert.deepEqual(s, {
    category: 'sponsor',
    segment: [1, 2.5],
    actionType: 'mute',
    UUID: 'u1'
  });
});

test('toSegment rejects malformed, negative, empty and non-finite ranges', () => {
  for (const segment of [
    [-1, 5],
    [5, 5],
    [6, 5],
    [0, Infinity],
    [NaN, 3],
    ['1', 2],
    [1]
  ]) {
    assert.equal(toSegment({ category: 'sponsor', segment }), null);
  }
  assert.equal(toSegment(null), null);
  assert.equal(toSegment({ segment: [1, 2] }), null);
});

test('segmentsFor picks the video from a hash-prefix answer and sorts', () => {
  const data = [
    { videoID: 'other', segments: [{ category: 'sponsor', segment: [0, 1] }] },
    {
      videoID: 'me',
      segments: [
        { category: 'sponsor', segment: [30, 40] },
        { category: 'intro', segment: [5, 10] },
        { category: 'sponsor', segment: [9, 3] }
      ]
    }
  ];
  assert.deepEqual(
    segmentsFor(data, 'me').map((s) => s.segment[0]),
    [5, 30]
  );
  assert.deepEqual(segmentsFor(data, 'missing'), []);
  assert.deepEqual(segmentsFor('junk', 'me'), []);
});

test('segmentsFor caps the list', () => {
  const segments = Array.from({ length: MAX_SEGMENTS + 50 }, (_, i) => ({
    category: 'sponsor',
    segment: [i, i + 0.5]
  }));
  assert.equal(
    segmentsFor({ videoID: 'v', segments }, 'v').length,
    MAX_SEGMENTS
  );
});

test('segmentsSignature ignores order and prefers UUIDs', () => {
  const a = seg(1, 2);
  const b = { ...seg(3, 4), UUID: 'x' };
  assert.equal(segmentsSignature([a, b]), segmentsSignature([b, a]));
  assert.notEqual(segmentsSignature([a]), segmentsSignature([seg(1, 3)]));
});

test('backoffDelay steps 5/10/20/30 minutes and clamps', () => {
  const min = 60 * 1000;
  assert.equal(backoffDelay(0), 5 * min);
  assert.equal(backoffDelay(1), 5 * min);
  assert.equal(backoffDelay(2), 10 * min);
  assert.equal(backoffDelay(3), 20 * min);
  assert.equal(backoffDelay(4), 30 * min);
  assert.equal(backoffDelay(99), 30 * min);
});

test('pickSegment returns the current or next segment, never one behind', () => {
  const list = [seg(10, 20), seg(30, 40)];
  assert.equal(pickSegment(list, 0, null), list[0]);
  assert.equal(pickSegment(list, 15, null), list[0]);
  assert.equal(pickSegment(list, 19.98, null), list[1]);
  assert.equal(pickSegment(list, 45, null), null);
});

test('pickSegment skips already-skipped starts when asked', () => {
  const list = [seg(10, 20), seg(30, 40)];
  assert.equal(pickSegment(list, 12, new Set([10])), list[1]);
  assert.equal(pickSegment(list, 12, null), list[0]);
});

test('skipTarget lands inside the media, or null in the natural-end tail', () => {
  assert.equal(skipTarget(20, 100, 0), 20);
  assert.equal(skipTarget(100, 100, 0), 100 - NATURAL_END_TAIL_S);
  assert.equal(skipTarget(99.5, 100, 0), 100 - NATURAL_END_TAIL_S);
  assert.equal(skipTarget(100, 100, 99.9), null);
  assert.equal(skipTarget(100, 100, 99.7), 100 - NATURAL_END_TAIL_S);
  assert.equal(TERMINAL_TOLERANCE_S, 1);
  // Unknown or live duration: seek to the reported end rather than inventing one.
  assert.equal(skipTarget(50, NaN, 0), 50);
  assert.equal(skipTarget(50, 0, 0), 50);
});

test('nextHighlightStart finds the first highlight more than a second ahead', () => {
  const list = [
    seg(10, 10, 'poi_highlight'),
    seg(20, 25, 'sponsor'),
    seg(30, 30, 'poi_highlight'),
    seg(40, 40, 'poi_highlight')
  ];
  assert.equal(nextHighlightStart(list, 0), 10);
  assert.equal(nextHighlightStart(list, 10.5), 30);
  assert.equal(nextHighlightStart(list, 28.5), 30);
  assert.equal(nextHighlightStart(list, 39), null);
  assert.equal(nextHighlightStart([seg(20, 25, 'sponsor')], 0), null);
});

test('markerFrame maps segment times onto the track and host', () => {
  const track = { left: 100, top: 50, width: 1000, height: 5 };
  const host = { left: 100, top: 40 };

  assert.deepEqual(markerFrame(track, host, 100, [10, 20]), {
    left: 100,
    top: 10,
    width: 100,
    height: 5
  });
  // A range past the end is clamped; a start before zero is clamped to zero.
  assert.deepEqual(markerFrame(track, host, 100, [95, 110]), {
    left: 950,
    top: 10,
    width: 50,
    height: 5
  });
  assert.equal(markerFrame(track, host, 100, [-10, 5])?.left, 0);
  // A point still gets the 2 px minimum, clamped inside the track.
  assert.equal(markerFrame(track, host, 100, [50, 50])?.width, 2);
  assert.equal(markerFrame(track, host, 100, [100, 100])?.left, 998);
  // Unknown duration or a collapsed track cannot place a marker.
  assert.equal(markerFrame(track, host, 0, [1, 2]), null);
  assert.equal(markerFrame(track, host, NaN, [1, 2]), null);
  assert.equal(markerFrame({ ...track, width: 0 }, host, 100, [1, 2]), null);
});

test('toSegment keeps a zero-length highlight but not other points', () => {
  assert.ok(toSegment({ category: 'poi_highlight', segment: [6.4, 6.4] }));
  assert.equal(toSegment({ category: 'sponsor', segment: [6.4, 6.4] }), null);
});

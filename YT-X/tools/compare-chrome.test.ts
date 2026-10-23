// Unit tests for the Chrome comparison logic (tools/compare-chrome.ts). They
// run without Chrome: only parsing, classification and reporting are covered.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCoverage,
  diffSnapshots,
  evaluateInvariants,
  formatReport,
  hasBackdropFilter,
  parseColor,
  PROBE_SELECTORS,
  type Entry,
  type ProbeKey,
  type Snapshot,
  type Style
} from './compare-chrome.ts';

const style = (over: Partial<Style> = {}): Style => ({
  backgroundColor: 'rgb(40, 40, 40)',
  backgroundImage: 'none',
  backdropFilter: 'none',
  borderRadius: '8px',
  opacity: '1',
  color: 'rgb(255, 255, 255)',
  boxShadow: 'none',
  ...over
});

function snapshot(
  over: Partial<Record<ProbeKey, Partial<Style> | null>> = {}
): Snapshot {
  const entries = {} as Record<ProbeKey, Entry>;
  for (const key of Object.keys(PROBE_SELECTORS) as ProbeKey[]) {
    const o = over[key];
    entries[key] =
      o === null
        ? { selector: null, style: null }
        : {
            selector: PROBE_SELECTORS[key][0],
            style: style(
              key === 'nowPlaying'
                ? { backgroundColor: 'rgba(0, 0, 0, 0)', ...o }
                : o
            )
          };
  }
  return {
    appPresent: true,
    entries,
    tileImageUrl: 'https://i.ytimg.com/vi/x/hq.jpg'
  };
}

const failing = (snap: Snapshot) =>
  evaluateInvariants(snap)
    .filter((c) => !c.pass)
    .map((c) => c.name);

test('parseColor handles rgb, rgba, transparent and malformed input', () => {
  assert.deepEqual(parseColor('rgb(11, 11, 11)'), {
    r: 11,
    g: 11,
    b: 11,
    a: 1
  });
  assert.deepEqual(parseColor('rgba(1, 2, 3, 0.6)'), {
    r: 1,
    g: 2,
    b: 3,
    a: 0.6
  });
  assert.deepEqual(parseColor('rgb(1 2 3 / 50%)'), {
    r: 1,
    g: 2,
    b: 3,
    a: 0.5
  });
  assert.equal(parseColor('transparent')?.a, 0);
  for (const bad of [
    '',
    'red',
    'rgb(300, 0, 0)',
    'rgba(0, 0, 0, 2)',
    'rgb(1,2)'
  ]) {
    assert.equal(parseColor(bad), null, bad);
  }
  assert.equal(parseColor(undefined), null);
});

test('classifyCoverage separates opaque, translucent and transparent', () => {
  assert.equal(classifyCoverage('rgb(0, 0, 0)'), 'opaque');
  assert.equal(classifyCoverage('rgba(0, 0, 0, 0.6)'), 'translucent');
  assert.equal(classifyCoverage('rgba(0, 0, 0, 0)'), 'transparent');
  assert.equal(classifyCoverage('transparent'), 'transparent');
  assert.equal(classifyCoverage('rgb(0, 0, 0)', '0.5'), 'translucent');
  assert.equal(classifyCoverage('rgb(0, 0, 0)', '0'), 'transparent');
  assert.equal(classifyCoverage('nonsense'), 'unknown');
  assert.equal(classifyCoverage('rgb(0, 0, 0)', 'x'), 'unknown');
});

test('hasBackdropFilter treats only none/empty as off', () => {
  assert.equal(hasBackdropFilter('none'), false);
  assert.equal(hasBackdropFilter(''), false);
  assert.equal(hasBackdropFilter(undefined), false);
  assert.equal(hasBackdropFilter('blur(8px) saturate(1.1)'), true);
});

test('evaluateInvariants passes a native-looking snapshot', () => {
  assert.ok(evaluateInvariants(snapshot()).length > 5);
  assert.deepEqual(failing(snapshot()), []);
});

test('evaluateInvariants flags each class of violation', () => {
  assert.deepEqual(
    failing(snapshot({ scrim: { backdropFilter: 'blur(1px)' } })),
    ['scrim backdrop-filter none']
  );
  assert.deepEqual(failing({ ...snapshot(), appPresent: false }), [
    'ytlr-app present'
  ]);
  assert.deepEqual(failing({ ...snapshot(), tileImageUrl: null }), [
    'now-playing tile image present'
  ]);
});

test('diffSnapshots reports soft differences only for shared fields', () => {
  const a = snapshot();
  const b = snapshot({ pill: { borderRadius: '12px' }, scrim: null });
  assert.deepEqual(diffSnapshots(a, b), [
    { key: 'pill', field: 'borderRadius', chrome: '8px', other: '12px' }
  ]);
  assert.deepEqual(diffSnapshots(a, snapshot()), []);
});

test('formatReport lists PASS/FAIL rows, DIFF rows and a summary', () => {
  const ok = formatReport(evaluateInvariants(snapshot()), []);
  assert.match(ok, /^PASS {2}ytlr-app present/m);
  assert.match(ok, /All hard invariants passed\./);
  assert.match(ok, /DIFF {2}none/);

  const bad = formatReport(
    evaluateInvariants({ ...snapshot(), appPresent: false }),
    [{ key: 'pill', field: 'opacity', chrome: '1', other: '0.9' }]
  );
  assert.match(bad, /^FAIL {2}ytlr-app present/m);
  assert.match(bad, /pill\.opacity\s+chrome=1 \| tv=0\.9/);
  assert.match(bad, /1 hard invariant\(s\) failed\./);

  assert.match(formatReport([], null), /no --tv file given/);
});

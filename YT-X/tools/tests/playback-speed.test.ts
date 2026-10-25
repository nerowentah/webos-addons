import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSrc } from '../lib/load-src.ts';

interface SpeedCheck {
  rateForMode(mode: string): number;
  rateWasHonoured(
    rate: number,
    mediaSeconds: number,
    wallSeconds: number
  ): boolean;
}

const { rateForMode, rateWasHonoured } = await loadSrc<SpeedCheck>(
  'features/playback/speed-check.ts'
);

test('rateForMode reads the mode as a rate and falls back to 1x', () => {
  assert.equal(rateForMode('1.5'), 1.5);
  assert.equal(rateForMode('2'), 2);
  for (const bad of ['', 'fast', '0', '-1', 'NaN']) {
    assert.equal(rateForMode(bad), 1, bad);
  }
});

test('a clock running near the requested rate counts as honoured', () => {
  assert.ok(rateWasHonoured(1.5, 3.7, 2.5));
  assert.ok(rateWasHonoured(2, 5, 2.5));
});

test('a clock stuck at 1x means the platform ignored the rate', () => {
  assert.equal(rateWasHonoured(1.5, 2.5, 2.5), false);
  assert.equal(rateWasHonoured(2, 2.49, 2.5), false);
  // Slower than real time is no better.
  assert.equal(rateWasHonoured(1.25, 1.2, 2.5), false);
});

test('normal speed and an empty window have nothing to disprove', () => {
  assert.ok(rateWasHonoured(1, 2.5, 2.5));
  assert.ok(rateWasHonoured(2, 0, 0));
});

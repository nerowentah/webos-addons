// Tests for the Cobalt leave-playback sequence (src/core/leave-playback.ts) and
// its pure step decision. Each test imports a fresh copy (query suffix) because
// the module keeps state, and drives it with fake timers and a fake clock.

import test from 'node:test';
import assert from 'node:assert/strict';

interface LeaveStepState {
  escapes: number;
  onPlayerPage: boolean;
  playerStopped: boolean;
}
type LeaveStep = 'escape' | 'wait' | 'done';
interface Deps {
  sendEscape(): void;
  onPlayerPage(): boolean;
  playerStopped(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
  now(): number;
}
interface LeavePlayback {
  MAX_ESCAPES: number;
  leaveStep(state: LeaveStepState): LeaveStep;
  beginLeavePlayback(deps: Deps): void;
  isLeavingPlayback(): boolean;
}

let n = 0;
const load = (): Promise<LeavePlayback> =>
  import(
    `${new URL('../../src/core/leave-playback.ts', import.meta.url).href}?t=${n++}`
  ) as Promise<LeavePlayback>;

interface HarnessOptions {
  onPlayerPage: () => boolean;
  playerStopped: () => boolean;
}

/** Fake clock plus timers, so the polls and the stop timeout run instantly. */
function harness(options: HarnessOptions) {
  const pending = new Map<number, () => void>();
  let id = 0;
  let now = 0;
  const escapes: number[] = [];
  const deps: Deps = {
    sendEscape: () => escapes.push(now),
    onPlayerPage: options.onPlayerPage,
    playerStopped: options.playerStopped,
    setTimer: (fn) => {
      pending.set(++id, fn);
      return id;
    },
    clearTimer: (t) => {
      pending.delete(t as number);
    },
    now: () => now
  };
  return {
    deps,
    escapes,
    pendingCount: () => pending.size,
    /** Advance the clock and fire the timer that is pending, if any. */
    tick(ms = 150) {
      now += ms;
      const due = [...pending.values()];
      pending.clear();
      for (const fn of due) fn();
    }
  };
}

const neverStopped = () => false;
const alreadyStopped = () => true;

test('leaveStep decision matrix', async () => {
  const { leaveStep } = await load();
  const state = (escapes: number, stopped: boolean, onPlayer = true) => ({
    escapes,
    onPlayerPage: onPlayer,
    playerStopped: stopped
  });

  assert.equal(leaveStep(state(0, true)), 'escape');
  assert.equal(leaveStep(state(0, false)), 'escape');
  assert.equal(leaveStep(state(1, true)), 'escape');
  assert.equal(leaveStep(state(1, false)), 'wait');
  assert.equal(leaveStep(state(2, true)), 'done');
  assert.equal(leaveStep(state(2, false)), 'done');
  assert.equal(leaveStep(state(0, false, false)), 'done');
});

test('a playing video gets a second Escape once the player stops', async () => {
  const { beginLeavePlayback, isLeavingPlayback } = await load();
  let stoppedNow = false;
  const h = harness({
    onPlayerPage: () => true,
    playerStopped: () => stoppedNow
  });

  beginLeavePlayback(h.deps);
  assert.deepEqual(h.escapes, [0], 'first Escape goes out immediately');
  assert.equal(isLeavingPlayback(), true);
  assert.equal(h.pendingCount(), 1);

  // The player is still running: no second Escape yet.
  h.tick();
  assert.equal(h.escapes.length, 1);
  assert.equal(isLeavingPlayback(), true);

  // The player stops (the first Escape tore it down): retry now.
  stoppedNow = true;
  h.tick();
  assert.equal(h.escapes.length, 2);
  assert.equal(isLeavingPlayback(), false);
  assert.equal(h.pendingCount(), 0, 'no timer survives the finish');
});

test('stops after one Escape when the route already changed', async () => {
  const { beginLeavePlayback, isLeavingPlayback } = await load();
  let onPlayerPage = true;
  const h = harness({
    onPlayerPage: () => onPlayerPage,
    playerStopped: neverStopped
  });

  beginLeavePlayback(h.deps);
  assert.equal(h.escapes.length, 1);

  onPlayerPage = false;
  h.tick();
  assert.equal(
    h.escapes.length,
    1,
    'no Escape past the screen the user asked for'
  );
  assert.equal(isLeavingPlayback(), false);
  assert.equal(h.pendingCount(), 0);
});

test('the half-left state (player already stopped) gets a single Escape', async () => {
  const { beginLeavePlayback, isLeavingPlayback } = await load();
  const h = harness({
    onPlayerPage: () => true,
    playerStopped: alreadyStopped
  });

  beginLeavePlayback(h.deps);
  assert.equal(h.escapes.length, 1);
  assert.equal(isLeavingPlayback(), false);
  assert.equal(h.pendingCount(), 0, 'no retry when one press is enough');
});

test('a player that never reports stopping still gets the retry', async () => {
  const { beginLeavePlayback, isLeavingPlayback, MAX_ESCAPES } = await load();
  const h = harness({ onPlayerPage: () => true, playerStopped: neverStopped });

  beginLeavePlayback(h.deps);
  assert.equal(h.escapes.length, 1);

  // Polls before the timeout must not send the retry.
  for (let i = 0; i < 5; i++) h.tick();
  assert.equal(h.escapes.length, 1);

  // Past the stop timeout the retry goes out regardless.
  for (let i = 0; i < 20 && isLeavingPlayback(); i++) h.tick();
  assert.equal(h.escapes.length, MAX_ESCAPES);
  assert.equal(isLeavingPlayback(), false);
  assert.equal(h.pendingCount(), 0);
});

test('never exceeds the Escape budget', async () => {
  const { beginLeavePlayback, MAX_ESCAPES } = await load();
  const h = harness({ onPlayerPage: () => true, playerStopped: neverStopped });

  beginLeavePlayback(h.deps);
  for (let i = 0; i < 30; i++) h.tick();
  assert.equal(h.escapes.length, MAX_ESCAPES);
  assert.equal(h.pendingCount(), 0);
});

test('ignores a second press while a leave is running', async () => {
  const { beginLeavePlayback, isLeavingPlayback } = await load();
  const h = harness({ onPlayerPage: () => true, playerStopped: neverStopped });

  beginLeavePlayback(h.deps);
  beginLeavePlayback(h.deps);
  assert.equal(h.escapes.length, 1, 'a quick double press is still one leave');

  for (let i = 0; i < 20 && isLeavingPlayback(); i++) h.tick();
  assert.equal(h.escapes.length, 2, 'the whole press stays at two Escapes');
  assert.equal(isLeavingPlayback(), false);
});

test('does nothing when the press was not on a player page', async () => {
  const { beginLeavePlayback, isLeavingPlayback } = await load();
  const h = harness({ onPlayerPage: () => false, playerStopped: neverStopped });

  beginLeavePlayback(h.deps);
  assert.equal(h.escapes.length, 0);
  assert.equal(isLeavingPlayback(), false);
  assert.equal(h.pendingCount(), 0);
});

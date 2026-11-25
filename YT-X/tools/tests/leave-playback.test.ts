// Tests for the Cobalt leave-playback sequence (src/core/leave-playback.ts) and
// its pure step decision. Each test imports a fresh copy (query suffix) because
// the module keeps state, and drives it with fake timers and a fake clock plus
// a fake page that reacts to each Escape the way the TV did when probed.

import test from 'node:test';
import assert from 'node:assert/strict';

interface LeaveSnapshot {
  overlayOpen: boolean;
  tornDown: boolean;
}
interface LeaveStepState extends LeaveSnapshot {
  escapes: number;
  onPlayerPage: boolean;
  atLastEscape: LeaveSnapshot | null;
  sinceLastEscapeMs: number;
}
type LeaveStep = 'escape' | 'wait' | 'done';
interface Deps {
  sendEscape(n: number, at: LeaveSnapshot): void;
  onPlayerPage(): boolean;
  overlayOpen(): boolean;
  playerTornDown(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
  now(): number;
}
interface LeavePlayback {
  MAX_ESCAPES: number;
  RETRY_MS: number;
  GIVE_UP_MS: number;
  leaveStep(state: LeaveStepState): LeaveStep;
  beginLeavePlayback(deps: Deps): void;
  isLeavingPlayback(): boolean;
}

let n = 0;
const load = (): Promise<LeavePlayback> =>
  import(
    `${new URL('../../src/core/leave-playback.ts', import.meta.url).href}?t=${n++}`
  ) as Promise<LeavePlayback>;

interface Page {
  onPlayerPage: boolean;
  overlayOpen: boolean;
  tornDown: boolean;
}

/**
 * Fake clock, timers and page. `onEscape` mutates the page for each Escape
 * (the escape's 1-based number is passed); by default the page ignores it.
 */
function harness(
  page: Page,
  onEscape: (n: number, p: Page) => void = () => {}
) {
  const pending = new Map<number, () => void>();
  let id = 0;
  let now = 0;
  const escapes: number[] = [];
  const deps: Deps = {
    sendEscape: (count) => {
      escapes.push(now);
      onEscape(count, page);
    },
    onPlayerPage: () => page.onPlayerPage,
    overlayOpen: () => page.overlayOpen,
    playerTornDown: () => page.tornDown,
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
    page,
    pendingCount: () => pending.size,
    /** Advance the clock and fire the timer that is pending, if any. */
    tick(ms = 150) {
      now += ms;
      const due = [...pending.values()];
      pending.clear();
      for (const fn of due) fn();
    },
    /** Tick until the sequence finishes (bounded). */
    run(maxTicks = 60) {
      for (let i = 0; i < maxTicks && pending.size > 0; i++) this.tick();
    }
  };
}

const playing = (overlayOpen = false): Page => ({
  onPlayerPage: true,
  overlayOpen,
  tornDown: false
});

/** The page as probed on the TV: each Escape peels the topmost layer. */
const realPage = (_n: number, p: Page): void => {
  if (p.overlayOpen) p.overlayOpen = false;
  else if (!p.tornDown && !pausedPages.has(p)) p.tornDown = true;
  else p.onPlayerPage = false;
};
const pausedPages = new WeakSet<Page>();
const paused = (overlayOpen: boolean): Page => {
  const p = playing(overlayOpen);
  pausedPages.add(p);
  return p;
};

test('leaveStep decision matrix', async () => {
  const { leaveStep, RETRY_MS, GIVE_UP_MS } = await load();
  const s = (
    over: Partial<LeaveStepState> & { atLastEscape: LeaveSnapshot | null }
  ): LeaveStepState => ({
    escapes: 1,
    onPlayerPage: true,
    overlayOpen: false,
    tornDown: false,
    sinceLastEscapeMs: 0,
    ...over
  });
  const loaded = { overlayOpen: false, tornDown: false };
  const withOverlay = { overlayOpen: true, tornDown: false };

  assert.equal(leaveStep(s({ escapes: 0, atLastEscape: null })), 'escape');
  assert.equal(
    leaveStep(s({ escapes: 0, atLastEscape: null, onPlayerPage: false })),
    'done',
    'off a player page nothing is sent'
  );
  assert.equal(
    leaveStep(s({ atLastEscape: withOverlay })),
    'escape',
    'overlay closed: next layer at once'
  );
  assert.equal(
    leaveStep(s({ atLastEscape: loaded, tornDown: true })),
    'escape',
    'player tore down: leave at once'
  );
  assert.equal(leaveStep(s({ atLastEscape: loaded })), 'wait');
  assert.equal(
    leaveStep(s({ atLastEscape: loaded, sinceLastEscapeMs: RETRY_MS })),
    'escape',
    'nothing visible changed: retry after the timeout'
  );
  const leftAfterTeardown = { overlayOpen: false, tornDown: true };
  assert.equal(
    leaveStep(s({ atLastEscape: leftAfterTeardown, tornDown: true })),
    'wait',
    'leave Escape sent: wait for the route'
  );
  assert.equal(
    leaveStep(
      s({
        atLastEscape: leftAfterTeardown,
        tornDown: true,
        sinceLastEscapeMs: RETRY_MS
      })
    ),
    'wait',
    'no retry while the route may still be changing'
  );
  assert.equal(
    leaveStep(
      s({
        atLastEscape: leftAfterTeardown,
        tornDown: true,
        sinceLastEscapeMs: GIVE_UP_MS
      })
    ),
    'done'
  );
  assert.equal(
    leaveStep(s({ escapes: 3, atLastEscape: withOverlay })),
    'done',
    'budget spent'
  );
  assert.equal(
    leaveStep(s({ atLastEscape: withOverlay, onPlayerPage: false })),
    'done'
  );
});

for (const [name, page, expected] of [
  ['playing, controls hidden', () => playing(false), 2],
  ['playing, controls open', () => playing(true), 3],
  ['paused with the pointer, controls open', () => paused(true), 2],
  ['paused, controls hidden', () => paused(false), 1],
  [
    'half-left (already torn down)',
    () => ({ onPlayerPage: true, overlayOpen: false, tornDown: true }),
    1
  ]
] as const) {
  test(`one press leaves the route: ${name}`, async () => {
    const { beginLeavePlayback, isLeavingPlayback } = await load();
    const h = harness(page(), realPage);

    beginLeavePlayback(h.deps);
    h.run();
    assert.equal(h.page.onPlayerPage, false, 'left the player page');
    assert.equal(h.escapes.length, expected);
    assert.equal(isLeavingPlayback(), false);
    assert.equal(h.pendingCount(), 0, 'no timer survives the finish');
  });
}

test('each layer is peeled without waiting for the retry timeout', async () => {
  const { beginLeavePlayback, RETRY_MS } = await load();
  const h = harness(playing(true), realPage);

  beginLeavePlayback(h.deps);
  h.run();
  const last = h.escapes[h.escapes.length - 1] ?? Infinity;
  assert.ok(last < RETRY_MS, `last Escape at ${last}ms`);
});

test('the leave Escape is not retried while the route changes', async () => {
  const { beginLeavePlayback, isLeavingPlayback, GIVE_UP_MS } = await load();
  // The route never changes: only the teardown is visible.
  const h = harness(playing(), (_n, p) => {
    p.tornDown = true;
  });

  beginLeavePlayback(h.deps);
  h.run();
  assert.equal(h.escapes.length, 2, 'stop, then one leave; no third');
  assert.equal(isLeavingPlayback(), false);
  assert.ok(GIVE_UP_MS > 0);
});

test('a page that never reacts gets retries up to the budget', async () => {
  const { beginLeavePlayback, isLeavingPlayback, MAX_ESCAPES, RETRY_MS } =
    await load();
  const h = harness(playing());

  beginLeavePlayback(h.deps);
  for (let i = 0; i < 5; i++) h.tick();
  assert.equal(h.escapes.length, 1, 'no retry before the timeout');

  h.run();
  assert.equal(h.escapes.length, MAX_ESCAPES);
  assert.ok((h.escapes[1] ?? 0) >= RETRY_MS);
  assert.equal(isLeavingPlayback(), false);
  assert.equal(h.pendingCount(), 0);
});

test('stops as soon as the route changes', async () => {
  const { beginLeavePlayback } = await load();
  const h = harness(playing(true), (_n, p) => {
    p.overlayOpen = false;
    p.onPlayerPage = false;
  });

  beginLeavePlayback(h.deps);
  h.run();
  assert.equal(h.escapes.length, 1, 'no Escape past the screen asked for');
});

test('ignores a second press while a leave is running', async () => {
  const { beginLeavePlayback, isLeavingPlayback } = await load();
  const h = harness(playing(), realPage);

  beginLeavePlayback(h.deps);
  beginLeavePlayback(h.deps);
  assert.equal(h.escapes.length, 1, 'a quick double press is still one leave');

  h.run();
  assert.equal(h.escapes.length, 2);
  assert.equal(isLeavingPlayback(), false);
});

test('does nothing when the press was not on a player page', async () => {
  const { beginLeavePlayback, isLeavingPlayback } = await load();
  const h = harness({
    onPlayerPage: false,
    overlayOpen: false,
    tornDown: false
  });

  beginLeavePlayback(h.deps);
  assert.equal(h.escapes.length, 0);
  assert.equal(isLeavingPlayback(), false);
  assert.equal(h.pendingCount(), 0);
});

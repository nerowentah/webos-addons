// Cobalt's YouTube build peels a player page back one layer per Escape, and how
// many layers there are depends on what the user was doing:
// - the controls overlay is open (a D-pad press or the Magic Remote pointer put
//   focus on it): one Escape just closes it;
// - the video is loaded: one Escape tears the player down (readyState drops to
//   0) but leaves the watch route behind a black screen;
// - the player is already torn down, or the video is merely paused: one Escape
//   leaves the route.
// So one remote Back becomes as many Escapes as it takes, each sent as soon as
// the previous one visibly took effect (the overlay closed or the player tore
// down), not on a fixed delay.
//
// A paused video is not a torn-down one: pausing with the pointer keeps the
// overlay open and the media loaded, and treating it as "already stopped" sent a
// single Escape that only closed the overlay.
//
// The page type is re-read between the steps: once it is no longer a player
// page the route changed, and another Escape would navigate past the screen the
// user asked for. A press that arrives while a leave is already running is
// swallowed by the caller (see exit-keys.ts), so a quick double press cannot
// add Escapes.

/** Escapes one Back press may produce: close the overlay, stop, leave. */
export const MAX_ESCAPES = 3;
/** How often the page is re-checked between Escapes. */
const POLL_MS = 150;
/**
 * How long an Escape that changed nothing visible waits before the next goes
 * out anyway: the page may have reacted in a way the checks cannot see.
 */
export const RETRY_MS = 1500;
/**
 * How long to wait for the route to change once the player is torn down and
 * the leave Escape was sent. No retry here: an Escape sent while the route is
 * still changing would land on the page after it.
 */
export const GIVE_UP_MS = 3000;

/** What the page showed at one point in the sequence. */
export interface LeaveSnapshot {
  /** Focus is inside the player's controls overlay. */
  overlayOpen: boolean;
  /** The player is gone or unloaded (no video, readyState 0, or ended). */
  tornDown: boolean;
}

export interface LeaveStepState extends LeaveSnapshot {
  /** Escapes already sent for this press. */
  escapes: number;
  onPlayerPage: boolean;
  /** The page as it was when the last Escape went out (null before the first). */
  atLastEscape: LeaveSnapshot | null;
  /** Time since the last Escape. */
  sinceLastEscapeMs: number;
}

export type LeaveStep = 'escape' | 'wait' | 'done';

/**
 * Next thing to do for one Back press: send an Escape, wait for the last one to
 * take effect, or stop because the route changed or the budget is spent.
 */
export function leaveStep(state: LeaveStepState): LeaveStep {
  if (!state.onPlayerPage) return 'done';
  if (state.escapes === 0 || !state.atLastEscape) return 'escape';
  if (state.escapes >= MAX_ESCAPES) return 'done';
  const before = state.atLastEscape;
  const progressed =
    (before.overlayOpen && !state.overlayOpen) ||
    (!before.tornDown && state.tornDown);
  if (progressed) return 'escape';
  if (state.tornDown) {
    return state.sinceLastEscapeMs >= GIVE_UP_MS ? 'done' : 'wait';
  }
  return state.sinceLastEscapeMs >= RETRY_MS ? 'escape' : 'wait';
}

export interface LeavePlaybackDeps {
  sendEscape(escapeNumber: number, at: LeaveSnapshot): void;
  onPlayerPage(): boolean;
  overlayOpen(): boolean;
  playerTornDown(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
  now(): number;
}

let running = false;
let escapes = 0;
let lastEscapeAt = 0;
let atLastEscape: LeaveSnapshot | null = null;
let timer: unknown = null;

/** Whether a leave is in progress, so further Back presses should be ignored. */
export function isLeavingPlayback(): boolean {
  return running;
}

function finish(deps: LeavePlaybackDeps): void {
  if (timer !== null) {
    deps.clearTimer(timer);
    timer = null;
  }
  running = false;
  escapes = 0;
  atLastEscape = null;
}

function step(deps: LeavePlaybackDeps): void {
  const snapshot: LeaveSnapshot = {
    overlayOpen: deps.overlayOpen(),
    tornDown: deps.playerTornDown()
  };
  const action = leaveStep({
    ...snapshot,
    escapes,
    onPlayerPage: deps.onPlayerPage(),
    atLastEscape,
    sinceLastEscapeMs: deps.now() - lastEscapeAt
  });
  if (action === 'done') {
    finish(deps);
    return;
  }
  if (action === 'escape') {
    escapes += 1;
    lastEscapeAt = deps.now();
    atLastEscape = snapshot;
    deps.sendEscape(escapes, snapshot);
    if (escapes >= MAX_ESCAPES) {
      finish(deps);
      return;
    }
  }
  timer = deps.setTimer(() => {
    timer = null;
    if (running) step(deps);
  }, POLL_MS);
}

/**
 * Leaves playback for one Back press: sends Escape now, and another each time
 * the last one closed the overlay or tore the player down, until the route
 * changes. No-op while one is already running.
 */
export function beginLeavePlayback(deps: LeavePlaybackDeps): void {
  if (running) return;
  running = true;
  escapes = 0;
  atLastEscape = null;
  lastEscapeAt = deps.now();
  timer = null;
  step(deps);
}

// Cobalt's YouTube build stops the player on the first Escape but only finishes
// leaving the playback route on the next one: one Back press leaves the watch
// page torn down behind a black screen, and a second press lands on browse. So
// one remote Back becomes two Escapes - the second sent as soon as the player
// actually stopped, not on a fixed delay.
//
// The page type is re-read between the steps: once it is no longer a player
// page the route changed, and another Escape would navigate past the screen the
// user asked for. A press that arrives while a leave is already running is
// swallowed by the caller (see exit-keys.ts), so a quick double press cannot
// turn into three Escapes.
//
// A player page whose video is already stopped is the half-left state a single
// Escape leaves behind; one Escape is enough there, so no second is sent.

/** Escapes one Back press may produce. */
export const MAX_ESCAPES = 2;
/** How often the player state is re-checked while waiting for it to stop. */
const POLL_MS = 150;
/**
 * How long the second Escape waits for the player to report itself stopped.
 * Past this the Escape goes out anyway: a player that never stops is the black
 * screen the second press exists to clear, so waiting longer only helps the
 * page's own transition, not the user.
 */
const STOP_TIMEOUT_MS = 1500;

export interface LeaveStepState {
  /** Escapes already sent for this press. */
  escapes: number;
  onPlayerPage: boolean;
  /** The video is gone, paused or ended (the player was torn down). */
  playerStopped: boolean;
}

export type LeaveStep = 'escape' | 'wait' | 'done';

/**
 * Next thing to do for one Back press: send an Escape, wait for the player to
 * stop, or stop because the route changed or the budget is spent.
 */
export function leaveStep(state: LeaveStepState): LeaveStep {
  if (!state.onPlayerPage) return 'done';
  if (state.escapes === 0) return 'escape';
  if (state.playerStopped && state.escapes < MAX_ESCAPES) return 'escape';
  return state.escapes >= MAX_ESCAPES ? 'done' : 'wait';
}

export interface LeavePlaybackDeps {
  sendEscape(): void;
  onPlayerPage(): boolean;
  playerStopped(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
  now(): number;
}

let running = false;
let escapes = 0;
let startedAt = 0;
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
}

function step(deps: LeavePlaybackDeps): void {
  const onPlayerPage = deps.onPlayerPage();
  let action = leaveStep({
    escapes,
    onPlayerPage,
    playerStopped: deps.playerStopped()
  });
  // The stop watch exists to time the retry, not to cancel it: send the second
  // Escape once the timeout expires even if the player never says it stopped.
  if (action === 'wait' && deps.now() - startedAt >= STOP_TIMEOUT_MS) {
    action = 'escape';
  }
  if (action === 'escape') {
    escapes += 1;
    deps.sendEscape();
  }
  // Nothing more to send once the route changed or the budget is spent.
  if (action === 'done' || escapes >= MAX_ESCAPES) {
    finish(deps);
    return;
  }
  timer = deps.setTimer(() => {
    timer = null;
    if (running) step(deps);
  }, POLL_MS);
}

/**
 * Leaves playback for one Back press. From a playing video this sends Escape
 * now and a second one once the player stops; from the half-left state (player
 * already stopped) it sends a single Escape. No-op while one is already
 * running.
 */
export function beginLeavePlayback(deps: LeavePlaybackDeps): void {
  if (running) return;
  running = true;
  escapes = 0;
  startedAt = deps.now();
  timer = null;
  if (deps.onPlayerPage() && deps.playerStopped()) {
    deps.sendEscape();
    finish(deps);
    return;
  }
  step(deps);
}

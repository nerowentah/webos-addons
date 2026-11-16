// Ends the app for good. With supportQuickStart the app can stay suspended in
// the background after the page closes, so the application manager is asked
// first: closeByAppId, then close, and only then the page's own close. Each step
// has a deadline (the bridge may never answer) and the whole chain runs once.
// Without the Luna bridge (native Cobalt) the page's own close is all there is.

import { APPMANAGER_URI, lunaCall, type LunaResponse } from './luna';

// Stock app id, required by the native build too (tools/native/native.ts).
const APP_ID = 'youtube.leanback.v4';

/** Longest wait for one Luna step before the next one is tried. */
const STEP_DEADLINE_MS = 700;
/** Longest the whole chain may take before the page's own close runs. */
const TOTAL_DEADLINE_MS = 2500;

const STEPS = ['closeByAppId', 'close'] as const;

export interface CloseDeps {
  call: (
    uri: string,
    params: Record<string, unknown>,
    onResponse: (res: LunaResponse) => void
  ) => unknown;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
}

const defaultDeps: CloseDeps = {
  call: lunaCall,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>)
};

let closing = false;

/** Whether a close is already under way; repeat requests are then no-ops. */
export const isClosing = (): boolean => closing;

/**
 * Closes the app: Luna closeByAppId, then close, then `rawClose` (the page's own
 * window.close). One-shot: later calls do nothing. `rawClose` runs exactly once.
 */
export function closeAppFully(
  rawClose: () => void,
  deps: CloseDeps = defaultDeps
): void {
  if (closing) return;
  closing = true;

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    deps.clearTimer(total);
    try {
      rawClose();
    } catch {
      // Nothing is left to try.
    }
  };
  const total = deps.setTimer(finish, TOTAL_DEADLINE_MS);

  const run = (index: number): void => {
    const step = STEPS[index];
    if (finished || step === undefined) {
      finish();
      return;
    }
    let settled = false;
    const advance = (res?: LunaResponse): void => {
      if (settled) return;
      settled = true;
      deps.clearTimer(timer);
      // The manager accepted the close: the process is going away, so go straight to the page close.
      run(res && res['returnValue'] === true ? STEPS.length : index + 1);
    };
    const timer = deps.setTimer(() => advance(), STEP_DEADLINE_MS);
    const bridge = deps.call(APPMANAGER_URI + step, { id: APP_ID }, advance);
    if (bridge === null) advance();
  };
  run(0);
}

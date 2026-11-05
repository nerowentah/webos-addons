// One-shot and subscribed Luna calls over the platform's PalmServiceBridge. The
// bridge is absent on the native Cobalt build and may refuse a call, so every
// helper degrades to `null` instead of throwing.

export const TVPOWER_URI = 'luna://com.webos.service.tvpower/power/';
export const APPMANAGER_URI = 'luna://com.webos.service.applicationmanager/';

// A bridge collected before its answer arrives drops the answer; keep each one-shot call referenced until its callback ran.
const pendingLunaCalls: PalmServiceBridge[] = [];

/** A parsed Luna answer; `null` when the payload was not a JSON object. */
export type LunaResponse = Record<string, unknown> | null;

export function hasPalmBridge(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PalmServiceBridge === 'function'
  );
}

/**
 * @param uri Full service URI, e.g. `luna://com.webos.service.tvpower/power/turnOffScreen`.
 * @returns The bridge (hold it for a subscription), or `null` when the call could not be made.
 */
export function lunaCall(
  uri: string,
  params: Record<string, unknown>,
  onResponse?: (res: LunaResponse) => void,
  subscribe = false
): PalmServiceBridge | null {
  const Bridge =
    typeof window !== 'undefined' ? window.PalmServiceBridge : undefined;
  if (typeof Bridge !== 'function') return null;
  try {
    const bridge = new Bridge();
    if (!subscribe) pendingLunaCalls.push(bridge);
    bridge.onservicecallback = (msg) => {
      if (!subscribe) {
        const i = pendingLunaCalls.indexOf(bridge);
        if (i !== -1) pendingLunaCalls.splice(i, 1);
      }
      if (!onResponse) return;
      let res: LunaResponse = null;
      try {
        const parsed: unknown = JSON.parse(msg);
        if (typeof parsed === 'object' && parsed !== null) {
          res = parsed as Record<string, unknown>;
        }
      } catch {
        /* not JSON */
      }
      try {
        onResponse(res);
      } catch {
        // A throwing response handler must not break the luna callback.
      }
    };
    bridge.call(uri, JSON.stringify(params));
    return bridge;
  } catch {
    return null;
  }
}

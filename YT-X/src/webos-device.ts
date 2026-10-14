/**
 * Async access to the webOS device API.
 *
 * The platform injects `window.webOS` into the webview, and its `deviceInfo`
 * member is how the video plane is read. Two things make this a module rather
 * than three lines at the call site:
 *
 *   1. It is asynchronous. The reference documents `deviceInfo` as a callback
 *      method - "The function to call once the information is collected", "Call
 *      returns: Returns undefined" - so there is no synchronous value to read.
 *      Anything that needs the specs at startup (the cast-core block in
 *      block-webos-cast.ts runs at module-evaluation time) has to stay on the
 *      synchronous UA path and pick this up later.
 *
 *   2. Its shape is not settled. The official reference describes the callback
 *      form, but community typings describe `deviceInfo` as a plain object. Both
 *      are probed here rather than betting the video plane on either.
 *
 * Nothing in this module rejects. A missing API, a throwing callback, or a
 * callback that never fires all resolve to `null`, because the app has a working
 * path without any of it: after the scale fix in tv-specs.ts, the
 * viewport-only answer is already correct, and the device API only adds the
 * panel's real output resolution on top.
 *
 * @see https://webostv.developer.lge.com/develop/references/webostvjs-webos
 */

import type { WebOSDeviceInfo } from './globals';

/**
 * How long to wait for `deviceInfo` before giving up.
 *
 * The callback is serviced by the platform's own bridge, so it normally lands
 * within a frame or two. A second is generous; the ceiling exists so a wedged
 * bridge cannot leave the spec enrichment permanently pending and the debug dump
 * permanently silent.
 */
const DEVICE_INFO_TIMEOUT_MS = 1000;

type Timer = ReturnType<typeof setTimeout>;

let cached: Promise<WebOSDeviceInfo | null> | null = null;

/**
 * `webOS.deviceInfo` as a plain object, if that is the shape in play.
 *
 * Guarded on the field being non-null and not a function, so the documented
 * callback form is never mistaken for an object.
 */
function deviceInfoObject(): WebOSDeviceInfo | null {
  const api = window.webOS;
  if (api === undefined) return null;

  const info = api.deviceInfo;
  if (info === undefined || info === null || typeof info === 'function') {
    return null;
  }

  return info;
}

function probeDeviceInfo(): Promise<WebOSDeviceInfo | null> {
  return new Promise((resolve) => {
    const api = window.webOS;
    if (api === undefined) {
      resolve(null);
      return;
    }

    const asObject = deviceInfoObject();
    if (asObject !== null) {
      resolve(asObject);
      return;
    }

    if (typeof api.deviceInfo !== 'function') {
      resolve(null);
      return;
    }

    let settled = false;

    const finish = (info: WebOSDeviceInfo | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(info);
    };

    // Declared after finish() so the closure captures the binding, not a
    // snapshot: finish() clears it, and that has to be the same timer.
    const timer: Timer = setTimeout(() => {
      if (window.__ytx_debug__) {
        console.warn(
          `[webos-device] deviceInfo did not answer within ${DEVICE_INFO_TIMEOUT_MS}ms`
        );
      }
      finish(null);
    }, DEVICE_INFO_TIMEOUT_MS);

    try {
      api.deviceInfo((info) => {
        finish(info ?? null);
      });
    } catch (err) {
      console.warn('[webos-device] deviceInfo threw', err);
      finish(null);
    }
  });
}

/**
 * The device info, or `null` when the platform did not provide it.
 *
 * Resolved once and cached: the values describe the hardware, so they cannot
 * change while the app is running, and a repeat call would otherwise queue
 * another bridge round trip.
 */
export function getDeviceInfo(): Promise<WebOSDeviceInfo | null> {
  cached ??= probeDeviceInfo();
  return cached;
}

/** Whether the platform injected its `webOS` API object. */
export function hasWebOS(): boolean {
  const api = window.webOS;
  return typeof api === 'object' && api !== null;
}

/** Whether the Luna bridge is reachable, for the debug matrix only. */
export function hasLunaBridge(): boolean {
  return typeof window.webOS?.service?.request === 'function';
}

/** `webOSTV.js` build version, for the debug dump. Absent without the library. */
export function getLibVersion(): string | undefined {
  const version = window.webOS?.libVersion;
  return typeof version === 'string' ? version : undefined;
}

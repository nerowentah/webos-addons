/**
 * Async access to the webOS device API: the injected `webOS.deviceInfo` is a
 * callback method (community typings also describe a plain object - both are
 * probed), and nothing here rejects - a missing, throwing or wedged API
 * resolves to `null`, because the viewport-only path in tv-specs.ts already
 * works without the panel's real output resolution.
 * @see https://webostv.developer.lge.com/develop/references/webostvjs-webos
 */

import type { WebOSDeviceInfo } from './globals';

/**
 * How long to wait for `deviceInfo` before giving up; the ceiling stops a wedged bridge leaving the spec enrichment and debug dump pending forever.
 */
const DEVICE_INFO_TIMEOUT_MS = 1000;

type Timer = ReturnType<typeof setTimeout>;

let cached: Promise<WebOSDeviceInfo | null> | null = null;

/** `webOS.deviceInfo` as a plain object, if that is the shape in play; the field being a function means the documented callback form, never an object. */
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
 * The device info, or `null` when the platform did not provide it; resolved once and cached (hardware values cannot change, so a repeat call would just queue another bridge round trip).
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

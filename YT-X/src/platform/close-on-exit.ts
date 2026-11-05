// "Fully Close on Exit": with supportQuickStart the app stays in the background
// after YouTube's exit dialog calls window.close(). When enabled, also ask the
// application manager to close this app so no instance is left behind.
//
// The page (YouTube's cast shim on Cobalt) assigns its own window.close after
// this module runs, so a plain wrapper would be overwritten; the property is an
// accessor that wraps whatever gets assigned.

import { configRead } from '../config/config';
import { APPMANAGER_URI, lunaCall } from './luna';

// Stock app id, required by the native build too (tools/native/native.ts).
const APP_ID = 'youtube.leanback.v4';

type CloseFn = () => void;

function wrapClose(inner: CloseFn): CloseFn {
  return function wrappedClose(this: unknown): void {
    if (configRead('closeOnExit')) {
      // Without the Luna bridge (native Cobalt) the page's own close is all there is.
      lunaCall(APPMANAGER_URI + 'close', { id: APP_ID });
    }
    inner.call(this);
  };
}

let current: CloseFn = window.close.bind(window);
let wrapped = wrapClose(current);

try {
  Object.defineProperty(window, 'close', {
    configurable: true,
    get: () => wrapped,
    set: (fn: unknown) => {
      if (typeof fn !== 'function') return;
      current = fn as CloseFn;
      wrapped = wrapClose(current);
    }
  });
} catch {
  // A non-configurable close cannot be wrapped; exit then behaves as before.
}

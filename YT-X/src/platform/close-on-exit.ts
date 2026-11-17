// Page-level close hook. YouTube's own exit path ends in window.close(), and the
// cast handoff may too. Every such call is routed to a handler: exit-keys.ts
// installs requestExit() (the Exit / Cancel dialog) at init; until then, and in a
// build where the UI failed to load, the default handler force-closes so the
// app still exits cleanly.
//
// The page (YouTube's cast shim on Cobalt) assigns its own window.close after
// this module runs, so a plain wrapper would be overwritten; the property is an
// accessor that wraps whatever gets assigned. YT-X's own confirmed exit calls
// forceClose(), which runs the raw inner close directly and never passes
// through the wrapper, so there is no recursion.

import { closeAppFully } from './app-close';

type CloseFn = () => void;

let rawInnerClose: CloseFn = window.close.bind(window);

/** Closes the app now, with no dialog: Luna close chain, then the page's own close. */
export function forceClose(): void {
  closeAppFully(() => rawInnerClose());
}

let pageCloseHandler: CloseFn = forceClose;

/** Replaces what a page-initiated window.close() does (default: force-close). */
export function setPageCloseHandler(handler: CloseFn): void {
  pageCloseHandler = handler;
}

const wrappedClose: CloseFn = function wrappedClose(): void {
  pageCloseHandler();
};

try {
  Object.defineProperty(window, 'close', {
    configurable: true,
    get: () => wrappedClose,
    set: (fn: unknown) => {
      if (typeof fn !== 'function') return;
      const assigned = fn as CloseFn;
      rawInnerClose = function (this: unknown): void {
        assigned.call(window);
      };
    }
  });
} catch {
  // A non-configurable close cannot be wrapped; exit then behaves as before.
}

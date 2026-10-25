// A bundle that runs before the page's document is built (the native Cobalt
// preload) can lose what it appended to <head>/<body>: the page rebuilds both.
// Callers register a callback that re-appends their nodes; it runs when the
// document settles and whenever <html>'s children change until a short grace
// period after `load`.

const GRACE_AFTER_LOAD_MS = 5000;

const callbacks: Array<() => void> = [];
let observer: MutationObserver | null = null;
let started = false;

function runAll(): void {
  for (const callback of callbacks) {
    try {
      callback();
    } catch {
      // One failing re-attach must not stop the others.
    }
  }
}

function stop(): void {
  observer?.disconnect();
  observer = null;
}

function start(): void {
  if (started) return;
  started = true;

  const root = document.documentElement;
  if (root) {
    observer = new MutationObserver(runAll);
    observer.observe(root, { childList: true });
  }
  document.addEventListener('DOMContentLoaded', runAll);
  window.addEventListener('load', () => {
    runAll();
    setTimeout(stop, GRACE_AFTER_LOAD_MS);
  });
}

/** Runs `callback` now and again each time the document is rebuilt. */
export function reattachOnRebuild(callback: () => void): void {
  callbacks.push(callback);
  start();
  callback();
}

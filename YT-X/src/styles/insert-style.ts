import { nonceStyle } from '../core/csp-nonce';
import { reattachOnRebuild } from '../core/reattach';

const inserted: HTMLStyleElement[] = [];

function attach(element: HTMLStyleElement): void {
  nonceStyle(element);
  (document.head || document.documentElement).appendChild(element);
}

reattachOnRebuild(() => {
  for (const element of inserted) {
    if (!element.isConnected) attach(element);
  }
});

/**
 * style-loader's `insert` hook: appends to <head> with the page's style nonce, waiting for one if the DOM has none yet. Kept so it can be put back if the page rebuilds <head>.
 *
 * style-loader fills the element right after calling this, and Cobalt's CSS
 * parser ignores text set on a style that is already in the document (zero
 * rules, measured on the TV), so the append waits one microtask for the text.
 */
export default function insertStyle(element: HTMLStyleElement): void {
  inserted.push(element);
  void Promise.resolve().then(() => attach(element));
}

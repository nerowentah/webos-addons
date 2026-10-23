import { nonceStyle } from '../core/csp-nonce';

/** style-loader's `insert` hook: appends to <head> with the page's style nonce, waiting for one if the DOM has none yet. */
export default function insertStyle(element: HTMLStyleElement): void {
  nonceStyle(element);
  (document.head || document.documentElement).appendChild(element);
}

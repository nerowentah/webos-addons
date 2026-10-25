import { REMOTE_KEYS, isSyntheticKey, sendKey } from './keys';

/** Whether this page was served to the Cobalt user agent (a build-time choice, see tools/app-ua.ts). */
function isCobaltUa(userAgent: string = navigator.userAgent): boolean {
  return /\bCobalt\//.test(userAgent);
}

/**
 * YouTube's Cobalt build reads Escape (27) as Back and ignores webOS's
 * keyCode 461, so under the Cobalt UA the remote's Back does nothing on a watch
 * page. Re-send a real Back press as Escape. Registered after the panel's
 * handler so an open settings panel still consumes Back first.
 */
export function initCobaltBack(): void {
  if (!isCobaltUa()) return;

  window.addEventListener(
    'keydown',
    (evt) => {
      if (evt.keyCode !== REMOTE_KEYS.BACK.keyCode || isSyntheticKey(evt)) {
        return;
      }
      evt.preventDefault();
      evt.stopImmediatePropagation();
      sendKey(REMOTE_KEYS.ESCAPE, document.activeElement ?? document.body);
    },
    true
  );
}

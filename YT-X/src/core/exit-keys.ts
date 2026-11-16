import { panelState } from '../ui/panel-state';
import { requestExit } from '../ui/exit-dialog';
import { setPageCloseHandler } from '../platform/close-on-exit';
import { shouldExitOnBack } from './exit-on-back';
import { isBlackedOut } from '../platform/screen-off';
import { REMOTE_KEYS, isSyntheticKey, sendKey } from './keys';

/** Whether this page was served to the Cobalt user agent (a build-time choice, see tools/build/app-ua.ts). */
function isCobaltUa(userAgent: string = navigator.userAgent): boolean {
  return /\bCobalt\//.test(userAgent);
}

interface ExitTrace {
  at: number;
  via: 'back' | 'page-close';
  hash: string;
  search: string;
}

/** Keeps the last exit requests in window.__ytxExit, so the debug port can show whether a close came from a cast handoff (see block-webos-cast.ts) before a guard is added. */
function trace(via: ExitTrace['via']): void {
  try {
    const host = window as unknown as { __ytxExit?: ExitTrace[] };
    const log = (host.__ytxExit ??= []);
    log.push({
      at: Date.now(),
      via,
      hash: location.hash,
      search: location.search
    });
    if (log.length > 8) log.shift();
  } catch {
    // Tracing must never get in the way of exiting.
  }
}

/**
 * Back handling, registered after the panel's handler so an open settings panel
 * still consumes Back first:
 * - At the YouTube home page (every user agent) Back asks "Close YouTube-X?"
 *   instead of letting the page leave the app on its own.
 * - Under the Cobalt UA, YouTube reads Escape (27) as Back and ignores webOS's
 *   keyCode 461, so everywhere else the press is re-sent as a real Escape.
 *
 * Also routes the page's own window.close() (YouTube's exit dialog, the cast
 * handoff) through the same dialog.
 */
export function initExitKeys(): void {
  setPageCloseHandler(() => {
    trace('page-close');
    requestExit();
  });

  const cobalt = isCobaltUa();
  window.addEventListener(
    'keydown',
    (evt) => {
      if (
        evt.keyCode !== REMOTE_KEYS.BACK.keyCode ||
        isSyntheticKey(evt) ||
        isBlackedOut()
      ) {
        return;
      }
      const atRoot = shouldExitOnBack({
        panelVisible: panelState.visible,
        hash: location.hash
      });
      if (!atRoot && !cobalt) return;
      evt.preventDefault();
      evt.stopImmediatePropagation();
      if (atRoot) {
        if (!evt.repeat) {
          trace('back');
          requestExit();
        }
        return;
      }
      sendKey(REMOTE_KEYS.ESCAPE, document.activeElement ?? document.body);
    },
    true
  );
}

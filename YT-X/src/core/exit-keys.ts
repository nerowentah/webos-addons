import { panelState } from '../ui/panel-state';
import { requestExit } from '../ui/exit-dialog';
import { setPageCloseHandler } from '../platform/close-on-exit';
import { shouldExitOnBack } from './exit-on-back';
import { isBlackedOut } from '../platform/screen-off';
import { REMOTE_KEYS, isSyntheticKey, sendKey } from './keys';
import { getVideo, isShortsPage, isWatchPage } from './utils';
import { beginLeavePlayback, isLeavingPlayback } from './leave-playback';

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
 * - On a player page (watch or shorts) under the Cobalt UA, one press leaves
 *   playback (see leave-playback.ts); on the web build YouTube handles it.
 * - At the YouTube home page (every user agent) Back asks "Close YouTube-X?"
 *   instead of letting the page leave the app on its own.
 * - Under the Cobalt UA, YouTube reads Escape (27) as Back and ignores webOS's
 *   keyCode 461, so elsewhere the press is re-sent as a real Escape.
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

  const sendBack = (): void =>
    sendKey(REMOTE_KEYS.ESCAPE, document.activeElement ?? document.body);

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
      const onPlayerPage = isWatchPage() || isShortsPage();
      if (onPlayerPage && cobalt) {
        // Two Escapes: the first stops the player, the second leaves the route.
        evt.preventDefault();
        evt.stopImmediatePropagation();
        if (evt.repeat || isLeavingPlayback()) return;
        beginLeavePlayback({
          sendEscape: sendBack,
          onPlayerPage: () => isWatchPage() || isShortsPage(),
          playerStopped: () => {
            const video = getVideo();
            return !video || video.paused || video.ended;
          },
          setTimer: (fn, ms) => window.setTimeout(fn, ms),
          clearTimer: (id) => window.clearTimeout(id as number),
          now: () => Date.now()
        });
        return;
      }
      const atRoot = shouldExitOnBack({
        panelVisible: panelState.visible,
        hash: location.hash,
        onPlayerPage
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
      sendBack();
    },
    true
  );
}

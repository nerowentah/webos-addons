// Two separate signals: YouTube's idle auto-pause goes through
// HTMLVideoElement.pause (swallowed here), and the "Video paused. Continue
// watching?" dialog is a popup we must click away separately.
import { configRead } from '../../config/config';
import {
  isConfirmLabel,
  matchesContinueWatchingText
} from './keep-playing-text';
import {
  getVideo,
  isShortsPage,
  isSyntheticKey,
  isWatchPage,
  REMOTE_KEYS,
  SELECTORS,
  sendKey
} from '../../core/utils';

/** The slice of YouTube's player element this module calls. */
interface YtPlayerElement extends HTMLElement {
  playVideo?: () => void;
}

// Matches the interruption window used by lawfx/YoutubeNonStop.
const IDLE_MS = 5000;

const DIALOG_SELECTORS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  'tp-yt-paper-dialog',
  'yt-confirm-dialog-renderer',
  'ytlr-confirm-dialog-renderer',
  'ytd-popup-container'
];

const CONFIRM_SELECTOR =
  'button, yt-button-renderer, ytlr-button-renderer, [role="button"], [tabindex]';

let lastInteractionAt = Date.now();

const isUserIdle = (): boolean => Date.now() - lastInteractionAt >= IDLE_MS;

// A real remote/mouse press since the last check means the pause (and any
// dialog) is the user's own, not the inactivity prompt.
function markInteraction(e: Event): void {
  if (isSyntheticKey(e)) return;
  lastInteractionAt = Date.now();
}

function isElementVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.visibility !== 'collapse' &&
    style.opacity !== '0'
  );
}

function findDialogIn(root: ParentNode): Element | null {
  for (const sel of DIALOG_SELECTORS) {
    for (const node of root.querySelectorAll(sel)) {
      if (!isElementVisible(node)) continue;
      if (matchesContinueWatchingText(node.textContent || '')) return node;
    }
  }
  return null;
}

// The TV dialog markup is unverified, so fall back to the prompt text found in
// an ancestor of an affirmative-looking control.
function findDialogByButton(root: ParentNode): Element | null {
  for (const btn of root.querySelectorAll(CONFIRM_SELECTOR)) {
    if (!isElementVisible(btn) || !isConfirmLabel(btn.textContent || ''))
      continue;
    let node: Element | null = btn;
    for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
      const text = node.textContent || '';
      if (text.length < 400 && matchesContinueWatchingText(text)) return node;
    }
  }
  return null;
}

function findDialog(): Element | null {
  const player = document.getElementById(SELECTORS.PLAYER_ID);
  for (const root of player ? [player, document] : [document]) {
    const dialog = findDialogIn(root) || findDialogByButton(root);
    if (dialog) return dialog;
  }
  return null;
}

function findConfirmControl(dialog: Element): HTMLElement | null {
  for (const node of dialog.querySelectorAll<HTMLElement>(CONFIRM_SELECTOR)) {
    if (!isElementVisible(node)) continue;
    if (isConfirmLabel(node.textContent || '')) return node;
  }
  return null;
}

function resumePlayback(): void {
  const video = getVideo();
  if (!video || !video.paused) return;
  const player = document.getElementById(
    SELECTORS.PLAYER_ID
  ) as YtPlayerElement | null;
  if (player && typeof player.playVideo === 'function') {
    try {
      player.playVideo();
      return;
    } catch {
      /* fall through to the element API */
    }
  }
  // Old engines may return undefined from play().
  const playback = video.play() as Promise<void> | undefined;
  if (playback && typeof playback.catch === 'function') {
    playback.catch(() => {});
  }
}

let lastDismissAt = 0;

function scanForDialog(): void {
  if (!configRead('keepPlaying')) return;
  if (!isWatchPage() && !isShortsPage()) return;
  if (Date.now() - lastDismissAt < 2000) return;
  if (!isUserIdle()) return;

  const dialog = findDialog();
  if (!dialog) return;

  const control = findConfirmControl(dialog);
  if (control) {
    control.click();
  } else {
    const target = document.activeElement || document.body;
    sendKey(REMOTE_KEYS.ENTER, target);
  }

  lastDismissAt = Date.now();
  resumePlayback();
}

let scanScheduled = false;

function scheduleScan(): void {
  if (scanScheduled) return;
  scanScheduled = true;
  setTimeout(() => {
    scanScheduled = false;
    scanForDialog();
  }, 50);
}

/** Wrap `video.pause` so only an idle-triggered pause is swallowed. */
function hookVideo(video: HTMLVideoElement | null): void {
  if (!video || video.__ytxPauseHooked) return;
  video.__ytxPauseHooked = true;

  const originalPause = video.pause.bind(video);
  video.pause = () => {
    if (!configRead('keepPlaying')) return originalPause();
    // Browse previews are paused by previews.ts; leave those alone.
    if (!isWatchPage() && !isShortsPage()) return originalPause();
    if (!isUserIdle()) return originalPause();
  };
}

function attach(): void {
  hookVideo(getVideo());
}

if (typeof document !== 'undefined') {
  for (const type of [
    'keydown',
    'keyup',
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointerup',
    'touchstart',
    'wheel'
  ]) {
    document.addEventListener(type, markInteraction, true);
  }

  // Hook on play and keep the element hooked across SPA navigation (YouTube
  // swaps the <video> per video).
  document.addEventListener(
    'play',
    (e) => {
      if (e.target instanceof HTMLVideoElement) hookVideo(e.target);
    },
    true
  );

  document.addEventListener('yt-popup-opened', scheduleScan);

  const observer = new MutationObserver(() => {
    if (!configRead('keepPlaying')) return;
    if (!isWatchPage() && !isShortsPage()) return;
    scheduleScan();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  attach();
  const attachTimer = setInterval(attach, 1000);
  const scanTimer = setInterval(scanForDialog, 2000);

  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    clearInterval(attachTimer);
    clearInterval(scanTimer);
  });
}

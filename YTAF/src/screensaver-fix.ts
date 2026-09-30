/**
 * On webOS, when a video element doesn't perfectly fill
 * the entire screen, the screensaver can be kick in.
 */

import { requireElement } from './player_api/helpers';

function isPlayerHidden(video: HTMLVideoElement) {
  // Youtube uses display none sometimes along with a negative top to hide the HTMLVideoElement.
  return video.style.display == 'none' || video.style.top.startsWith('-');
}

function isWatchPage() {
  return document.body.classList.contains('WEB_PAGE_TYPE_WATCH');
}

function applyVideoSize(video: HTMLVideoElement) {
  // Not sure if there will be a race condition so just in case.
  if (isPlayerHidden(video)) return;

  const targetWidth = `${window.innerWidth}px`;
  const targetHeight = `${window.innerHeight}px`;
  const targetLeft = '0px';
  const targetTop = '0px';

  /**
   * Check to see if identical before assignment as some webOS versions will trigger a mutation
   * event even if the assignment effectively does nothing, leading to an infinite loop.
   */
  const style = video.style;
  if (style.width !== targetWidth) style.width = targetWidth;
  if (style.height !== targetHeight) style.height = targetHeight;
  if (style.left !== targetLeft) style.left = targetLeft;
  if (style.top !== targetTop) style.top = targetTop;
}

const playerCtrlObs = new MutationObserver((mutations, obs) => {
  // Only watch page has a full-screen player.
  if (!isWatchPage()) {
    obs.disconnect();
    return;
  }

  const video = mutations[0]?.target;
  if (!(video instanceof HTMLVideoElement)) throw new Error();
  applyVideoSize(video);
});

let videoObserverBusy = false;

async function ensureVideoObserver() {
  // YouTube TV reuses the same video element for everything. Guard against
  // stacking concurrent waits when the body class changes while one is running.
  if (videoObserverBusy) return;
  videoObserverBusy = true;

  try {
    if (!isWatchPage()) return;

    // Don't wait indefinitely if the video element never appears; bail out
    // instead of leaking the pending `requireElement` promise.
    const video = await Promise.race([
      requireElement('video', HTMLVideoElement),
      new Promise<HTMLVideoElement>((_, reject) =>
        setTimeout(
          () => reject(new Error('video element never appeared')),
          15000
        )
      )
    ]).catch(() => document.querySelector('video') ?? null);

    if (!video) {
      console.warn('Video element not found; screensaver guard not applied.');
      return;
    }

    // Cover the case where the watch page was already current when this script
    // ran (deep-link/relaunch straight into a video): size the video once.
    applyVideoSize(video);

    playerCtrlObs.observe(video, {
      attributes: true,
      attributeFilter: ['style']
    });
  } finally {
    videoObserverBusy = false;
  }
}

const bodyAttrObs = new MutationObserver(() => {
  void ensureVideoObserver();
});

// Also re-apply when the viewport changes (e.g. the TV's output resolution
// changes mid-session); a video left sized to the old dimensions can let the
// screensaver kick in again.
window.addEventListener('resize', () => {
  if (!isWatchPage()) return;
  const video = document.querySelector('video');
  if (video instanceof HTMLVideoElement) applyVideoSize(video);
});

bodyAttrObs.observe(document.body, {
  attributes: true,
  attributeFilter: ['class']
});

void ensureVideoObserver();

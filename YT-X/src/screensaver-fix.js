/**
 * webOS starts the screensaver when a video does not fill the screen; also asks the TV's power service not to start it while a video plays (best effort; see registerScreenSaverRequest).
 */

import {
  waitForChildAdd,
  sendKey,
  SELECTORS,
  REMOTE_KEYS,
  isWatchPage,
  isShortsPage,
  getVideo
} from './utils.js';

function isPlayerHidden(video) {
  return (
    video.style.display == 'none' ||
    (video.style.top && video.style.top.indexOf('-') === 0)
  );
}

let lastPageType = null;
let shortsKeepAliveTimer = null;
const STATE_PLAYING = 1;

function setShortsKeepAlive(enable) {
  if (enable) {
    if (shortsKeepAliveTimer) return;
    shortsKeepAliveTimer = window.setInterval(() => {
      const player = document.getElementById(SELECTORS.PLAYER_ID);
      const isPlaying =
        player &&
        typeof player.getPlayerState === 'function' &&
        player.getPlayerState() === STATE_PLAYING;
      if (!isPlaying) return;

      // activeElement is document.body when nothing else has focus, null only pre-load.
      const target = document.activeElement || document.body;

      sendKey(REMOTE_KEYS.YELLOW, target);
    }, 30000);
  } else if (shortsKeepAliveTimer) {
    clearInterval(shortsKeepAliveTimer);
    shortsKeepAliveTimer = null;
  }
}

let rafPending = false;
let rafTargetVideo = null;

const playerCtrlObs = new MutationObserver((mutations) => {
  // Only watch page has a full-screen player fix logic.
  if (lastPageType !== 'WATCH') {
    playerCtrlObs.disconnect();
    return;
  }

  const video = mutations[0]?.target;
  // Both of these are normal during navigation teardown, not error conditions.
  if (!video || !(video instanceof HTMLVideoElement) || !video.isConnected) {
    playerCtrlObs.disconnect();
    // The page may still be the watch page with a new <video>; ytx-page-update fires only on a page-type change, so look again.
    setTimeout(updateState, 0);
    return;
  }

  // Coalesce mutation bursts into one rAF: each write forces a reflow, so read
  // window dimensions and diff the styles only once per frame.
  rafTargetVideo = video;
  if (rafPending) return;
  rafPending = true;

  requestAnimationFrame(() => {
    rafPending = false;
    const v = rafTargetVideo;
    rafTargetVideo = null;
    if (!v || !v.isConnected || lastPageType !== 'WATCH') return;
    if (isPlayerHidden(v)) return;

    const style = v.style;
    const tw = `${window.innerWidth}px`;
    const th = `${window.innerHeight}px`;
    try {
      // Some webOS versions fire a mutation even when assignment is a no-op,
      // causing an infinite loop — only write when the value actually differs.
      if (style.width !== tw) style.width = tw;
      if (style.height !== th) style.height = th;
      if (style.left !== '0px') style.left = '0px';
      if (style.top !== '0px') style.top = '0px';
    } catch {
      // Style writes can throw on a detached element; stop observing so a failing pass cannot loop.
      playerCtrlObs.disconnect();
    }
  });
});

// The Yellow-key keep-alive is ignored by some TVs (NicholasBly/youtube-webos#46),
// so the power service lets a registered client hold the screensaver off while a
// video plays; best effort - PalmServiceBridge may be missing or the call refused.
const TVPOWER_URI = 'luna://com.webos.service.tvpower/power/';
const SCREENSAVER_CLIENT = 'youtube-extended';
// A bridge collected before its answer arrives drops the answer; keep each one-shot call referenced until its callback ran.
const pendingLunaCalls = [];

function lunaCall(method, params, onResponse, subscribe) {
  const Bridge =
    typeof window !== 'undefined' ? window.PalmServiceBridge : null;
  if (typeof Bridge !== 'function') return null;
  try {
    const bridge = new Bridge();
    if (!subscribe) pendingLunaCalls.push(bridge);
    bridge.onservicecallback = (msg) => {
      if (!subscribe) {
        const i = pendingLunaCalls.indexOf(bridge);
        if (i !== -1) pendingLunaCalls.splice(i, 1);
      }
      if (!onResponse) return;
      let res = null;
      try {
        res = JSON.parse(msg);
      } catch {
        /* not JSON */
      }
      try {
        onResponse(res);
      } catch {
        // A throwing response handler must not break the luna callback.
      }
    };
    bridge.call(TVPOWER_URI + method, JSON.stringify(params));
    return bridge;
  } catch {
    return null;
  }
}

function isVideoPlaying() {
  if (lastPageType !== 'WATCH' && lastPageType !== 'SHORTS') return false;
  const video = getVideo();
  return !!(video && !video.paused && !video.ended);
}

// Held for the session: the subscription lasts as long as its bridge.
let screenSaverSubscription = null;

function registerScreenSaverRequest() {
  screenSaverSubscription = lunaCall(
    'registerScreenSaverRequest',
    { subscribe: true, clientName: SCREENSAVER_CLIENT },
    (res) => {
      if (!res || res.returnValue === false) {
        return;
      }
      // The first answer only confirms the subscription; each screensaver the TV is about to start comes with a timestamp to answer.
      if (res.timestamp === undefined) return;
      const playing = isVideoPlaying();
      lunaCall('responseScreenSaverRequest', {
        clientName: SCREENSAVER_CLIENT,
        ack: !playing,
        timestamp: res.timestamp
      });
    },
    true
  );
}

registerScreenSaverRequest();

let currentVideoElement = null;

const holdsVideo = (node) =>
  node instanceof HTMLVideoElement ||
  !!(node.querySelector && node.querySelector('video'));

// The pending wait for a <video>, cancelled on a page change so its observer does not outlive the page.
let videoWait = null;

function unbindVideo() {
  playerCtrlObs.disconnect();
  currentVideoElement = null;
}

// The watch page's <video>, waited for when it has not mounted yet; null when it never does (left the page, or the 30s wait ran out).
async function findWatchVideo() {
  const playerContainer = document.getElementById(SELECTORS.PLAYER_CONTAINER);
  const searchRoot = playerContainer || document.body;

  // Shared cached lookup (isConnected-guarded, invalidated on page change).
  const found = getVideo() || searchRoot.querySelector('video');
  if (found) return found;

  const controller = new AbortController();
  videoWait = controller;
  try {
    const node = await waitForChildAdd(
      searchRoot,
      holdsVideo,
      false,
      controller.signal
    );
    return node instanceof HTMLVideoElement
      ? node
      : node.querySelector('video');
  } catch {
    return null;
  } finally {
    if (videoWait === controller) videoWait = null;
  }
}

async function bindWatchVideo() {
  try {
    const video = await findWatchVideo();

    // Double check we are still on Watch page after await
    if (!video || lastPageType !== 'WATCH' || video === currentVideoElement)
      return;

    if (currentVideoElement) playerCtrlObs.disconnect();
    currentVideoElement = video;

    if (video.isConnected) {
      playerCtrlObs.observe(video, {
        attributes: true,
        attributeFilter: ['style']
      });
    }
  } catch {
    // Attaching the observer is best-effort; the next page update retries.
  }
}

const updateState = async () => {
  const isWatch = isWatchPage();
  const isShorts = isShortsPage();

  const newPageType = isWatch ? 'WATCH' : isShorts ? 'SHORTS' : 'OTHER';

  if (newPageType === lastPageType) {
    // Watch to watch: bind a remounted <video>, or one that mounted after the wait ran out; an in-flight wait is left to find it.
    if (newPageType !== 'WATCH') return;
    if (currentVideoElement ? currentVideoElement.isConnected : videoWait)
      return;
    unbindVideo();
  }
  lastPageType = newPageType;

  if (videoWait) {
    videoWait.abort();
    videoWait = null;
  }

  setShortsKeepAlive(newPageType === 'SHORTS');

  if (newPageType === 'WATCH') await bindWatchVideo();
  else unbindVideo();
};

window.addEventListener('ytx-page-update', updateState);
// A video-to-video navigation keeps the page type and may replace the <video>.
window.addEventListener('hashchange', updateState);

if (document.body) updateState();
else document.addEventListener('DOMContentLoaded', updateState);

window.addEventListener('beforeunload', () => {
  playerCtrlObs.disconnect();
  window.removeEventListener('ytx-page-update', updateState);
  window.removeEventListener('hashchange', updateState);
  if (videoWait) videoWait.abort();
  if (screenSaverSubscription) {
    try {
      screenSaverSubscription.cancel();
    } catch {
      /* ignore */
    }
    screenSaverSubscription = null;
  }
  currentVideoElement = null;
  setShortsKeepAlive(false);
});

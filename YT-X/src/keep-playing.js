// YouTube's idle auto-pause goes through HTMLVideoElement.pause, the same call a
// deliberate press makes; only the idle one (no recent real input) is swallowed.
import { configRead } from './config.js';
import { getVideo, isShortsPage, isWatchPage } from './utils.js';

// Comfortably longer than the OSD/remote cadence so a real pause isn't mistaken
// for the inactivity auto-pause.
const IDLE_MS = 30000;

let lastInteractionAt = Date.now();

function markInteraction() {
  lastInteractionAt = Date.now();
}

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

/** Wrap `video.pause` so only an idle-triggered pause is swallowed. */
function hookVideo(video) {
  if (!video || video.__ytxPauseHooked) return;
  video.__ytxPauseHooked = true;

  const originalPause = video.pause.bind(video);
  video.pause = () => {
    if (!configRead('keepPlaying')) return originalPause();
    // Browse previews are paused by previews.js; leave those alone.
    if (!isWatchPage() && !isShortsPage()) return originalPause();
    if (Date.now() - lastInteractionAt < IDLE_MS) return originalPause();
  };
}

function attach() {
  hookVideo(getVideo());
}

// Hook on play and keep the element hooked across SPA navigation (YouTube swaps
// the <video> per video).
document.addEventListener(
  'play',
  (e) => {
    const target = e.target;
    if (target && target.tagName === 'VIDEO') hookVideo(target);
  },
  true
);

attach();
setInterval(attach, 1000);

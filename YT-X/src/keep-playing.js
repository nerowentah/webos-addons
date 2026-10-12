/**
 * Keep Playing.
 *
 * YouTube's TV client pauses playback and shows the "Video paused. Continue
 * watching?" prompt once it stops seeing user activity (30 minutes on mobile,
 * 60 on web, 180 on TV). That pause is issued through `HTMLVideoElement.pause`,
 * the same call a deliberate remote press makes, so we can tell the two apart by
 * how long it has been since real input and swallow the idle one.
 *
 * Earlier this feature dispatched a synthetic key on a 10s tick to keep the
 * client's activity timer warm. Any key input surfaces the on-screen
 * controls/OSD, so that approach made the controls (and the volume/progress
 * bar) pop back up every tick even when no one was touching the remote. Blocking
 * the idle-initiated pause avoids the synthetic input entirely, so the OSD
 * stays down.
 *
 * Only real input counts as activity: listeners are registered in the capture
 * phase for the events a remote or pointer actually produces. This addresses
 * the inactivity trigger only - a pause caused by, e.g., a Bluetooth audio
 * reconnect is not an idle timeout and is left alone.
 */
import { configRead } from './config.js';
import { getVideo, isShortsPage, isWatchPage } from './utils.js';

// How long without real input before a pause is treated as the client's
// inactivity auto-pause rather than a deliberate remote press. Comfortably
// longer than the OSD/remote cadence so a real pause is never mistaken for it.
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

/**
 * Wrap `video.pause` so an idle-triggered pause is swallowed.
 *
 * A deliberate pause is preceded by a key/pointer event, so it lands within
 * `IDLE_MS` of `lastInteractionAt` and is handed to the original method. Only a
 * pause with no recent input - the inactivity auto-pause - is dropped, which
 * leaves the client happily playing and its "Continue watching?" prompt unarmed.
 */
function hookVideo(video) {
  if (!video || video.__ytxPauseHooked) return;
  video.__ytxPauseHooked = true;

  const originalPause = video.pause.bind(video);
  video.pause = () => {
    if (!configRead('keepPlaying')) return originalPause();
    // Browse previews are paused by previews.js; leave those alone.
    if (!isWatchPage() && !isShortsPage()) return originalPause();
    // Recent real input means the user asked for this pause.
    if (Date.now() - lastInteractionAt < IDLE_MS) return originalPause();
    // Idle auto-pause: drop it so playback continues.
  };
}

function attach() {
  hookVideo(getVideo());
}

// Hook on the element as soon as a real video starts, and keep the current
// element hooked across SPA navigation (YouTube swaps the <video> per video).
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

/**
 * Inline "hover preview" mitigation, matching the official client's teardown
 * behavior. On this panel the hardware video plane cannot compose scaled,
 * sub-windowed video, so a preview pipeline decodes audio but never paints;
 * the empty hole reads as a black tile with a burst of orphaned audio.
 *
 * The official Leanback client tears these pipelines down and muting is
 * exactly what the muted state is for: preview must be silent. We do the same
 * - mute + pause the preview the instant it starts, re-assert on a short tick
 * because YouTube keeps re-wiring the element, and hand the player back
 * unmuted when a real watch page takes over.
 */
import { isWatchPage, isShortsPage, getVideo } from './utils.js';

let mutingBrowsePreview = false;

function silencePreview(video) {
  if (isWatchPage() || isShortsPage()) return;
  video.muted = true;
  if (!video.paused) video.pause();
  mutingBrowsePreview = true;
}

// Kill the transient audio the moment a preview <video> starts on browse.
document.addEventListener(
  'play',
  (e) => {
    const target = e.target;
    if (target && target.tagName === 'VIDEO' && target === getVideo()) {
      silencePreview(target);
    }
  },
  true
);

// Re-assert on a tick: YouTube swaps the element in and out; one sweep per
// interval guarantees a stray pipeline is muted and paused within 500ms.
setInterval(() => {
  const video = getVideo();
  const onWatch = isWatchPage() || isShortsPage();
  if (!onWatch && video) {
    silencePreview(video);
  } else if (onWatch && mutingBrowsePreview) {
    // We were muting a preview; hand the player back to watch unmuted.
    mutingBrowsePreview = false;
    if (video) video.muted = false;
  }
}, 500);

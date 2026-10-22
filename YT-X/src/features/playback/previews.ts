// The panel's video plane cannot compose scaled sub-windowed video, so a browse
// preview decodes audio but paints nothing; mute + pause it and restore on watch.
import { isWatchPage, isShortsPage, getVideo } from '../../core/utils';

let mutingBrowsePreview = false;

function silencePreview(video: HTMLVideoElement): void {
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
    if (target instanceof HTMLVideoElement && target === getVideo()) {
      silencePreview(target);
    }
  },
  true
);

// Re-assert on a tick: YouTube keeps re-wiring the element.
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

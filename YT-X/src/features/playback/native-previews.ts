// Native Cobalt only (native-main.ts; the webOS browser uses previews.ts). Its player
// composes the sub-windowed browse preview, so previews are left playing and only two
// page-side problems are repaired here.
import { claimHook } from '../../core/hook-once';
import { getVideo, isShortsPage, isWatchPage } from '../../core/utils';

// Native: the tile's thumbnail layer (`.fade-out-during-inline`) is meant to fade out
// when the preview starts, but nothing fades it, so it stays opaque over the video
// plane and the preview is heard but not seen. Lift the layer that sits on the
// playing preview, and put it back as soon as the preview stops or moves.
const LAYER = '.fade-out-during-inline';
const SAME_RECT_PX = 2;
const lifted: HTMLElement[] = [];

function sameRect(a: DOMRect, b: DOMRect): boolean {
  return (
    Math.abs(a.left - b.left) <= SAME_RECT_PX &&
    Math.abs(a.top - b.top) <= SAME_RECT_PX &&
    Math.abs(a.width - b.width) <= SAME_RECT_PX &&
    Math.abs(a.height - b.height) <= SAME_RECT_PX
  );
}

function restoreLayers(): void {
  for (const layer of lifted.splice(0)) layer.style.opacity = '';
}

function liftLayerOver(video: HTMLVideoElement): void {
  const box = video.getBoundingClientRect();
  const layers = document.querySelectorAll<HTMLElement>(LAYER);
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!layer || lifted.includes(layer)) continue;
    if (!sameRect(layer.getBoundingClientRect(), box)) continue;
    layer.style.opacity = '0';
    lifted.push(layer);
  }
}

if (claimHook('native-preview-lift')) {
  setInterval(() => {
    const video = getVideo();
    const previewing =
      video !== null && !video.paused && !isWatchPage() && !isShortsPage();
    if (!previewing) {
      if (lifted.length > 0) restoreLayers();
      return;
    }
    // A tile that no longer lines up with the video was re-rendered or lost focus.
    const box = video.getBoundingClientRect();
    for (const layer of lifted.splice(0)) {
      if (sameRect(layer.getBoundingClientRect(), box)) lifted.push(layer);
      else layer.style.opacity = '';
    }
    liftLayerOver(video);
  }, 250);
}

// Native: entering a video from a preview can leave `ytlr-player` on the preview's
// inline transform (translate + scale 0.375) after the page is already the watch page
// and the player reports plain playback, so the video plays in the preview rectangle
// while the app believes it is full screen. YouTube writes the final transform
// straight into the style attribute, so a scale still below 1 on the watch page for
// longer than the entry animation is that stuck state; set the full-screen transform.
const FULL_SCREEN_TRANSFORM =
  'translateX(0px) translateY(0px) scaleX(1) scaleY(1)';
const STUCK_AFTER_MS = 1500;
const SCALE_RE = /scaleX\(([\d.]+)\)\s*scaleY\(([\d.]+)\)/;
let stuckSince = 0;

function repairStuckPlayer(): void {
  const player = document.querySelector<HTMLElement>('ytlr-player');
  const scale = SCALE_RE.exec(player?.getAttribute('style') ?? '');
  const shrunk = scale !== null && parseFloat(scale[1] ?? '1') < 0.99;
  if (!player || !isWatchPage() || !shrunk) {
    stuckSince = 0;
    return;
  }
  const now = Date.now();
  if (stuckSince === 0) stuckSince = now;
  if (now - stuckSince < STUCK_AFTER_MS) return;
  player.style.setProperty('transform', FULL_SCREEN_TRANSFORM);
  stuckSince = 0;
}

if (claimHook('native-player-repair')) {
  setInterval(repairStuckPlayer, 500);
}

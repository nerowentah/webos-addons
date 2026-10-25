import { configAddChangeListener, configRead } from '../../config/config';
import { NOTIFICATIONS } from '../../config/ui-text';
import { getVideo } from '../../core/utils';
import { showNotification } from '../../ui/notifications';
import { getPlayerManager, PlayerMode } from '../../youtube/player_api';
import type { PlayerManager } from '../../youtube/player_api';
import { rateForMode, rateWasHonoured } from './speed-check';

// Playback Speed: asks the player for the chosen rate when playback starts and
// when the setting changes. Whether the platform honours it is only known by
// watching the media clock, so a short check follows each change of rate; a
// platform that ignores it (the webOS browser's hardware path) is put back to
// 1x with one toast, instead of a setting that silently does nothing.
const CHECK_DELAY_MS = 1500;
const CHECK_WINDOW_MS = 2500;

// A page without a player (the wait times out) just goes without this feature.
const playerManager = await getPlayerManager().catch(() => null);

let unsupported = false;
let checkToken = 0;

function wantedRate(): number {
  return unsupported ? 1 : rateForMode(configRead('playbackSpeed'));
}

/** After a settle delay, compares media time with wall time over a window. */
function verifyRate(manager: PlayerManager, rate: number): void {
  const token = ++checkToken;
  if (rate === 1) return;

  window.setTimeout(() => {
    const video = getVideo();
    if (token !== checkToken || !video || video.paused) return;
    // YouTube resets the rate while the media loads, after playback has started.
    if (manager.player.getPlaybackRate() !== rate) {
      manager.player.setPlaybackRate(rate);
    }
    const media0 = video.currentTime;
    const wall0 = performance.now();

    window.setTimeout(() => {
      if (token !== checkToken || video.paused) return;
      const wall = (performance.now() - wall0) / 1000;
      if (rateWasHonoured(rate, video.currentTime - media0, wall)) return;

      unsupported = true;
      manager.player.setPlaybackRate(1);
      showNotification(NOTIFICATIONS.speedUnsupported, 4000);
    }, CHECK_WINDOW_MS);
  }, CHECK_DELAY_MS);
}

/** `changed` is a settings change, which must also be able to put the rate back to 1x. */
function apply(manager: PlayerManager, changed: boolean): void {
  if (manager.playerMode === PlayerMode.PREVIEW) return;
  const rate = wantedRate();
  // Leave YouTube's own rate alone while the setting sits at its default.
  if (rate === 1 && !changed) return;
  manager.player.setPlaybackRate(rate);
  verifyRate(manager, rate);
}

if (playerManager) {
  playerManager.addEventListener('playbackStart', () => {
    apply(playerManager, false);
  });
  configAddChangeListener('playbackSpeed', () => {
    // A new choice deserves a new check, even after an earlier refusal.
    unsupported = false;
    apply(playerManager, true);
  });
}

import { configRead } from '../../config/config';
import { getPlayerManager, PlayerMode } from '../../youtube/player_api';
import type { EventMapOf, PlayerManager } from '../../youtube/player_api';
import { showNotification } from '../../ui/ui';
import { NOTIFICATIONS } from '../../config/ui-text';

// Playback-rate hypothesis, not yet measured on a TV: YouTube may drop the optimal
// representation once the rate is applied (50 fps x 1.25 exceeds a 60 fps ceiling),
// and nothing here listens for `ratechange` to re-assert the choice. Measure at
// 1.0x and 1.25x with Default Max Resolution on and off before adding code (the
// manual list in tools/verify-ytx.ts). Cobalt's fractional-bitrate MIME parser
// defect (RF1705 #46) is native-only and cannot occur in the web app.
//
// A page without a player (the wait times out) just goes without these features.
const playerManager = await getPlayerManager().catch(() => null);

function shouldForce() {
  return configRead('forceHighResVideo');
}

type EventMap = EventMapOf<PlayerManager>;

function getMaxQualityLabel(player: PlayerManager['player']) {
  return player.getAvailableQualityData()[0]?.qualityLabel;
}

function notifyPlaybackQuality(this: PlayerManager) {
  if (!shouldForce()) return;

  const player = this.player;

  const selected = player.getPlaybackQualityLabel();
  const max = getMaxQualityLabel(player);

  if (max !== undefined) {
    showNotification(NOTIFICATIONS.selectedMax(selected, max), 3000);
  }

  this.removeEventListener('playbackStart', notifyPlaybackQuality);
}

function setPlaybackQuality(this: PlayerManager, _: unknown) {
  if (this.playerMode === PlayerMode.PREVIEW) return;

  this.removeEventListener('playbackStart', setPlaybackQuality);

  const prevQuality = this.player.getPlaybackQualityLabel();
  this.player.setPlaybackQualityRange('highres', 'highres');

  if (prevQuality === getMaxQualityLabel(this.player)) {
    notifyPlaybackQuality.call(this);
    return;
  }

  const timeoutToken = window.setTimeout(() => {
    clearInterval(intervalToken);
    notifyPlaybackQuality.call(this);
  }, 3000);

  // No reliable event for quality change, so poll for it
  const intervalToken = window.setInterval(() => {
    const currQuality = this.player.getPlaybackQualityLabel();
    if (currQuality !== prevQuality) {
      notifyPlaybackQuality.call(this);
      clearInterval(intervalToken);
      clearTimeout(timeoutToken);
    }
  }, 100);
}

function handleNewVideo(this: PlayerManager, _: EventMap['newVideo']) {
  if (!shouldForce()) return;

  this.removeEventListener('playbackStart', setPlaybackQuality);
  this.addEventListener('playbackStart', setPlaybackQuality);
}

/** Show Video Quality on Start toast, delayed until adaptive/Force-Max negotiation settles. */
const QUALITY_TOAST_DELAY_MS = 4000;

let qualityToastVideoID: string | null = null;
let qualityToastTimer: number | undefined;

function clearQualityToastTimer() {
  if (qualityToastTimer !== undefined) {
    window.clearTimeout(qualityToastTimer);
    qualityToastTimer = undefined;
  }
}

function showQualityOnStart(this: PlayerManager) {
  if (!configRead('showQualityOnStart')) return;
  if (this.playerMode === PlayerMode.PREVIEW) return;

  const videoID = this.currentVideoID;
  if (!videoID || videoID === qualityToastVideoID) return;

  // Claim the video before the delay, so a pause/resume burst doesn't queue duplicate toasts.
  qualityToastVideoID = videoID;
  clearQualityToastTimer();

  qualityToastTimer = window.setTimeout(() => {
    qualityToastTimer = undefined;
    if (this.currentVideoID !== videoID) return;
    if (!this.player.getPlayerStateObject().isPlaying) {
      // Paused or buffering again: release the claim so the next playbackStart retries.
      qualityToastVideoID = null;
      return;
    }
    const label = this.player.getPlaybackQualityLabel();
    if (label) showNotification(NOTIFICATIONS.playingIn(label), 3000);
  }, QUALITY_TOAST_DELAY_MS);
}

playerManager?.addEventListener('newVideo', handleNewVideo);
playerManager?.addEventListener('playbackStart', showQualityOnStart);

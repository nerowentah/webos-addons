import { configRead } from './config';
import { getPlayerManager, PlayerMode } from './player_api';
import type { EventMapOf, PlayerManager } from './player_api';
import { showNotification } from './ui';
import { NOTIFICATIONS } from './ui-text';

const playerManager = await getPlayerManager();

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

  showNotification(NOTIFICATIONS.selectedMax(selected, max), 3000);

  this.removeEventListener('playbackStart', notifyPlaybackQuality);
}

function setPlaybackQuality(this: PlayerManager, _: unknown) {
  if (this.playerMode === PlayerMode.PREVIEW) return;

  console.debug('[video-quality] setting playback quality');
  this.removeEventListener('playbackStart', setPlaybackQuality);

  const prevQuality = this.player.getPlaybackQualityLabel();
  this.player.setPlaybackQualityRange('highres', 'highres');

  if (prevQuality === getMaxQualityLabel(this.player)) {
    notifyPlaybackQuality.call(this);
    return;
  }

  const timeoutToken = window.setTimeout(() => {
    console.warn('[video-quality] timed out waiting for quality change');
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

/**
 * Show Video Quality on Start.
 *
 * A few seconds after a video starts, a toast names the quality it settled on
 * (for example "Playing in 1080p60"). The delay lets the adaptive stream - and
 * Force Max Quality, when it is on - finish their negotiation first, so the
 * number shown is the one playback actually runs at rather than the opening
 * guess.
 */
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

  // Claim the video before the delay, so a pause/resume burst inside the
  // window does not queue several toasts for the same video.
  qualityToastVideoID = videoID;
  clearQualityToastTimer();

  qualityToastTimer = window.setTimeout(() => {
    qualityToastTimer = undefined;
    if (this.currentVideoID !== videoID) return;
    if (!this.player.getPlayerStateObject().isPlaying) {
      // Paused or buffering again: release the claim so the next playbackStart
      // on this video makes a fresh attempt.
      qualityToastVideoID = null;
      return;
    }
    const label = this.player.getPlaybackQualityLabel();
    if (label) showNotification(NOTIFICATIONS.playingIn(label), 3000);
  }, QUALITY_TOAST_DELAY_MS);
}

playerManager.addEventListener('newVideo', handleNewVideo);
playerManager.addEventListener('playbackStart', showQualityOnStart);

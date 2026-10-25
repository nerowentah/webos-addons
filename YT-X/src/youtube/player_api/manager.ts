import {
  CustomEventTarget,
  TypedCustomEvent
} from '../../core/custom-event-target';
import { recordFailure } from '../../core/diag';
import { getPlayer } from './helpers';
import type { PlayerStateObject, VideoID, YTPlayer } from './yt-api';

function diffPlayerState(
  prev: PlayerStateObject | null,
  next: PlayerStateObject
) {
  if (!prev) return next;

  const changes: Partial<PlayerStateObject> = {};

  for (const k in next) {
    const key = k as keyof PlayerStateObject;
    if (next[key] !== prev[key]) {
      changes[key] = next[key];
    }
  }

  return changes;
}

interface EventMap {
  newVideo: CustomEvent<VideoID>;
  playbackStart: CustomEvent<undefined>;
}

export enum PlayerMode {
  PREVIEW,
  SHORTS,
  NORMAL
}

class PlayerManager
  extends CustomEventTarget<EventMap>
  implements PlayerManager
{
  #player;
  #lastVideoID: VideoID | null = null;
  #lastPlayerState: PlayerStateObject | null = null;

  #handleNewVideo(videoID: VideoID) {
    this.dispatchEvent(new TypedCustomEvent('newVideo', { detail: videoID }));
  }

  /** Registered on YouTube's own player, so nothing may escape it (see #updatePlayerState). */
  #handlePlayerStateChange = () => {
    try {
      this.#updatePlayerState();
    } catch (error) {
      recordFailure('player-state', error);
    }
  };

  #updatePlayerState() {
    const current = this.#player.getPlayerStateObject();
    const diff = diffPlayerState(
      this.#lastPlayerState,
      this.#player.getPlayerStateObject()
    );
    this.#lastPlayerState = current;

    // Assume video ID hasn't changed if diff is empty.
    if (Object.keys(diff).length === 0) return;

    const currentVideoID = this.currentVideoID;
    if (this.#lastVideoID !== currentVideoID) {
      // A state change before the video id is known has nothing to announce yet. Never throw here: this runs inside YouTube's own player listeners, and an exception left its play/pause button on the paused glyph while the video played.
      if (!currentVideoID) return;
      this.#handleNewVideo(currentVideoID);
      this.#lastVideoID = currentVideoID;
    }

    if (diff.isPlaying) {
      this.dispatchEvent(
        new TypedCustomEvent<'playbackStart'>('playbackStart')
      );
    }
  }

  constructor(player: YTPlayer) {
    super();
    this.#player = player;

    player.addEventListener('onStateChange', this.#handlePlayerStateChange);
  }

  get currentVideoID(): VideoID | null {
    return this.#player.getVideoData().video_id || null;
  }

  get playerMode() {
    if (this.#player.isInline()) return PlayerMode.PREVIEW;

    if (this.#player.getVideoStats().el === 'shortspage') {
      return PlayerMode.SHORTS;
    }

    return PlayerMode.NORMAL;
  }

  get player(): YTPlayer {
    return this.#player;
  }
}

let instance: PlayerManager | null = null;

export async function getPlayerManager(): Promise<PlayerManager> {
  if (!instance) {
    const player = await getPlayer();
    instance = new PlayerManager(player);
  }

  return instance;
}

export type { PlayerManager };

enum PlayerState {
  UNSTARTED = -1,
  ENDED = 0,
  PLAYING = 1,
  PAUSED = 2,
  BUFFERING = 3,
  CUED = 5
}

interface YTPlayerEventMap extends HTMLElementEventMap {
  onStateChange: PlayerState;
}

interface VideoQualityData {
  qualityLabel: string;
  quality: string;
  isPlayable: boolean;
}

export type VideoID = string;

interface VideoData {
  video_id: VideoID | undefined;
}

type PlayerStateKeys =
  | 'isBuffering'
  | 'isCued'
  | 'isDomPaused'
  | 'isEnded'
  | 'isError'
  | 'isOrWillBePlaying'
  | 'isPaused'
  | 'isPlaying'
  | 'isSeeking'
  | 'isUiSeeking'
  | 'isUnstarted';

export type PlayerStateObject = Record<PlayerStateKeys, boolean>;

interface VideoStats {
  el?: 'shortspage';
}

export interface YTPlayer extends HTMLElement {
  addEventListener<K extends keyof YTPlayerEventMap>(
    type: K,
    listener: (this: YTPlayer, ev: YTPlayerEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;

  removeEventListener<K extends keyof YTPlayerEventMap>(
    type: K,
    listener: (this: YTPlayer, ev: YTPlayerEventMap[K]) => void,
    options?: boolean | EventListenerOptions
  ): void;

  getPlaybackQualityLabel(): string; // empty if not available

  /** Not available until the first `isPlaying` state; empty if not available. */
  getAvailableQualityData(): VideoQualityData[];

  setPlaybackQualityRange(min: string, max: string, formatId?: string): void;

  /** 1 is normal speed; the platform may ignore a change (see playback-speed.ts). */
  setPlaybackRate(rate: number): void;

  getPlaybackRate(): number;

  getVideoData(): VideoData;

  getPlayerStateObject(): PlayerStateObject;

  isInline(): boolean;

  getVideoStats(): VideoStats;
}

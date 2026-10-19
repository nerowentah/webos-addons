export enum PlayerState {
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

export interface VideoData {
  video_id: VideoID | undefined;
}

export type PlayerStateKeys =
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

export interface VideoStats {
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

  getVideoData(): VideoData;

  getPlayerStateObject(): PlayerStateObject;

  isInline(): boolean;

  getVideoStats(): VideoStats;
}

// How soon a changed setting takes effect. Pure data, so a new option cannot be
// added to the config without saying (the Record type enforces every key).
import type { ConfigKey } from './config';

/**
 * - instant: the code re-reads the value (or listens), so it acts at once.
 * - next-load: it filters server responses, so only content fetched from now on is affected.
 */
export type Liveness = 'instant' | 'next-load';

export const LIVENESS: Record<ConfigKey, Liveness> = {
  enableAdBlock: 'next-load',
  keepPlaybackTracking: 'next-load',
  removeShorts: 'next-load',
  removeMembersOnly: 'next-load',
  removeLiveVideos: 'next-load',
  removeUpcomingVideos: 'next-load',
  removeTopLiveGames: 'next-load',
  removeMostRelevant: 'next-load',
  enableTrackingBlock: 'next-load',
  disableAutoCaptions: 'next-load',
  loadRowsAhead: 'next-load',
  keyboardSearch: 'instant',
  enableSponsorBlock: 'next-load',
  enableMutedSegments: 'next-load',
  sbPeriodicRefresh: 'instant',
  enableSponsorBlockSponsor: 'next-load',
  enableSponsorBlockIntro: 'next-load',
  enableSponsorBlockOutro: 'next-load',
  enableSponsorBlockInteraction: 'next-load',
  enableSponsorBlockSelfPromo: 'next-load',
  enableSponsorBlockMusicOfftopic: 'next-load',
  enableSponsorBlockPreview: 'next-load',
  hideLogo: 'instant',
  pointerSettingsButton: 'instant',
  forceHighResVideo: 'next-load',
  showQualityOnStart: 'instant',
  showTimeRemaining: 'instant',
  blockWebosCast: 'instant',
  removeEndscreen: 'next-load',
  keepPlaying: 'instant',
  autoAccountSelect: 'instant',
  panelCareMode: 'instant',
  disableAnimations: 'instant',
  forceVideoCodec: 'next-load',
  uiTextScale: 'instant',
  skipSegmentsOnce: 'instant',
  enableSponsorBlockFiller: 'next-load',
  enableSponsorBlockHook: 'next-load',
  enableSponsorBlockHighlight: 'next-load'
};

export const NEXT_LOAD_NOTICE = 'Applies to content loaded from now on';

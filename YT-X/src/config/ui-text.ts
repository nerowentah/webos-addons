import type { ConfigKey } from './config';
import type { SegmentCategory } from '../features/sponsorblock/categories';

// Central registry of user-visible strings; kept DOM/config-free for the plain-Node
// check. Caps: MAX_LABEL_TEXT (28) fits a 3-column cell, MAX_UI_TEXT (40) the rest.
export const MAX_UI_TEXT = 40;
export const MAX_LABEL_TEXT = 28;

/** Checkbox descriptions, keyed by config option key. */
export const UI_LABELS = {
  enableAdBlock: 'Ad Blocking',
  keepPlaybackTracking: 'Keep Watch History (Metrics)',
  removeShorts: 'Remove Shorts',
  removeMembersOnly: 'Remove Members-Only Videos',
  removeLiveVideos: 'Remove Live Videos',
  removeUpcomingVideos: 'Remove Upcoming Videos',
  removeTopLiveGames: 'Remove Top Live Games',
  removeMostRelevant: 'Remove Most Relevant Videos',
  enableTrackingBlock: 'Reduce Telemetry',
  disableAutoCaptions: 'Disable Auto Captions',
  loadRowsAhead: 'Preload Content (Browsing)',
  keyboardSearch: 'Keyboard Support',
  enableSponsorBlock: 'SponsorBlock',
  enableMutedSegments: 'Allow Muted Segments',
  sbPeriodicRefresh: 'Periodic Refresh',
  enableSponsorBlockSponsor: 'Skip Sponsor',
  enableSponsorBlockIntro: 'Skip Intro',
  enableSponsorBlockOutro: 'Skip Outro',
  enableSponsorBlockInteraction: 'Skip Interaction',
  enableSponsorBlockSelfPromo: 'Skip Self-Promo',
  enableSponsorBlockMusicOfftopic: 'Skip Non-Music',
  enableSponsorBlockPreview: 'Skip Previews',
  hideLogo: 'Remove Logo',
  pointerSettingsButton: 'Fixed Settings Panel Button',
  forceHighResVideo: 'Default Max Resolution',
  showQualityOnStart: 'Show Resolution on Start',
  showTimeRemaining: 'Show Time Remaining',
  blockWebosCast: 'Block Cast Wake (webOS 25)',
  removeEndscreen: 'Remove End Screens',
  keepPlaying: 'Keep Playing when Idle',
  autoAccountSelect: 'Skip Family Account Picker',
  panelCareMode: 'Panel Care Mode',
  disableAnimations: 'Disable Animations',
  forceVideoCodec: 'Video Codec',
  skipSegmentsOnce: 'Skip Once',
  enableSponsorBlockFiller: 'Skip Tangents',
  enableSponsorBlockHook: 'Skip Hook',
  enableSponsorBlockHighlight: 'Skip to Highlight'
} satisfies Record<ConfigKey, string>;

/** Options-panel chrome. */
export const PANEL = {
  heading: 'YouTube Extended for webOS',
  badge: 'YT-X',
  closeGlyph: '✕',
  closeLabel: 'Close settings',
  tabs: ['Main', 'UI', 'System', 'Privacy', 'Adblock'],
  sections: {
    videoPlayer: 'Video Player',
    playerUiTweaks: 'UI Tweaks',
    system: 'System',
    privacy: 'Privacy',
    adBlocking: 'Ad Blocking',
    sponsorBlock: 'SponsorBlock'
  },
  attribution: 'Sponsored segments API: sponsor.ajay.app'
};

/** SponsorBlock segment-list popup. */
export const SPONSOR_POPUP: {
  title: string;
  subtitle: string;
  categories: Record<SegmentCategory, string>;
} = {
  title: 'SponsorBlock',
  subtitle: 'Segments found for this video',
  categories: {
    sponsor: 'Sponsor',
    intro: 'Intermission/Intro',
    outro: 'Endcards/Credits',
    interaction: 'Interaction',
    selfpromo: 'Unpaid/Self Promotion',
    music_offtopic: 'Non-Music Section',
    preview: 'Preview/Recap',
    poi_highlight: 'Highlight',
    filler: 'Filler/Tangents',
    hook: 'Hook/Greetings'
  }
};

// Toast templates; interpolated values are unbound, so notifications.ts clamps them on device.
export const NOTIFICATIONS = {
  codecReload: (mode: string) => `Codec: ${mode} — reload to apply`,
  codecUnavailable: 'Codec unavailable — staying on Auto',
  skipping: (name: string) => `Skipping ${name}`,
  muted: (name: string) => `Muted ${name} segment`,
  sponsorNew: (n: number) =>
    `SponsorBlock: ${n} new segment${n === 1 ? '' : 's'}`,
  playingIn: (label: string) => `Playing in ${label}`,
  selectedMax: (selected: string, max: string) =>
    `${selected} selected (Max ${max})`
};

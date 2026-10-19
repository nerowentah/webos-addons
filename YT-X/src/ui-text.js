// Central registry of user-visible strings; kept DOM/config-free for the plain-Node
// check. Caps: MAX_LABEL_TEXT (28) fits a 3-column cell, MAX_UI_TEXT (40) the rest.
export const MAX_UI_TEXT = 40;
export const MAX_LABEL_TEXT = 28;

/** Checkbox descriptions, keyed by config option key. */
export const UI_LABELS = {
  enableAdBlock: 'Ad Blocking',
  keepPlaybackTracking: 'Keep Watch History (Metrics)',
  removeShorts: 'Remove Shorts',
  removeMembersOnly: 'Hide Members-Only Videos',
  removeLiveVideos: 'Hide Live Videos',
  removeUpcomingVideos: 'Hide Upcoming Videos',
  removeTopLiveGames: 'Hide Top Live Games',
  removeMostRelevant: 'Hide Most Relevant Videos',
  enableTrackingBlock: 'Reduce Telemetry',
  disableAutoCaptions: 'Disable Auto Captions',
  loadRowsAhead: 'Load Rows Ahead',
  keyboardSearch: 'Keyboard Search',
  enableScrollSeek: 'Scroll Wheel Seeks',
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
  hideLogo: 'Hide Logo',
  pointerSettingsButton: 'Pointer-Only Button',
  forceHighResVideo: 'Force Max Resolution',
  showQualityOnStart: 'Show Quality on Start',
  showTimeRemaining: 'Show Time Remaining',
  blockWebosCast: 'Native DIAL Cast (Fix)',
  removeEndscreen: 'Remove End Screens',
  keepPlaying: 'Keep Playing',
  autoAccountSelect: 'Skip Account Selection',
  panelCareMode: 'Panel Care',
  disableAnimations: 'Disable Animations',
  fixMultilineTitles: 'Fix Multiline Titles',
  forceVideoCodec: 'Video Codec',
  skipSegmentsOnce: 'Skip Once',
  enableSponsorBlockFiller: 'Skip Tangents',
  enableSponsorBlockHook: 'Skip Hook',
  enableSponsorBlockHighlight: 'Skip to Highlight'
};

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
    cosmeticFiltering: 'UI Cosmetic Filtering',
    system: 'System',
    privacy: 'Privacy',
    adBlocking: 'Ad Blocking',
    sponsorBlock: 'SponsorBlock'
  },
  attribution: 'Sponsored segments by sponsor.ajay.app'
};

/** SponsorBlock segment-list popup. */
export const SPONSOR_POPUP = {
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

// Toast templates; interpolated values are unbound, so notifications.js clamps them on device.
export const NOTIFICATIONS = {
  codecReload: (mode) => `Codec: ${mode} — reload to apply`,
  codecUnavailable: 'Codec unavailable — staying on Auto',
  skipping: (name) => `Skipping ${name}`,
  muted: (name) => `Muted ${name} segment`,
  sponsorNew: (n) => `SponsorBlock: ${n} new segment${n === 1 ? '' : 's'}`,
  seek: (delta) => `Skipped ${delta}s`,
  playingIn: (label) => `Playing in ${label}`,
  selectedMax: (selected, max) => `${selected} selected (Max ${max})`
};

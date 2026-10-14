/**
 * Central registry of every user-visible string in the app.
 *
 * Kept free of DOM and config imports on purpose: tools/check-ui-text.cjs
 * dynamic-imports this module in plain Node to assert the caps below, so it must
 * not touch `window`, `document` or `localStorage` on evaluation. ui.js, config.js
 * and the notification callers import from here so a string only ever lives in
 * one place.
 *
 * Two caps, because the settings grid gives them different room:
 *
 *   - MAX_LABEL_TEXT (28) - a checkbox description. The densest sections lay
 *     their rows out three columns; a 3-column cell fits roughly 30 characters
 *     at the 2.1vh label size before it wraps, so 28 is the safe budget.
 *   - MAX_UI_TEXT (40) - everything else (heading, tabs, section titles,
 *     attribution, popup, notifications). These are never gridded, and the
 *     widest surface here is a two-column cell (~46 characters) or a toast.
 */
export const MAX_UI_TEXT = 40;
export const MAX_LABEL_TEXT = 28;

/** Checkbox descriptions, keyed by config option key. */
export const UI_LABELS = {
  enableAdBlock: 'Ad Blocking',
  keepPlaybackTracking: 'Keep Watch History',
  removeShorts: 'Remove Shorts',
  removeMembersOnly: 'Hide Members-Only',
  removeLiveVideos: 'Hide Live Videos',
  removeUpcomingVideos: 'Hide Upcoming',
  removeTopLiveGames: 'Hide Top Live Games',
  removeMostRelevant: 'Hide Most Relevant',
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
  blockWebosCast: 'Block webOS Cast',
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
  tabs: ['Main', 'UI Tweaks', 'System', 'Privacy', 'Adblock'],
  sections: {
    videoPlayer: 'Video Player',
    playerUiTweaks: 'Player UI Tweaks',
    cosmeticFiltering: 'Cosmetic Filtering',
    system: 'System',
    privacy: 'Privacy',
    adBlocking: 'Ad Blocking',
    sponsorBlock: 'SponsorBlock'
  },
  attribution: 'sponsor.ajay.app'
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

/**
 * Toast templates.
 *
 * The functions interpolate values the app cannot bound (YouTube quality labels,
 * SponsorBlock category names), so they are not length-checked literally; the
 * clamp in notifications.js truncates the finished string on device. The
 * check-ui-text guard runs each with a documented worst-case input as a
 * tripwire.
 */
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

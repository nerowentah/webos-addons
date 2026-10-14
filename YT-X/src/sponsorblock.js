import sha256 from 'tiny-sha256';
import {
  configAddChangeListener,
  configRead,
  configRemoveChangeListener,
  segmentColors,
  sponsorblockAPI,
  sponsorblockFallbackAPI,
  sponsorblockTimeoutMs
} from './config';
import { setSponsorBlockPopupSync, showNotification } from './ui';
import { NOTIFICATIONS } from './ui-text.js';
import sponsorBlockUI from './Sponsorblock-UI.js';
import { fetchJsonWithTimeout } from './hooks/fetch-timeout.js';

// Category display names for the skip and mute toasts.
const barTypes = {
  sponsor: { name: 'sponsored segment' },
  intro: { name: 'intro' },
  outro: { name: 'outro' },
  interaction: { name: 'interaction reminder' },
  selfpromo: { name: 'self-promotion' },
  music_offtopic: { name: 'non-music part' },
  preview: { name: 'recap or preview' },
  poi_highlight: { name: 'highlight' },
  filler: { name: 'tangents/jokes' },
  hook: { name: 'hook/greetings' }
};

// The API's category spelling (note 'music_offtopic', which YT-X also uses
// internally, so no mapping back is needed). Only the categories the settings
// expose are requested.
const FETCH_CATEGORIES = encodeURIComponent(
  JSON.stringify([
    'sponsor',
    'intro',
    'outro',
    'interaction',
    'selfpromo',
    'music_offtopic',
    'preview',
    'poi_highlight',
    'filler',
    'hook'
  ])
);

// Both action types, so a `mute` segment can be muted rather than skipped.
const FETCH_ACTION_TYPES = encodeURIComponent(JSON.stringify(['skip', 'mute']));

// Waits before asking again when both servers failed. An empty answer is an
// answer and is never retried.
const RETRY_DELAYS = [2000, 4000];

const HAS_ABORT_CONTROLLER = typeof AbortController !== 'undefined';

/**
 * Periodic re-check while a video plays ("Periodically check for new
 * segments"). Segments are often submitted hours after upload, so a video that
 * had none - or only some - when it opened is asked about again: every 15
 * minutes while it has segments, and with a 5/10/20/30 minute back-off while it
 * has none or the servers fail. The timer only fetches while the video plays;
 * one that comes due during a pause fetches on resume.
 */
const MINUTE_MS = 60 * 1000;
const REFRESH_POPULATED_MS = 15 * MINUTE_MS;
const REFRESH_BACKOFF_MS = [5, 10, 20, 30].map((m) => m * MINUTE_MS);

const SEGMENT_CATEGORY_KEYS = [
  'enableSponsorBlockSponsor',
  'enableSponsorBlockIntro',
  'enableSponsorBlockOutro',
  'enableSponsorBlockInteraction',
  'enableSponsorBlockSelfPromo',
  'enableSponsorBlockMusicOfftopic',
  'enableSponsorBlockPreview',
  'enableSponsorBlockHighlight',
  'enableSponsorBlockFiller',
  'enableSponsorBlockHook'
];

// Segment colors are a fixed standard palette shared with the popup
// (Sponsorblock-UI.js), so the progress-bar overlay and the popup agree.
function getSegmentColor(category) {
  return segmentColors[category] || '#0072ff';
}

/**
 * Order-independent identity of a segment list, to tell a real change from a
 * re-send.
 */
function segmentsSignature(segments) {
  return segments
    .map(
      (s) =>
        s.UUID ||
        `${s.category}:${s.actionType}:${s.segment[0]}:${s.segment[1]}`
    )
    .sort()
    .join('|');
}

function isWellFormedSegment(entry) {
  return (
    !!entry &&
    typeof entry.category === 'string' &&
    Array.isArray(entry.segment) &&
    typeof entry.segment[0] === 'number' &&
    typeof entry.segment[1] === 'number'
  );
}

/** Drops malformed API entries (a real category and a numeric [start, end]). */
function normalizeSegments(segments) {
  const out = [];
  for (let i = 0; i < segments.length; i++) {
    if (isWellFormedSegment(segments[i])) out.push(segments[i]);
  }
  return out;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SponsorBlockHandler {
  video = null;
  active = true;

  attachVideoTimeout = null;
  nextSkipTimeout = null;

  slider = null;
  sliderInterval = null;
  sliderObserver = null;
  sliderSegmentsOverlay = null;

  scheduleSkipHandler = null;
  durationChangeHandler = null;
  playingHandler = null;
  muteCheckHandler = null;
  seekedHandler = null;

  segments = null;
  skippableSegments = [];
  skippableCategories = [];
  muteSegments = [];
  mutedSegment = null;
  mutedBefore = false;
  segmentsSig = '';

  refreshTimer = null;
  refreshPending = false;
  refreshInFlight = false;
  consecutiveEmptyChecks = 0;
  consecutiveFailures = 0;

  abortController = null;

  lastScheduled = null;

  constructor(videoID) {
    this.videoID = videoID;
    this.configListeners = [];
    this.skippedSegmentStarts = new Set();
  }

  // destroy() clears `active`; async work that resumes later checks this so it
  // does not touch a torn-down handler (or a new one for another video).
  get isDestroyed() {
    return !this.active;
  }

  async init() {
    if (!this.videoID) return;
    const videoHash = sha256(this.videoID);
    if (!videoHash) return;
    const initVideoID = this.videoID;
    const hashPrefix = videoHash.substring(0, 4);

    this.scheduleSkipHandler = () => this.scheduleSkip();
    // A duration is often not known yet at init and is reported short first, so
    // re-run the whole overlay build: it creates the overlay and starts the
    // slider watch once a duration is there, then redraws the marks with it.
    this.durationChangeHandler = () => this.buildOverlay();
    this.playingHandler = () => {
      if (this.refreshPending) this.refreshSegments();
    };
    this.muteCheckHandler = () => {
      if (
        (this.muteSegments && this.muteSegments.length) ||
        this.mutedSegment
      ) {
        this.checkMutedSegment();
      }
    };
    this.seekedHandler = () => this.checkMutedSegment();

    const data = await this.fetchInitial(hashPrefix, initVideoID);
    if (this.isDestroyed || this.videoID !== initVideoID) return;

    const videoData = Array.isArray(data)
      ? data.find((x) => x && x.videoID === this.videoID)
      : data;
    const segments =
      videoData && Array.isArray(videoData.segments)
        ? normalizeSegments(videoData.segments)
        : [];
    segments.sort((a, b) => a.segment[0] - b.segment[0]);
    this.segments = segments;
    this.segmentsSig = segmentsSignature(segments);
    console.info(this.videoID, 'Got segments:', this.segments);

    this.watchConfig();
    this.attachVideo();

    if (this.segments.length === 0) {
      sponsorBlockUI.updateSegments([]);
      if (configRead('sbPeriodicRefresh')) {
        // Stay alive with nothing to skip: segments submitted while this
        // video plays are picked up by the refresh.
        console.info(this.videoID, 'No segments yet, will check again');
        if (data !== null) this.consecutiveEmptyChecks++;
        this.scheduleRefresh();
      }
      return;
    }

    this.rebuildSegments();
    sponsorBlockUI.updateSegments(this.segments);
    this.buildOverlay();
    this.scheduleRefresh();
  }

  /**
   * Fetches the segment list: the official server first, the community mirror
   * only when it fails. Returns the parsed array (possibly empty for a 404, an
   * answer and not a failure), or null when both servers failed.
   */
  async fetchSegments(hashPrefix) {
    if (this.isDestroyed) return null;

    if (this.abortController) this.abortController.abort();
    // One controller for this call (both servers); destroy() aborts it.
    const controller = HAS_ABORT_CONTROLLER ? new AbortController() : null;
    this.abortController = controller;

    const tryFetch = async (base) => {
      if (this.isDestroyed || (controller && controller.signal.aborted)) {
        return null;
      }
      try {
        const url = `${base}/skipSegments/${hashPrefix}?categories=${FETCH_CATEGORIES}&actionTypes=${FETCH_ACTION_TYPES}`;
        const res = await fetchJsonWithTimeout(
          url,
          sponsorblockTimeoutMs,
          controller ? { signal: controller.signal } : undefined
        );
        if (res.ok) return res.data;
        // 404 is the API saying it has nothing for this prefix - an answer,
        // not a failure worth retrying.
        return res.status === 404 ? [] : null;
      } catch (err) {
        if (!this.isDestroyed && err.name !== 'AbortError') {
          console.warn(this.videoID, 'Fetch attempt failed:', err.message);
        }
        return null;
      }
    };

    let res = await tryFetch(sponsorblockAPI);
    if (!res) res = await tryFetch(sponsorblockFallbackAPI);
    if (this.abortController === controller) this.abortController = null;
    return res;
  }

  /**
   * The first load, retried a couple of times when both servers failed (null).
   * Written as a recursion rather than a loop so each await is a plain
   * sequential step. An empty list is an answer and ends the retry.
   */
  async fetchInitial(hashPrefix, initVideoID, attempt = 0) {
    const data = await this.fetchSegments(hashPrefix);
    if (data !== null) return data;
    if (attempt >= RETRY_DELAYS.length) return null;
    if (this.isDestroyed || this.videoID !== initVideoID) return null;
    await delay(RETRY_DELAYS[attempt]);
    if (this.isDestroyed || this.videoID !== initVideoID) return null;
    return this.fetchInitial(hashPrefix, initVideoID, attempt + 1);
  }

  getSkippableCategories() {
    const categories = [];
    const mapping = {
      sponsor: 'enableSponsorBlockSponsor',
      intro: 'enableSponsorBlockIntro',
      outro: 'enableSponsorBlockOutro',
      interaction: 'enableSponsorBlockInteraction',
      selfpromo: 'enableSponsorBlockSelfPromo',
      music_offtopic: 'enableSponsorBlockMusicOfftopic',
      preview: 'enableSponsorBlockPreview',
      poi_highlight: 'enableSponsorBlockHighlight',
      filler: 'enableSponsorBlockFiller',
      hook: 'enableSponsorBlockHook'
    };
    for (const category of Object.keys(mapping)) {
      if (configRead(mapping[category])) categories.push(category);
    }
    return categories;
  }

  /**
   * Rebuilds the per-category skip and mute lists from the loaded segments and
   * the current settings. `skipSegments` are the non-mute segments whose
   * category is enabled; `muteSegments` are the `mute` ones.
   */
  rebuildSegments() {
    this.skippableCategories = this.getSkippableCategories();
    this.skippableSegments = (this.segments || []).filter(
      (seg) =>
        seg.actionType !== 'mute' &&
        this.skippableCategories.includes(seg.category)
    );
    this.rebuildMuteSegments();
  }

  /**
   * Segments the API marks `mute` are muted rather than skipped, when "Allow
   * segments that mute audio" is on and their category is enabled. The
   * viewer's own mute state comes back on the way out, on a seek away and on
   * destroy.
   */
  rebuildMuteSegments() {
    const list = [];
    if (configRead('enableMutedSegments')) {
      for (const seg of this.segments || []) {
        if (seg.actionType !== 'mute' || seg.category === 'poi_highlight') {
          continue;
        }
        if (!this.skippableCategories.includes(seg.category)) continue;
        list.push({
          start: seg.segment[0],
          end: seg.segment[1],
          name: barTypes[seg.category]?.name || seg.category
        });
      }
    }
    this.muteSegments = list;
    this.checkMutedSegment();
  }

  checkMutedSegment() {
    const video = this.video;
    if (!video || this.isDestroyed) return;
    if (!this.muteSegments || this.muteSegments.length === 0) {
      this.leaveMutedSegment();
      return;
    }
    const t = video.currentTime;
    let current = null;
    for (let i = 0; i < this.muteSegments.length; i++) {
      const seg = this.muteSegments[i];
      if (t >= seg.start && t < seg.end) {
        current = seg;
        break;
      }
    }
    if (!current) {
      this.leaveMutedSegment();
      return;
    }
    if (this.mutedSegment === current) return;
    if (!this.mutedSegment) this.mutedBefore = video.muted;
    this.mutedSegment = current;
    video.muted = true;
    const name = current.name;
    showNotification(
      NOTIFICATIONS.muted(name.charAt(0).toUpperCase() + name.slice(1))
    );
  }

  leaveMutedSegment() {
    if (!this.mutedSegment) return;
    this.mutedSegment = null;
    if (this.video) this.video.muted = this.mutedBefore;
  }

  // Category toggles in the options panel only affect the in-memory lists once
  // loaded; re-evaluate them (and re-arm any pending skip) whenever one of them
  // changes so toggles apply without a remount.
  watchConfig() {
    const skipCallback = () => {
      this.rebuildSegments();
      this.scheduleSkip();
    };
    SEGMENT_CATEGORY_KEYS.forEach((key) => {
      this.configListeners.push({ key, callback: skipCallback });
      configAddChangeListener(key, skipCallback);
    });

    const refreshToggled = (evt) => {
      if (evt.detail.newValue) this.scheduleRefresh();
      else this.clearRefresh();
    };
    this.configListeners.push({
      key: 'sbPeriodicRefresh',
      callback: refreshToggled
    });
    configAddChangeListener('sbPeriodicRefresh', refreshToggled);

    const muteToggled = () => this.rebuildMuteSegments();
    this.configListeners.push({
      key: 'enableMutedSegments',
      callback: muteToggled
    });
    configAddChangeListener('enableMutedSegments', muteToggled);
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    this.video = document.querySelector('video');
    if (!this.video) {
      console.info(this.videoID, 'No video yet...');
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 100);
      return;
    }

    console.info(this.videoID, 'Video found, binding...');

    this.video.addEventListener('play', this.scheduleSkipHandler);
    this.video.addEventListener('pause', this.scheduleSkipHandler);
    this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
    this.video.addEventListener('durationchange', this.durationChangeHandler);
    this.video.addEventListener('playing', this.playingHandler);
    this.video.addEventListener('timeupdate', this.muteCheckHandler);
    this.video.addEventListener('seeked', this.seekedHandler);
  }

  buildOverlay() {
    if (!this.video || !this.video.duration) {
      console.info('No video duration yet');
      return;
    }

    if (!this.sliderSegmentsOverlay) {
      this.sliderSegmentsOverlay = document.createElement('div');
      this.sliderSegmentsOverlay.className =
        'ytx-sponsorblock-segment-container';
    }

    this.drawSegments();

    if (!this.sliderObserver) this.startSliderWatch();
  }

  /**
   * Redraws the overlay marks from the current segments and duration. Called
   * again on every durationchange, so a duration reported short early is undone
   * once the real one arrives.
   */
  drawSegments() {
    if (!this.sliderSegmentsOverlay) return;
    this.sliderSegmentsOverlay.textContent = '';
    const videoDuration = this.video && this.video.duration;
    if (!videoDuration) return;

    this.segments.forEach((segment) => {
      const [start, end] = segment.segment;
      const elm = document.createElement('div');
      elm.className = 'ytx-sponsorblock-segment';
      elm.style['background-color'] = getSegmentColor(segment.category);
      elm.style['left'] = `${(start / videoDuration) * 100.0}%`;
      elm.style['width'] = `${((end - start) / videoDuration) * 100.0}%`;
      this.sliderSegmentsOverlay.appendChild(elm);
    });
  }

  startSliderWatch() {
    const addSliderObserver = (ele) => {
      this.sliderObserver.observe(ele, {
        childList: true,
        subtree: true
      });
    };

    const addSliderOverlay = () => {
      this.slider.appendChild(this.sliderSegmentsOverlay);
    };

    const watchForSlider = () => {
      if (this.sliderInterval) clearInterval(this.sliderInterval);

      this.sliderInterval = setInterval(() => {
        const nodes = document.querySelectorAll('[idomkey=progress-bar]');
        const last = nodes[nodes.length - 1];
        switch (nodes.length) {
          case 3: {
            // Slider has chapter markers.
            this.slider = last;
            break;
          }
          case 2: {
            // Slider has no markers or auto-markers
            this.slider = last.querySelector('[idomkey=slider]');
            break;
          }
          default: {
            return; // no slider found yet
          }
        }

        console.info('slider found...', this.slider);
        clearInterval(this.sliderInterval);
        this.sliderInterval = null;
        addSliderObserver(last);
        addSliderOverlay();
      }, 100);
    };

    this.sliderObserver = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.removedNodes) {
          for (const node of m.removedNodes) {
            if (node === this.sliderSegmentsOverlay) {
              console.info('bringing back segments overlay');
              addSliderOverlay();
            }
            if (node === this.slider) {
              console.info('slider removed, watching again');
              this.sliderObserver.disconnect();
              watchForSlider();
            }
          }
        }
      });
    });

    watchForSlider();
  }

  /**
   * The segment the playhead is in (the earliest start wins on overlap), or the
   * next one to start, among the enabled, not-yet-skipped segments. Returns
   * null when there is nothing ahead, so a segment already behind the playhead
   * is never re-skipped - which used to send the skip backwards and repeat the
   * toast while nothing moved.
   */
  pickSegment(currentTime) {
    const once = configRead('skipSegmentsOnce');
    const list = this.skippableSegments;
    for (let i = 0; i < list.length; i++) {
      const seg = list[i];
      if (seg.segment[1] <= currentTime + 0.05) continue;
      if (once && this.skippedSegmentStarts.has(seg.segment[0])) continue;
      return seg;
    }
    return null;
  }

  scheduleSkip() {
    if (!this.active) {
      console.info(this.videoID, 'No longer active, ignoring...');
      return;
    }

    if (!this.video) return;

    if (this.video.paused) {
      console.info(this.videoID, 'Currently paused, ignoring...');
      return;
    }

    const currentTime = this.video.currentTime;
    const segment = this.pickSegment(currentTime);

    if (!segment) {
      if (this.nextSkipTimeout) {
        clearTimeout(this.nextSkipTimeout);
        this.nextSkipTimeout = null;
      }
      this.lastScheduled = null;
      console.info(this.videoID, 'No more segments');
      return;
    }

    const [start, end] = segment.segment;
    // May be negative when the playhead is already inside the segment (a seek
    // landed in one): the timeout then fires immediately.
    const skipDelay = (start - currentTime) * 1000;

    // timeupdate fires frequently; skip re-arming the timer when the same
    // segment is still scheduled within a small tolerance.
    if (
      this.lastScheduled &&
      this.lastScheduled.segment === segment &&
      Math.abs(this.lastScheduled.delay - skipDelay) < 100
    ) {
      return;
    }

    if (this.nextSkipTimeout) {
      clearTimeout(this.nextSkipTimeout);
      this.nextSkipTimeout = null;
    }
    this.lastScheduled = { segment, delay: skipDelay };

    console.info(
      this.videoID,
      'Scheduling skip of',
      segment,
      'in',
      start - currentTime
    );

    this.nextSkipTimeout = setTimeout(() => {
      if (this.video.paused) {
        console.info(this.videoID, 'Currently paused, ignoring...');
        return;
      }

      // Nothing left to do if the playhead already reached the end.
      if (this.video.currentTime >= end - 0.05) {
        this.scheduleSkip();
        return;
      }

      this.skippedSegmentStarts.add(start);
      const skipName = barTypes[segment.category]?.name || segment.category;
      console.info(this.videoID, 'Skipping', segment);
      showNotification(NOTIFICATIONS.skipping(skipName));
      this.video.currentTime = end;
      this.scheduleSkip();
    }, skipDelay);
  }

  clearRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.refreshPending = false;
  }

  scheduleRefresh() {
    this.clearRefresh();
    if (this.isDestroyed || !configRead('sbPeriodicRefresh')) return;

    let delayMs;
    if (this.consecutiveFailures > 0) {
      delayMs =
        REFRESH_BACKOFF_MS[
          Math.min(this.consecutiveFailures, REFRESH_BACKOFF_MS.length) - 1
        ];
    } else if (this.segments && this.segments.length > 0) {
      delayMs = REFRESH_POPULATED_MS;
    } else {
      delayMs =
        REFRESH_BACKOFF_MS[
          Math.min(
            Math.max(1, this.consecutiveEmptyChecks),
            REFRESH_BACKOFF_MS.length
          ) - 1
        ];
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshSegments();
    }, delayMs);
  }

  async refreshSegments() {
    if (this.isDestroyed || this.refreshInFlight) return;
    const video = this.video;
    // No fetching for a paused player; 'playing' picks it up.
    if (!video || video.paused) {
      this.refreshPending = true;
      return;
    }

    this.refreshPending = false;
    this.refreshInFlight = true;
    const videoID = this.videoID;
    try {
      const hash = sha256(videoID);
      const data = hash ? await this.fetchSegments(hash.substring(0, 4)) : null;
      if (this.isDestroyed || this.videoID !== videoID) return;
      if (data === null) {
        this.consecutiveFailures++;
        return;
      }
      this.consecutiveFailures = 0;
      const videoData = Array.isArray(data)
        ? data.find((x) => x && x.videoID === videoID)
        : data;
      const segments =
        videoData && Array.isArray(videoData.segments)
          ? normalizeSegments(videoData.segments)
          : [];
      if (segments.length === 0) {
        this.consecutiveEmptyChecks++;
        return;
      }
      this.consecutiveEmptyChecks = 0;
      segments.sort((a, b) => a.segment[0] - b.segment[0]);
      const sig = segmentsSignature(segments);
      if (sig === this.segmentsSig) return;
      this.applyRefreshedSegments(segments, sig);
    } catch (err) {
      this.consecutiveFailures++;
      console.warn(this.videoID, 'Refresh failed', err);
    } finally {
      this.refreshInFlight = false;
      if (!this.isDestroyed) this.scheduleRefresh();
    }
  }

  /** Swaps in a changed segment list mid-video. */
  applyRefreshedSegments(segments, sig) {
    const before = this.segments || [];
    const beforeUUIDs = new Set(before.map((s) => s.UUID).filter(Boolean));
    const added = segments.filter(
      (s) => s.UUID && !beforeUUIDs.has(s.UUID)
    ).length;

    this.segments = segments;
    this.segmentsSig = sig;
    this.rebuildSegments();
    sponsorBlockUI.updateSegments(this.segments);

    if (!this.sliderObserver) this.buildOverlay();
    else this.drawSegments();

    console.info(
      this.videoID,
      `Segments updated (${before.length} -> ${segments.length})`
    );
    if (added > 0) {
      showNotification(NOTIFICATIONS.sponsorNew(added));
    }
    this.scheduleSkip();
  }

  destroy() {
    console.info(this.videoID, 'Destroying');

    this.active = false;

    this.clearRefresh();

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.nextSkipTimeout) {
      clearTimeout(this.nextSkipTimeout);
      this.nextSkipTimeout = null;
    }

    if (this.attachVideoTimeout) {
      clearTimeout(this.attachVideoTimeout);
      this.attachVideoTimeout = null;
    }

    this.lastScheduled = null;

    if (this.sliderInterval) {
      clearInterval(this.sliderInterval);
      this.sliderInterval = null;
    }

    if (this.sliderObserver) {
      this.sliderObserver.disconnect();
      this.sliderObserver = null;
    }

    if (this.sliderSegmentsOverlay) {
      this.sliderSegmentsOverlay.remove();
      this.sliderSegmentsOverlay = null;
    }

    this.leaveMutedSegment();
    this.muteSegments = [];
    this.skippableSegments = [];

    sponsorBlockUI.updateSegments([]);
    sponsorBlockUI.togglePopup(false);

    this.configListeners.forEach(({ key, callback }) => {
      configRemoveChangeListener(key, callback);
    });
    this.configListeners = [];

    if (this.video) {
      this.video.removeEventListener('play', this.scheduleSkipHandler);
      this.video.removeEventListener('pause', this.scheduleSkipHandler);
      this.video.removeEventListener('timeupdate', this.scheduleSkipHandler);
      this.video.removeEventListener(
        'durationchange',
        this.durationChangeHandler
      );
      this.video.removeEventListener('playing', this.playingHandler);
      this.video.removeEventListener('timeupdate', this.muteCheckHandler);
      this.video.removeEventListener('seeked', this.seekedHandler);
    }
  }
}

// Declared as an explicit window property rather than a module-scope `let`.
// Originally it was a `let`, and two consecutive hashchange events meant the
// second handler never saw the first one's value change, causing multiple
// SponsorBlockHandler initialisations. That was observed on Chromium 38, and
// the cause was never identified, so the workaround is kept rather than
// reverted: the webOS 6 floor (Chrome 79) postdates the report, but we have no
// evidence the underlying engine behaviour is actually fixed.
window.sponsorblock = null;

// The options panel toggles the SponsorBlock popup through the ui.js seam.
setSponsorBlockPopupSync(sponsorBlockUI.togglePopup.bind(sponsorBlockUI));

function uninitializeSponsorblock() {
  if (!window.sponsorblock) {
    return;
  }
  try {
    window.sponsorblock.destroy();
  } catch (err) {
    console.warn('window.sponsorblock.destroy() failed!', err);
  }
  window.sponsorblock = null;
}

window.addEventListener(
  'hashchange',
  () => {
    const newURL = new URL(location.hash.substring(1), location.href);
    // uninitialize sponsorblock when not on `/watch` path, to prevent
    // it from attaching to playback preview video element loaded on
    // home page
    if (newURL.pathname !== '/watch' && window.sponsorblock) {
      console.info('uninitializing sponsorblock on a non-video page');
      uninitializeSponsorblock();
      return;
    }

    const videoID = newURL.searchParams.get('v');
    const needsReload =
      videoID &&
      (!window.sponsorblock || window.sponsorblock.videoID != videoID);

    console.info(
      'hashchange',
      videoID,
      window.sponsorblock,
      window.sponsorblock ? window.sponsorblock.videoID : null,
      needsReload
    );

    if (needsReload) {
      uninitializeSponsorblock();

      if (configRead('enableSponsorBlock')) {
        window.sponsorblock = new SponsorBlockHandler(videoID);
        window.sponsorblock.init();
      } else {
        console.info('SponsorBlock disabled, not loading');
      }
    }
  },
  false
);

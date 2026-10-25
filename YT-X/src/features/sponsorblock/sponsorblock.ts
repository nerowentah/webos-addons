import sha256 from 'tiny-sha256';
import { categoryInfo, SEGMENT_CATEGORIES } from './categories';
import {
  configAddChangeListener,
  configRead,
  configRemoveChangeListener,
  sponsorblockAPI,
  sponsorblockFallbackAPI,
  sponsorblockTimeoutMs,
  type ConfigChangeListener,
  type ConfigKey
} from '../../config/config';
import { setSponsorBlockPanelSync, showNotification } from '../../ui/ui';
import { NOTIFICATIONS } from '../../config/ui-text';
import sponsorBlockUI from './sponsorblock-ui';
import SegmentMarkers from './markers';
import { fetchJsonWithTimeout } from '../../youtube/hooks/fetch-timeout';
import {
  backoffDelay,
  nextHighlightStart,
  pickSegment,
  REFRESH_POPULATED_MS,
  segmentsFor,
  segmentsSignature,
  skipTarget,
  TERMINAL_TOLERANCE_S,
  type Segment
} from './segments';

interface MuteSegment {
  start: number;
  end: number;
  name: string;
}

type Timer = ReturnType<typeof setTimeout>;

// The API's category spelling ('music_offtopic' is used internally too, so no
// mapping back is needed); only categories the settings expose are requested.
const FETCH_CATEGORIES = encodeURIComponent(
  JSON.stringify(SEGMENT_CATEGORIES.map((c) => c.id))
);

// Both action types, so a `mute` segment can be muted rather than skipped.
// `poi` is separate: highlights (`poi_highlight`) are points, not skip ranges.
const FETCH_ACTION_TYPES = encodeURIComponent(
  JSON.stringify(['skip', 'mute', 'poi'])
);

// Waits before re-asking when both servers failed; an empty answer ends the retries.
const RETRY_DELAYS = [2000, 4000];

const HIGHLIGHT = 'poi_highlight';

const SEGMENT_CATEGORY_KEYS = SEGMENT_CATEGORIES.map((c) => c.configKey);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SponsorBlockHandler {
  videoID: string;
  video: HTMLVideoElement | null = null;
  markers: SegmentMarkers | null = null;
  active = true;

  attachVideoTimeout: Timer | null = null;
  nextSkipTimeout: Timer | null = null;

  scheduleSkipHandler = (): void => this.scheduleSkip();
  playingHandler = (): void => {
    this.jumpToHighlight();
    if (this.refreshPending) void this.refreshSegments();
    sponsorBlockUI.scheduleAutoShow();
  };
  muteCheckHandler = (): void => {
    if (this.muteSegments.length || this.mutedSegment) {
      this.checkMutedSegment();
    }
  };
  seekedHandler = (): void => this.checkMutedSegment();
  endedHandler = (): void => this.leaveMutedSegment();
  // A viewer unmuting inside a mute segment is theirs to keep: leaving the segment must not re-mute.
  volumeChangeHandler = (): void => {
    if (this.mutedSegment && this.video && !this.video.muted) {
      this.viewerUnmuted = true;
    }
  };

  segments: Segment[] | null = null;
  skippableSegments: Segment[] = [];
  skippableCategories: string[] = [];
  muteSegments: MuteSegment[] = [];
  mutedSegment: MuteSegment | null = null;
  mutedBefore = false;
  viewerUnmuted = false;
  highlightDone = false;
  segmentsSig = '';
  /** Starts of terminal segments already handled; they must not re-trigger the end-of-video loop. */
  terminalHandled = new Set<number>();

  refreshTimer: Timer | null = null;
  refreshPending = false;
  refreshInFlight = false;
  consecutiveEmptyChecks = 0;
  consecutiveFailures = 0;

  abortController: AbortController | null = null;

  lastScheduled: { segment: Segment; delay: number } | null = null;

  /** Detaches each config listener this handler added. */
  configListeners: (() => void)[] = [];
  skippedSegmentStarts = new Set<number>();

  constructor(videoID: string) {
    this.videoID = videoID;
  }

  // destroy() clears `active`; async work that resumes later checks this so it does not touch a torn-down handler.
  get isDestroyed(): boolean {
    return !this.active;
  }

  async init(): Promise<void> {
    if (!this.videoID) return;
    const videoHash = sha256(this.videoID);
    if (!videoHash) return;
    const initVideoID = this.videoID;
    const hashPrefix = videoHash.substring(0, 4);

    const data = await this.fetchInitial(hashPrefix, initVideoID);
    if (this.isDestroyed || this.videoID !== initVideoID) return;

    const segments = segmentsFor(data, this.videoID);
    this.segments = segments;
    this.segmentsSig = segmentsSignature(segments);

    this.watchConfig();
    this.attachVideo();

    if (segments.length === 0) {
      sponsorBlockUI.updateSegments([]);
      this.markers?.render();
      if (configRead('sbPeriodicRefresh')) {
        // Stay alive with nothing to skip: later submissions are picked up by the refresh.
        if (data !== null) this.consecutiveEmptyChecks++;
        this.scheduleRefresh();
      }
      return;
    }

    this.rebuildSegments();
    this.markers?.render();
    sponsorBlockUI.updateSegments(this.popupSegments(segments));
    sponsorBlockUI.scheduleAutoShow();
    if (this.video && !this.video.paused) this.jumpToHighlight();
    this.scheduleRefresh();
  }

  /** The popup follows the enabled categories; a disabled highlight must not auto-show it. */
  popupSegments(segments: readonly Segment[]): Segment[] {
    if (this.skippableCategories.includes(HIGHLIGHT)) return [...segments];
    return segments.filter((seg) => seg.category !== HIGHLIGHT);
  }

  /** Fetches the segment list: official server first, community mirror only when it fails; null when both failed (an empty list is a valid answer). The answer is untrusted JSON, read through segmentsFor(). */
  async fetchSegments(hashPrefix: string): Promise<unknown> {
    if (this.isDestroyed) return null;

    if (this.abortController) this.abortController.abort();
    // One controller for this call (both servers); destroy() aborts it.
    const controller = new AbortController();
    this.abortController = controller;

    const tryFetch = async (base: string): Promise<unknown> => {
      if (this.isDestroyed || controller.signal.aborted) {
        return null;
      }
      try {
        const url = `${base}/skipSegments/${hashPrefix}?categories=${FETCH_CATEGORIES}&actionTypes=${FETCH_ACTION_TYPES}`;
        const res = await fetchJsonWithTimeout(url, sponsorblockTimeoutMs, {
          signal: controller.signal
        });
        if (res.ok) return res.data;
        // 404 is an answer, not a failure worth retrying.
        return res.status === 404 ? [] : null;
      } catch {
        return null;
      }
    };

    let res = await tryFetch(sponsorblockAPI);
    if (!res) res = await tryFetch(sponsorblockFallbackAPI);
    if (this.abortController === controller) this.abortController = null;
    return res;
  }

  /** The first load, retried when both servers failed (null); an empty list is an answer and ends the retry. */
  async fetchInitial(
    hashPrefix: string,
    initVideoID: string,
    attempt = 0
  ): Promise<unknown> {
    const data = await this.fetchSegments(hashPrefix);
    if (data !== null) return data;
    const wait = RETRY_DELAYS[attempt];
    if (wait === undefined) return null;
    if (this.isDestroyed || this.videoID !== initVideoID) return null;
    await delay(wait);
    if (this.isDestroyed || this.videoID !== initVideoID) return null;
    return this.fetchInitial(hashPrefix, initVideoID, attempt + 1);
  }

  getSkippableCategories(): string[] {
    const categories: string[] = [];
    for (const { id: category, configKey: key } of SEGMENT_CATEGORIES) {
      if (configRead(key)) categories.push(category);
    }
    return categories;
  }

  /** Rebuilds the per-category skip and mute lists from segments and settings. */
  rebuildSegments(): void {
    this.skippableCategories = this.getSkippableCategories();
    this.skippableSegments = (this.segments || []).filter(
      (seg) =>
        seg.actionType !== 'mute' &&
        seg.category !== HIGHLIGHT &&
        this.skippableCategories.includes(seg.category)
    );
    this.rebuildMuteSegments();
  }

  /** Segments the API marks `mute` are muted rather than skipped, when enabled; the viewer's own mute state comes back on the way out, on a seek away and on destroy. */
  rebuildMuteSegments(): void {
    const list: MuteSegment[] = [];
    if (configRead('enableMutedSegments')) {
      for (const seg of this.segments || []) {
        if (seg.actionType !== 'mute' || seg.category === HIGHLIGHT) {
          continue;
        }
        if (!this.skippableCategories.includes(seg.category)) continue;
        list.push({
          start: seg.segment[0],
          end: seg.segment[1],
          name: categoryInfo(seg.category)?.skipName || seg.category
        });
      }
    }
    this.muteSegments = list;
    this.checkMutedSegment();
  }

  checkMutedSegment(): void {
    const video = this.video;
    if (!video || this.isDestroyed) return;
    if (this.muteSegments.length === 0) {
      this.leaveMutedSegment();
      return;
    }
    const t = video.currentTime;
    let current: MuteSegment | null = null;
    for (const seg of this.muteSegments) {
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
    if (!this.mutedSegment) {
      this.mutedBefore = video.muted;
      this.viewerUnmuted = false;
    }
    this.mutedSegment = current;
    video.muted = true;
    const name = current.name;
    showNotification(
      NOTIFICATIONS.muted(name.charAt(0).toUpperCase() + name.slice(1))
    );
  }

  leaveMutedSegment(): void {
    if (!this.mutedSegment) return;
    this.mutedSegment = null;
    if (this.video && !this.viewerUnmuted) {
      this.video.muted = this.mutedBefore;
    }
  }

  /** Listens for a config change until destroy(). */
  listen<K extends ConfigKey>(key: K, callback: ConfigChangeListener<K>): void {
    this.configListeners.push(() => configRemoveChangeListener(key, callback));
    configAddChangeListener(key, callback);
  }

  // Category toggles only affect the in-memory lists; re-evaluate them (and re-arm any pending skip) on change so toggles apply without a remount.
  watchConfig(): void {
    const skipCallback = () => {
      this.rebuildSegments();
      this.markers?.render();
      this.scheduleSkip();
    };
    SEGMENT_CATEGORY_KEYS.forEach((key) => {
      this.listen(key, skipCallback);
    });

    this.listen('sbPeriodicRefresh', (evt) => {
      if (evt.detail.newValue) this.scheduleRefresh();
      else this.clearRefresh();
    });

    this.listen('enableMutedSegments', () => this.rebuildMuteSegments());
  }

  attachVideo(): void {
    if (this.attachVideoTimeout) clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    const video = document.querySelector('video');
    this.video = video;
    if (!video) {
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 100);
      return;
    }

    video.addEventListener('play', this.scheduleSkipHandler);
    video.addEventListener('pause', this.scheduleSkipHandler);
    video.addEventListener('timeupdate', this.scheduleSkipHandler);
    video.addEventListener('playing', this.playingHandler);
    video.addEventListener('timeupdate', this.muteCheckHandler);
    video.addEventListener('seeked', this.seekedHandler);
    video.addEventListener('volumechange', this.volumeChangeHandler);
    video.addEventListener('ended', this.endedHandler);
    this.markers?.stop();
    this.markers = new SegmentMarkers(
      video,
      () => this.segments || [],
      () => this.skippableCategories
    );
    this.markers.start();
    if (!video.paused) this.jumpToHighlight();
  }

  /** Once per video, when playback starts or the segment list arrives: seeks to the first enabled highlight still ahead. A highlight is a point, not a range, so this is a seek to its start rather than a skip. */
  jumpToHighlight(): void {
    const video = this.video;
    if (this.highlightDone || !video || this.isDestroyed) return;
    if (!this.skippableCategories.includes(HIGHLIGHT)) return;
    const start = nextHighlightStart(this.segments || [], video.currentTime);
    if (start === null) return;
    this.highlightDone = true;
    showNotification(
      NOTIFICATIONS.skipping(categoryInfo(HIGHLIGHT)?.skipName || HIGHLIGHT)
    );
    video.currentTime = start;
  }

  /** Starts the picker must ignore: skip-once entries and terminal segments already handled. */
  excludedStarts(): ReadonlySet<number> | null {
    const skipOnce = configRead('skipSegmentsOnce');
    if (!skipOnce && this.terminalHandled.size === 0) return null;

    const excluded = new Set<number>();
    if (skipOnce) {
      for (const start of this.skippedSegmentStarts) excluded.add(start);
    }
    for (const start of this.terminalHandled) excluded.add(start);
    return excluded;
  }

  scheduleSkip(): void {
    if (!this.active) {
      return;
    }

    const video = this.video;
    if (!video) return;

    if (video.paused) {
      return;
    }

    const currentTime = video.currentTime;
    const segment = pickSegment(
      this.skippableSegments,
      currentTime,
      this.excludedStarts()
    );

    if (!segment) {
      if (this.nextSkipTimeout) {
        clearTimeout(this.nextSkipTimeout);
        this.nextSkipTimeout = null;
      }
      this.lastScheduled = null;
      return;
    }

    const [start, end] = segment.segment;
    // May be negative when the playhead is already inside the segment (a seek landed in one); the timeout then fires immediately.
    // Scaled by playbackRate: media time passes that much faster (or slower) than the timer.
    const rate = video.playbackRate > 0 ? video.playbackRate : 1;
    const skipDelay = ((start - currentTime) * 1000) / rate;

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

    this.nextSkipTimeout = setTimeout(() => {
      if (video.paused) {
        return;
      }

      const target = skipTarget(end, video.duration, video.currentTime);
      const terminal =
        Number.isFinite(video.duration) &&
        video.duration > 0 &&
        end >= video.duration - TERMINAL_TOLERANCE_S;

      // Buffering or a rate change can leave the playhead short of the start,
      // inside the natural-end tail, or past the end: re-evaluate instead of
      // jumping. A terminal segment is marked handled so it cannot loop.
      if (
        target === null ||
        video.currentTime < start - 0.05 ||
        video.currentTime >= target - 0.05
      ) {
        if (terminal) this.terminalHandled.add(start);
        this.nextSkipTimeout = null;
        this.lastScheduled = null;
        this.scheduleSkip();
        return;
      }

      this.skippedSegmentStarts.add(start);
      if (terminal) this.terminalHandled.add(start);
      const skipName =
        categoryInfo(segment.category)?.skipName || segment.category;
      showNotification(NOTIFICATIONS.skipping(skipName));
      video.currentTime = target;
      this.scheduleSkip();
    }, skipDelay);
  }

  clearRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.refreshPending = false;
  }

  scheduleRefresh(): void {
    this.clearRefresh();
    if (this.isDestroyed || !configRead('sbPeriodicRefresh')) return;

    let delayMs: number;
    if (this.consecutiveFailures > 0) {
      delayMs = backoffDelay(this.consecutiveFailures);
    } else if (this.segments && this.segments.length > 0) {
      delayMs = REFRESH_POPULATED_MS;
    } else {
      delayMs = backoffDelay(this.consecutiveEmptyChecks);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshSegments();
    }, delayMs);
  }

  async refreshSegments(): Promise<void> {
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
      const segments = segmentsFor(data, videoID);
      if (segments.length === 0) {
        this.consecutiveEmptyChecks++;
        return;
      }
      this.consecutiveEmptyChecks = 0;
      const sig = segmentsSignature(segments);
      if (sig === this.segmentsSig) return;
      this.applyRefreshedSegments(segments, sig);
    } catch {
      this.consecutiveFailures++;
    } finally {
      this.refreshInFlight = false;
      if (!this.isDestroyed) this.scheduleRefresh();
    }
  }

  /** Swaps in a changed segment list mid-video. */
  applyRefreshedSegments(segments: Segment[], sig: string): void {
    const before = this.segments || [];
    const beforeUUIDs = new Set(before.map((s) => s.UUID).filter(Boolean));
    const added = segments.filter(
      (s) => s.UUID && !beforeUUIDs.has(s.UUID)
    ).length;

    this.segments = segments;
    this.segmentsSig = sig;
    this.terminalHandled.clear();
    this.rebuildSegments();
    this.markers?.render();
    sponsorBlockUI.updateSegments(this.popupSegments(segments));
    sponsorBlockUI.scheduleAutoShow();

    if (added > 0) {
      showNotification(NOTIFICATIONS.sponsorNew(added));
    }
    if (this.video && !this.video.paused) this.jumpToHighlight();
    this.scheduleSkip();
  }

  destroy(): void {
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

    this.markers?.stop();
    this.markers = null;

    this.leaveMutedSegment();
    this.muteSegments = [];
    this.skippableSegments = [];

    sponsorBlockUI.updateSegments([]);

    for (const remove of this.configListeners) remove();
    this.configListeners = [];

    if (this.video) {
      this.video.removeEventListener('play', this.scheduleSkipHandler);
      this.video.removeEventListener('pause', this.scheduleSkipHandler);
      this.video.removeEventListener('timeupdate', this.scheduleSkipHandler);
      this.video.removeEventListener('playing', this.playingHandler);
      this.video.removeEventListener('timeupdate', this.muteCheckHandler);
      this.video.removeEventListener('seeked', this.seekedHandler);
      this.video.removeEventListener('volumechange', this.volumeChangeHandler);
      this.video.removeEventListener('ended', this.endedHandler);
    }
  }
}

// Explicit window property rather than module-scope `let`: on Chromium 38 a
// second hashchange never saw the first one's value change (cause unknown), so the workaround is kept.
window.sponsorblock = null;

// The options panel suppresses the SponsorBlock popup through the ui.ts seam.
setSponsorBlockPanelSync(sponsorBlockUI.setSuppressed.bind(sponsorBlockUI));

function uninitializeSponsorblock(): void {
  if (!window.sponsorblock) {
    return;
  }
  try {
    window.sponsorblock.destroy();
  } catch {
    // A throwing destroy must not stop the teardown.
  }
  window.sponsorblock = null;
}

function syncForCurrentRoute(): void {
  const newURL = new URL(location.hash.substring(1), location.href);
  // Detach on non-/watch paths so SponsorBlock does not attach to the home page's playback preview video.
  if (newURL.pathname !== '/watch' && window.sponsorblock) {
    uninitializeSponsorblock();
    return;
  }

  const videoID = newURL.searchParams.get('v');
  const needsReload =
    videoID &&
    (!window.sponsorblock || window.sponsorblock.videoID !== videoID);

  if (needsReload) {
    uninitializeSponsorblock();

    if (configRead('enableSponsorBlock')) {
      const handler = new SponsorBlockHandler(videoID);
      window.sponsorblock = handler;
      void handler.init();
    }
  }
}

window.addEventListener('hashchange', syncForCurrentRoute, false);

// A cold start can land directly on #/watch, where no hashchange follows.
syncForCurrentRoute();

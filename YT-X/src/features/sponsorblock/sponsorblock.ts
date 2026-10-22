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
import { fetchJsonWithTimeout } from '../../youtube/hooks/fetch-timeout';
import { isArray, isRecord } from '../../youtube/json';

/** A well-formed API segment: a category and a numeric [start, end] in seconds. */
interface Segment {
  category: string;
  segment: readonly [number, number];
  actionType: string | undefined;
  UUID: string | undefined;
}

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
const FETCH_ACTION_TYPES = encodeURIComponent(JSON.stringify(['skip', 'mute']));

// Waits before re-asking when both servers failed; an empty answer ends the retries.
const RETRY_DELAYS = [2000, 4000];

/** Periodic re-check while a video plays: 15-minute interval with segments, 5/10/20/30-minute back-off while empty or failing; a pause-time check runs on resume. */
const MINUTE_MS = 60 * 1000;
const REFRESH_POPULATED_MS = 15 * MINUTE_MS;
const REFRESH_BACKOFF_MS = [5, 10, 20, 30].map((m) => m * MINUTE_MS);

/** The back-off delay after `checks` consecutive empty or failed checks. */
function backoffDelay(checks: number): number {
  const index = Math.min(Math.max(1, checks), REFRESH_BACKOFF_MS.length) - 1;
  return REFRESH_BACKOFF_MS[index] ?? REFRESH_POPULATED_MS;
}

const SEGMENT_CATEGORY_KEYS = SEGMENT_CATEGORIES.map((c) => c.configKey);

// Fixed palette shared with the popup (sponsorblock-ui.ts) so the overlay and popup agree.
function getSegmentColor(category: string): string {
  return categoryInfo(category)?.color || '#0072ff';
}

/** Order-independent identity of a segment list, to tell a real change from a re-send. */
function segmentsSignature(segments: readonly Segment[]): string {
  return segments
    .map(
      (s) =>
        s.UUID ||
        `${s.category}:${s.actionType}:${s.segment[0]}:${s.segment[1]}`
    )
    .sort()
    .join('|');
}

/** Validates one API entry (a real category and a numeric [start, end]); null for a malformed one. */
function toSegment(entry: unknown): Segment | null {
  if (!isRecord(entry)) return null;
  const { category, segment, actionType, UUID } = entry;
  if (typeof category !== 'string' || !isArray(segment)) return null;
  const [start, end] = segment;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  return {
    category,
    segment: [start, end],
    actionType: typeof actionType === 'string' ? actionType : undefined,
    UUID: typeof UUID === 'string' ? UUID : undefined
  };
}

/** The sorted, well-formed segments for `videoID` in an API answer (the hash-prefix answer lists several videos). */
function segmentsFor(data: unknown, videoID: string): Segment[] {
  const videoData = isArray(data)
    ? data.find((x) => isRecord(x) && x['videoID'] === videoID)
    : data;
  const raw = isRecord(videoData) ? videoData['segments'] : undefined;
  if (!isArray(raw)) return [];

  const segments: Segment[] = [];
  for (const entry of raw) {
    const segment = toSegment(entry);
    if (segment) segments.push(segment);
  }
  return segments.sort((a, b) => a.segment[0] - b.segment[0]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SponsorBlockHandler {
  videoID: string;
  video: HTMLVideoElement | null = null;
  active = true;

  attachVideoTimeout: Timer | null = null;
  nextSkipTimeout: Timer | null = null;

  slider: Element | null = null;
  sliderInterval: ReturnType<typeof setInterval> | null = null;
  sliderObserver: MutationObserver | null = null;
  sliderSegmentsOverlay: HTMLDivElement | null = null;

  scheduleSkipHandler = (): void => this.scheduleSkip();
  // A duration is often unknown or short at init, so re-run the whole overlay build on durationchange.
  durationChangeHandler = (): void => this.buildOverlay();
  playingHandler = (): void => {
    if (this.refreshPending) void this.refreshSegments();
    sponsorBlockUI.scheduleAutoShow();
  };
  muteCheckHandler = (): void => {
    if (this.muteSegments.length || this.mutedSegment) {
      this.checkMutedSegment();
    }
  };
  seekedHandler = (): void => this.checkMutedSegment();

  segments: Segment[] | null = null;
  skippableSegments: Segment[] = [];
  skippableCategories: string[] = [];
  muteSegments: MuteSegment[] = [];
  mutedSegment: MuteSegment | null = null;
  mutedBefore = false;
  segmentsSig = '';

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
      if (configRead('sbPeriodicRefresh')) {
        // Stay alive with nothing to skip: later submissions are picked up by the refresh.
        if (data !== null) this.consecutiveEmptyChecks++;
        this.scheduleRefresh();
      }
      return;
    }

    this.rebuildSegments();
    sponsorBlockUI.updateSegments(segments);
    sponsorBlockUI.scheduleAutoShow();
    this.buildOverlay();
    this.scheduleRefresh();
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
        this.skippableCategories.includes(seg.category)
    );
    this.rebuildMuteSegments();
  }

  /** Segments the API marks `mute` are muted rather than skipped, when enabled; the viewer's own mute state comes back on the way out, on a seek away and on destroy. */
  rebuildMuteSegments(): void {
    const list: MuteSegment[] = [];
    if (configRead('enableMutedSegments')) {
      for (const seg of this.segments || []) {
        if (seg.actionType !== 'mute' || seg.category === 'poi_highlight') {
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
    if (!this.mutedSegment) this.mutedBefore = video.muted;
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
    if (this.video) this.video.muted = this.mutedBefore;
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
    video.addEventListener('durationchange', this.durationChangeHandler);
    video.addEventListener('playing', this.playingHandler);
    video.addEventListener('timeupdate', this.muteCheckHandler);
    video.addEventListener('seeked', this.seekedHandler);
  }

  buildOverlay(): void {
    if (!this.video || !this.video.duration) {
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

  /** Redraws the overlay marks; called again on durationchange so a duration reported short early is undone once the real one arrives. */
  drawSegments(): void {
    const overlay = this.sliderSegmentsOverlay;
    if (!overlay) return;
    overlay.textContent = '';
    const videoDuration = this.video && this.video.duration;
    if (!videoDuration) return;

    (this.segments || []).forEach((segment) => {
      const [start, end] = segment.segment;
      const elm = document.createElement('div');
      elm.className = 'ytx-sponsorblock-segment';
      elm.style.backgroundColor = getSegmentColor(segment.category);
      elm.style.left = `${(start / videoDuration) * 100.0}%`;
      elm.style.width = `${((end - start) / videoDuration) * 100.0}%`;
      overlay.appendChild(elm);
    });
  }

  startSliderWatch(): void {
    const addSliderOverlay = () => {
      if (this.slider && this.sliderSegmentsOverlay) {
        this.slider.appendChild(this.sliderSegmentsOverlay);
      }
    };

    const watchForSlider = () => {
      if (this.sliderInterval) clearInterval(this.sliderInterval);

      this.sliderInterval = setInterval(() => {
        const nodes = document.querySelectorAll('[idomkey=progress-bar]');
        const last = nodes[nodes.length - 1];
        if (!last) return; // no slider found yet
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

        if (this.sliderInterval) clearInterval(this.sliderInterval);
        this.sliderInterval = null;
        observer.observe(last, {
          childList: true,
          subtree: true
        });
        addSliderOverlay();
      }, 100);
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.removedNodes) {
          for (const node of m.removedNodes) {
            if (node === this.sliderSegmentsOverlay) {
              addSliderOverlay();
            }
            if (node === this.slider) {
              observer.disconnect();
              watchForSlider();
            }
          }
        }
      });
    });
    this.sliderObserver = observer;

    watchForSlider();
  }

  /** The enabled, not-yet-skipped segment the playhead is in or next to reach; null when nothing is ahead, so a segment behind is never re-skipped. */
  pickSegment(currentTime: number): Segment | null {
    const once = configRead('skipSegmentsOnce');
    for (const seg of this.skippableSegments) {
      if (seg.segment[1] <= currentTime + 0.05) continue;
      if (once && this.skippedSegmentStarts.has(seg.segment[0])) continue;
      return seg;
    }
    return null;
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
    const segment = this.pickSegment(currentTime);

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

    this.nextSkipTimeout = setTimeout(() => {
      if (video.paused) {
        return;
      }

      if (video.currentTime >= end - 0.05) {
        this.scheduleSkip();
        return;
      }

      this.skippedSegmentStarts.add(start);
      const skipName =
        categoryInfo(segment.category)?.skipName || segment.category;
      showNotification(NOTIFICATIONS.skipping(skipName));
      video.currentTime = end;
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
    this.rebuildSegments();
    sponsorBlockUI.updateSegments(segments);
    sponsorBlockUI.scheduleAutoShow();

    if (!this.sliderObserver) this.buildOverlay();
    else this.drawSegments();

    if (added > 0) {
      showNotification(NOTIFICATIONS.sponsorNew(added));
    }
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

    for (const remove of this.configListeners) remove();
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

window.addEventListener(
  'hashchange',
  () => {
    const newURL = new URL(location.hash.substring(1), location.href);
    // Detach on non-/watch paths so SponsorBlock does not attach to the home page's playback preview video.
    if (newURL.pathname !== '/watch' && window.sponsorblock) {
      uninitializeSponsorblock();
      return;
    }

    const videoID = newURL.searchParams.get('v');
    const needsReload =
      videoID &&
      (!window.sponsorblock || window.sponsorblock.videoID != videoID);

    if (needsReload) {
      uninitializeSponsorblock();

      if (configRead('enableSponsorBlock')) {
        const handler = new SponsorBlockHandler(videoID);
        window.sponsorblock = handler;
        void handler.init();
      }
    }
  },
  false
);

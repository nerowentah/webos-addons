import sha256 from 'tiny-sha256';
import {
  configAddChangeListener,
  configRead,
  configRemoveChangeListener,
  sponsorblockAPI
} from './config';
import { setSponsorBlockPopupSync, showNotification } from './ui';
import sponsorBlockUI from './Sponsorblock-UI.js';

// Copied from https://github.com/ajayyy/SponsorBlock/blob/9392d16617d2d48abb6125c00e2ff6042cb7bebe/src/config.ts#L179-L233
const barTypes = {
  sponsor: { color: '#00d400', name: 'sponsored segment' },
  intro: { color: '#00ffff', name: 'intro' },
  outro: { color: '#0202ed', name: 'outro' },
  interaction: { color: '#cc00ff', name: 'interaction reminder' },
  selfpromo: { color: '#ffff00', name: 'self-promotion' },
  music_offtopic: { color: '#ff9900', name: 'non-music part' },
  preview: { color: '#008fd6', name: 'recap or preview' },
  poi_highlight: { color: '#ff1684', name: 'highlight' },
  filler: { color: '#7300ff', name: 'tangents/jokes' },
  hook: { color: '#395699', name: 'hook/greetings' }
};

const SEGMENT_COLOR_KEY = {
  sponsor: 'sponsorColor',
  intro: 'introColor',
  outro: 'outroColor',
  interaction: 'interactionColor',
  selfpromo: 'selfpromoColor',
  music_offtopic: 'musicofftopicColor',
  preview: 'previewColor',
  poi_highlight: 'poi_highlightColor',
  filler: 'fillerColor',
  hook: 'hookColor'
};

// Segment colors are user-configurable (Segment Colors section of the options
// panel). Falls back to the static barTypes palette when a category has no
// config key of its own.
function getSegmentColor(category) {
  const colorKey = SEGMENT_COLOR_KEY[category];
  if (colorKey) {
    try {
      return configRead(colorKey);
    } catch {
      // Unknown config key - fall through to the static fallback below.
    }
  }
  return (barTypes[category] && barTypes[category].color) || '#0072ff';
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
  segments = null;
  skippableCategories = [];

  lastScheduled = null;

  constructor(videoID) {
    this.videoID = videoID;
    this.configListeners = [];
    this.skippedSegmentStarts = new Set();
  }

  async init() {
    const videoHash = sha256(this.videoID).substring(0, 4);
    const categories = [
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
    ];
    let results;
    try {
      const resp = await fetch(
        `${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(JSON.stringify(categories))}`
      );

      if (!resp.ok) {
        console.warn(this.videoID, 'SponsorBlock request failed:', resp.status);
        return;
      }

      results = await resp.json();
    } catch (err) {
      console.warn(this.videoID, 'SponsorBlock error:', err);
      return;
    }

    const result = results.find((v) => v.videoID === this.videoID);
    console.info(this.videoID, 'Got it:', result);

    if (!result || !result.segments || !result.segments.length) {
      console.info(this.videoID, 'No segments found.');
      sponsorBlockUI.updateSegments([]);
      return;
    }

    this.segments = result.segments;
    this.skippableCategories = this.getSkippableCategories();
    sponsorBlockUI.updateSegments(this.segments);

    this.scheduleSkipHandler = () => this.scheduleSkip();
    this.durationChangeHandler = () => this.buildOverlay();

    this.watchSkipConfig();

    this.attachVideo();
    this.buildOverlay();
  }

  getSkippableCategories() {
    const skippableCategories = [];
    if (configRead('enableSponsorBlockSponsor')) {
      skippableCategories.push('sponsor');
    }
    if (configRead('enableSponsorBlockIntro')) {
      skippableCategories.push('intro');
    }
    if (configRead('enableSponsorBlockOutro')) {
      skippableCategories.push('outro');
    }
    if (configRead('enableSponsorBlockInteraction')) {
      skippableCategories.push('interaction');
    }
    if (configRead('enableSponsorBlockSelfPromo')) {
      skippableCategories.push('selfpromo');
    }
    if (configRead('enableSponsorBlockMusicOfftopic')) {
      skippableCategories.push('music_offtopic');
    }
    if (configRead('enableSponsorBlockPreview')) {
      skippableCategories.push('preview');
    }
    if (configRead('enableSponsorBlockHighlight')) {
      skippableCategories.push('poi_highlight');
    }
    if (configRead('enableSponsorBlockFiller')) {
      skippableCategories.push('filler');
    }
    if (configRead('enableSponsorBlockHook')) {
      skippableCategories.push('hook');
    }
    return skippableCategories;
  }

  // Category toggles in the options panel only affect the in-memory
  // skippableCategories set once loaded; re-evaluate it (and re-arm any pending
  // skip) whenever one of them changes so toggles apply without a remount.
  watchSkipConfig() {
    const categoryKeys = [
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
    const callback = () => {
      this.skippableCategories = this.getSkippableCategories();
      this.scheduleSkip();
    };
    categoryKeys.forEach((key) => {
      this.configListeners.push({ key, callback });
      configAddChangeListener(key, callback);
    });
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
  }

  buildOverlay() {
    if (this.sliderSegmentsOverlay) {
      console.info('Overlay already built');
      return;
    }

    if (!this.video || !this.video.duration) {
      console.info('No video duration yet');
      return;
    }

    const videoDuration = this.video.duration;

    this.sliderSegmentsOverlay = document.createElement('div');
    this.sliderSegmentsOverlay.className =
      'ytaf-sponsorblock-segment-container';
    this.segments.forEach((segment) => {
      const [start, end] = segment.segment;
      const elm = document.createElement('div');
      elm.className = 'ytaf-sponsorblock-segment';
      elm.style['background-color'] = getSegmentColor(segment.category);
      elm.style['left'] = `${(start / videoDuration) * 100.0}%`;
      elm.style['width'] = `${((end - start) / videoDuration) * 100.0}%`;
      this.sliderSegmentsOverlay.appendChild(elm);
    });

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

  // Re-applies user-configurable colors to an already built overlay. Called by
  // the options panel whenever a Segment Colors value changes.
  drawOverlay() {
    if (!this.sliderSegmentsOverlay || !this.segments) return;
    const children = this.sliderSegmentsOverlay.children;
    this.segments.forEach((segment, i) => {
      const elm = children[i];
      if (!elm) return;
      elm.style['background-color'] = getSegmentColor(segment.category);
    });
  }

  scheduleSkip() {
    if (!this.active) {
      console.info(this.videoID, 'No longer active, ignoring...');
      return;
    }

    if (!this.video) {
      return;
    }

    if (this.video.paused) {
      console.info(this.videoID, 'Currently paused, ignoring...');
      return;
    }

    // Sometimes timeupdate event (that calls scheduleSkip) gets fired right before
    // already scheduled skip routine below. Let's just look back a little bit
    // and, in worst case, perform a skip at negative interval (immediately)...
    const nextSegments = this.segments.filter(
      (seg) =>
        seg.segment[0] > this.video.currentTime - 0.3 &&
        seg.segment[1] > this.video.currentTime - 0.3
    );
    nextSegments.sort((s1, s2) => s1.segment[0] - s2.segment[0]);

    if (!nextSegments.length) {
      if (this.nextSkipTimeout) {
        clearTimeout(this.nextSkipTimeout);
        this.nextSkipTimeout = null;
      }
      this.lastScheduled = null;
      console.info(this.videoID, 'No more segments');
      return;
    }

    const [segment] = nextSegments;
    const [start, end] = segment.segment;
    const skipDelay = (start - this.video.currentTime) * 1000;

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
      start - this.video.currentTime
    );

    this.nextSkipTimeout = setTimeout(() => {
      if (this.video.paused) {
        console.info(this.videoID, 'Currently paused, ignoring...');
        return;
      }
      if (!this.skippableCategories.includes(segment.category)) {
        console.info(
          this.videoID,
          'Segment',
          segment.category,
          'is not skippable, ignoring...'
        );
        return;
      }

      if (
        configRead('skipSegmentsOnce') &&
        this.skippedSegmentStarts.has(start)
      ) {
        console.info(this.videoID, 'Segment already skipped, ignoring...');
        return;
      }

      this.skippedSegmentStarts.add(start);
      const skipName = barTypes[segment.category]?.name || segment.category;
      console.info(this.videoID, 'Skipping', segment);
      showNotification(`Skipping ${skipName}`);
      this.video.currentTime = end;
      this.scheduleSkip();
    }, skipDelay);
  }

  destroy() {
    console.info(this.videoID, 'Destroying');

    this.active = false;

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

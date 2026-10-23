import './sponsorblock-markers.css';
import { categoryInfo } from './categories';
import { markerFrame, type Segment } from './segments';

const CONTAINER_ATTR = 'data-ytx-sponsorblock-container';
const MARKER_ATTR = 'data-ytx-sponsorblock-marker';
const TRACK_IDOM_KEYS = ['segment', 'cue-ranges', 'slider'];

interface Parts {
  progressBar: Element;
  track: Element;
}

interface InitialPlayerResponse {
  videoDetails?: { lengthSeconds?: string | number };
}

/** The first child track on a progress-bar candidate; null when the candidate is a childless wrapper. */
function findTrack(progressBar: Element): Element | null {
  for (const key of TRACK_IDOM_KEYS) {
    const track = progressBar.querySelector(`[idomkey="${key}"]`);
    if (track) return track;
  }
  return null;
}

/** The last connected progress bar with a real track, or null when the controls are not in the DOM. */
function findParts(): Parts | null {
  const bars = Array.from(
    document.querySelectorAll('[idomkey="progress-bar"]')
  ).filter((bar) => bar.isConnected);

  for (let i = bars.length - 1; i >= 0; i--) {
    const bar = bars[i];
    if (!bar) continue;
    const track = findTrack(bar);
    if (track) return { progressBar: bar, track };
  }
  return null;
}

/** The video duration, with the same fallbacks as the skip logic: media, player response, segment end. */
function getDuration(video: HTMLVideoElement, segments: readonly Segment[]): number {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }

  const response = (window as Window & { ytInitialPlayerResponse?: InitialPlayerResponse })
    .ytInitialPlayerResponse;
  const length = Number(response?.videoDetails?.lengthSeconds);
  if (Number.isFinite(length) && length > 0) return length;

  let maxEnd = 0;
  for (const segment of segments) {
    if (segment.segment[1] > maxEnd) maxEnd = segment.segment[1];
  }
  return maxEnd;
}

/**
 * Draws the SponsorBlock segment markers over the seek bar. The overlay lives
 * inside the track, because YouTube drops the wrapper's positioning styles on
 * a re-render and absolutely positioned children would jump.
 */
export default class SegmentMarkers {
  video: HTMLVideoElement;
  getSegments: () => readonly Segment[];
  getCategories: () => readonly string[];

  active = false;
  host: HTMLElement | null = null;
  track: Element | null = null;
  container: HTMLDivElement | null = null;
  observer: MutationObserver | null = null;
  frame: number | null = null;
  lastKey = '';
  hostPosition: string | null = null;

  constructor(
    video: HTMLVideoElement,
    getSegments: () => readonly Segment[],
    getCategories: () => readonly string[]
  ) {
    this.video = video;
    this.getSegments = getSegments;
    this.getCategories = getCategories;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.video.addEventListener('durationchange', this.scheduleHandler);
    this.video.addEventListener('loadedmetadata', this.scheduleHandler);
    this.video.addEventListener('seeked', this.scheduleHandler);
    this.video.addEventListener('playing', this.scheduleHandler);
    this.schedule();
  }

  stop(): void {
    this.active = false;
    this.video.removeEventListener('durationchange', this.scheduleHandler);
    this.video.removeEventListener('loadedmetadata', this.scheduleHandler);
    this.video.removeEventListener('seeked', this.scheduleHandler);
    this.video.removeEventListener('playing', this.scheduleHandler);
    this.observer?.disconnect();
    this.observer = null;
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.clear();
  }

  /** Re-renders now; safe to call when segments or category settings change. */
  render(): void {
    this.sync();
  }

  scheduleHandler = (): void => this.schedule();

  schedule(): void {
    if (!this.active || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.sync();
    });
  }

  private sync(): void {
    if (!this.active) return;

    const categories = this.getCategories();
    const segments = this.getSegments().filter((segment) =>
      categories.includes(segment.category)
    );
    if (segments.length === 0) {
      this.clear();
      return;
    }

    const parts =
      this.host && this.track && this.host.isConnected && this.track.isConnected
        ? { progressBar: this.host, track: this.track }
        : findParts();
    if (!parts) {
      this.clear();
      return;
    }

    this.attach(parts);
    this.draw(segments);
  }

  private attach(parts: Parts): void {
    const nextHost = parts.track as HTMLElement;
    if (this.host === nextHost && this.container?.isConnected) return;

    this.clear();
    this.host = nextHost;
    this.track = parts.track;
    this.host.classList.add('ytx-sb-marker-host');
    this.hostPosition = this.host.style.position;
    if (getComputedStyle(this.host).position === 'static') {
      this.host.style.position = 'relative';
    }

    const container = document.createElement('div');
    container.className = 'ytx-sb-marker-container';
    container.setAttribute(CONTAINER_ATTR, '');
    this.container = container;
    this.host.appendChild(container);

    this.observe(parts.progressBar);
  }

  private observe(progressBar: Element): void {
    this.observer?.disconnect();
    const root = progressBar.parentElement ?? progressBar;
    const observer = new MutationObserver((mutations) => {
      if (!this.active) return;
      if (mutations.every((mutation) => this.isOwnMutation(mutation))) return;
      this.schedule();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    this.observer = observer;
  }

  private isOwnMutation(mutation: MutationRecord): boolean {
    if (mutation.type === 'attributes') {
      return this.isOwnNode(mutation.target);
    }
    for (const node of mutation.addedNodes) {
      if (!this.isOwnNode(node)) return false;
    }
    for (const node of mutation.removedNodes) {
      if (!this.isOwnNode(node)) return false;
    }
    return true;
  }

  private isOwnNode(node: Node): boolean {
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!el) return false;
    return (
      el.hasAttribute(CONTAINER_ATTR) ||
      el.hasAttribute(MARKER_ATTR) ||
      el.closest(`[${CONTAINER_ATTR}]`) !== null
    );
  }

  private draw(segments: readonly Segment[]): void {
    const host = this.host;
    const track = this.track;
    const container = this.container;
    if (!host || !track || !container || !container.isConnected) return;

    const duration = getDuration(this.video, segments);
    if (!(duration > 0)) {
      container.textContent = '';
      return;
    }

    const hostRect = host.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const key = [
      duration,
      trackRect.left - hostRect.left,
      trackRect.top - hostRect.top,
      trackRect.width,
      trackRect.height,
      segments.map((s) => `${s.category}:${s.segment[0]}:${s.segment[1]}`).join('|')
    ].join(';');
    if (key === this.lastKey && container.childElementCount > 0) return;
    this.lastKey = key;

    container.textContent = '';
    const fragment = document.createDocumentFragment();
    for (const segment of segments) {
      const frame = markerFrame(trackRect, hostRect, duration, segment.segment);
      if (!frame) continue;
      const marker = document.createElement('div');
      marker.className = 'ytx-sb-marker';
      marker.setAttribute(MARKER_ATTR, '');
      marker.style.left = `${frame.left}px`;
      marker.style.top = `${frame.top}px`;
      marker.style.width = `${frame.width}px`;
      marker.style.height = `${frame.height}px`;
      marker.style.backgroundColor =
        categoryInfo(segment.category)?.color || '#717171';
      fragment.appendChild(marker);
    }
    container.appendChild(fragment);
  }

  /** Removes the overlay and the host marker class, restoring the inline position. */
  private clear(): void {
    this.container?.remove();
    this.container = null;
    if (this.host) {
      this.host.classList.remove('ytx-sb-marker-host');
      if (this.hostPosition !== null) {
        this.host.style.position = this.hostPosition;
      }
    }
    this.host = null;
    this.track = null;
    this.lastKey = '';
    this.observer?.disconnect();
    this.observer = null;
  }
}

import { isArray, isRecord } from '../../youtube/json';

/** A well-formed API segment: a category and a numeric [start, end] in seconds. */
export interface Segment {
  category: string;
  segment: readonly [number, number];
  actionType: string | undefined;
  UUID: string | undefined;
}

/** Upper bound on segments kept per video; the popup lists them and the marker overlay draws one element each. */
export const MAX_SEGMENTS = 500;

/** Periodic re-check while a video plays: 15-minute interval with segments, 5/10/20/30-minute back-off while empty or failing; a pause-time check runs on resume. */
const MINUTE_MS = 60 * 1000;
export const REFRESH_POPULATED_MS = 15 * MINUTE_MS;
const REFRESH_BACKOFF_MS = [5, 10, 20, 30].map((m) => m * MINUTE_MS);

/** The back-off delay after `checks` consecutive empty or failed checks. */
export function backoffDelay(checks: number): number {
  const index = Math.min(Math.max(1, checks), REFRESH_BACKOFF_MS.length) - 1;
  return REFRESH_BACKOFF_MS[index] ?? REFRESH_POPULATED_MS;
}

/** Order-independent identity of a segment list, to tell a real change from a re-send. */
export function segmentsSignature(segments: readonly Segment[]): string {
  return segments
    .map(
      (s) =>
        s.UUID ||
        `${s.category}:${s.actionType}:${s.segment[0]}:${s.segment[1]}`
    )
    .sort()
    .join('|');
}

/** Validates one API entry (a category and a finite 0 <= start < end in seconds; a highlight is a point, start == end); null for a malformed one. */
export function toSegment(entry: unknown): Segment | null {
  if (!isRecord(entry)) return null;
  const { category, segment, actionType, UUID } = entry;
  if (typeof category !== 'string' || !isArray(segment)) return null;
  const [start, end] = segment;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start) return null;
  if (end === start && category !== 'poi_highlight') return null;
  return {
    category,
    segment: [start, end],
    actionType: typeof actionType === 'string' ? actionType : undefined,
    UUID: typeof UUID === 'string' ? UUID : undefined
  };
}

/** The sorted, well-formed segments (at most MAX_SEGMENTS) for `videoID` in an API answer (the hash-prefix answer lists several videos). */
export function segmentsFor(data: unknown, videoID: string): Segment[] {
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
  return segments
    .sort((a, b) => a.segment[0] - b.segment[0])
    .slice(0, MAX_SEGMENTS);
}

/** A terminal segment may end this close to the media duration and still be treated as the end. */
export const TERMINAL_TOLERANCE_S = 1;

/** A terminal skip lands this far before the end, so `ended` fires instead of a seek to duration. */
export const NATURAL_END_TAIL_S = 0.25;

/**
 * Where to seek for a segment ending at `end`; null when no seek is needed
 * (the playhead is already inside the natural-end tail), which is what breaks
 * the terminal-segment restart loop.
 */
export function skipTarget(
  end: number,
  duration: number,
  currentTime: number
): number | null {
  if (!Number.isFinite(end)) return null;
  if (!Number.isFinite(duration) || duration <= 0) return end;

  if (end >= duration - TERMINAL_TOLERANCE_S) {
    const target = Math.max(0, duration - NATURAL_END_TAIL_S);
    return currentTime < target ? target : null;
  }

  return Math.min(end, duration);
}

/** The start of the first highlight ahead of `currentTime` (by more than 1 s), or null when none is. */
export function nextHighlightStart(
  segments: readonly Segment[],
  currentTime: number
): number | null {
  for (const seg of segments) {
    if (seg.category !== 'poi_highlight') continue;
    if (seg.segment[0] > currentTime + 1) return seg.segment[0];
  }
  return null;
}

/** The first of `segments` (sorted by start) not already behind `currentTime` and not excluded; null when nothing is ahead. */
export function pickSegment(
  segments: readonly Segment[],
  currentTime: number,
  excludedStarts: ReadonlySet<number> | null
): Segment | null {
  for (const seg of segments) {
    if (seg.segment[1] <= currentTime + 0.05) continue;
    if (excludedStarts?.has(seg.segment[0])) continue;
    return seg;
  }
  return null;
}

/** A rectangle, in CSS pixels; a subset of DOMRect so the geometry is testable without a DOM. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MarkerFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where one marker goes, in pixels relative to the host. The track is the
 * full-width seek bar; the host is the element the marker layer is anchored
 * to (usually the track itself, or a surrounding player bar).
 */
export function markerFrame(
  track: Rect,
  host: Rect,
  duration: number,
  segment: readonly [number, number]
): MarkerFrame | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (!(track.width > 0) || !(track.height > 0)) return null;

  const start = Math.min(Math.max(segment[0], 0), duration);
  const end = Math.min(Math.max(segment[1], start), duration);
  const left = Math.min((start / duration) * track.width, track.width);
  const width = Math.min(
    track.width,
    Math.max(2, ((end - start) / duration) * track.width)
  );

  return {
    left: Math.min(left, track.width - width) + (track.left - host.left),
    top: track.top - host.top,
    width,
    height: track.height
  };
}

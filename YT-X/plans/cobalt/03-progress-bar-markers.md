# Cobalt-03 — Restore SponsorBlock progress-bar markers

Status: code committed; 1080p alignment checked on the TV 2026-10-23, 720p and re-render open
Reference: upstream `05ca3ff` (`webapp/src/sponsorblock.js`)
Touches: `src/features/sponsorblock/sponsorblock.ts`,
`src/ui/ui.css` (or a dedicated `sponsorblock.css`),
`tools/sponsorblock-segments.test.ts`

## Problem

The rework deletes `buildOverlay()`, `drawSegments()`, `startSliderWatch()`,
`slider*` state and the `.ytx-sponsorblock-segment*` CSS. YT-X now shows no
segment markers on the progress bar at all. That is a regression against both
the previous YT-X and RF1705.

The old implementation was already broken on current TV builds: it counted
`[idomkey=progress-bar]` nodes (`case 3` / `case 2`) and looked for
`[idomkey=slider]`. Upstream `05ca3ff` documents the current DOM:

- the bar no longer emits `idomkey="segment"`;
- the full-width track is `segment`, `cue-ranges`, or `slider`;
- markers must be anchored **inside the track**, because YouTube drops the
  wrapper's inline `position: relative` on re-render and absolutely positioned
  markers jump.

So the fix is to port, not to delete.

## Goal

Category-coloured markers render at the correct offset over the seek bar in the
1080p and 720p builds, survive a bar re-render or pause overlay, and never
duplicate.

## Design

Port the upstream helpers into `sponsorblock.ts` (or a small
`sponsorblock-markers.ts` if the file grows too large):

```ts
const TRACK_IDOM_KEYS = ['segment', 'cue-ranges', 'slider'];

function findTrack(progressBar: Element): Element | null;
function findProgressBarParts(): {
  progressBar: Element;
  track: Element;
} | null;
function markerHost(progressBar: Element, track: Element): Element;
```

Rules:

- Prefer the last connected `[idomkey="progress-bar"]`; if markers are already
  connected, keep their host instead of jumping to a transient bar.
- For each candidate, accept the first child matching `TRACK_IDOM_KEYS`; if none
  matches, ignore that candidate (do not fall back to a childless wrapper).
- `markerHost` returns the track when present; otherwise
  `closest('ytlr-multi-markers-player-bar-renderer')` or the bar.
- Set `position: relative` on the host only when computed position is `static`,
  and `overflow: visible`.
- Create one marker per segment, `position: absolute`, `pointer-events: none`,
  category colour, `border-radius` and `opacity` from the old CSS.
- Compute `left/top/width/height` from `track.getBoundingClientRect()` relative
  to the host, with `left/width` clamped to `[0, 1]` of duration and a minimum
  width of 2 px. Use `getVideoDuration(video, segments)` with the same fallbacks
  as upstream when `video.duration` is not finite: `video.duration` →
  `window.ytInitialPlayerResponse.videoDetails.lengthSeconds` → the largest
  segment end.
- Re-render on `durationchange`/`loadedmetadata`, on `seeked`, and via a
  `MutationObserver` on the player bar; coalesce with `requestAnimationFrame`.
  Ignore mutations that only add our own markers, otherwise the observer loops.
- Use `data-ytx-sponsorblock-marker` / `-container` attributes rather than
  class prefix matching to find and remove our nodes.
- Remove the overlay on `destroy()` and when the segment list becomes empty.

CSS: restore a scoped block (prefer a new `sponsorblock-markers.css` imported by
`sponsorblock.ts`, not `ui.css`):

```css
.ytx-sb-marker-host {
  overflow: visible !important;
}
.ytx-sb-marker {
  position: absolute;
  pointer-events: none;
  border-radius: 9001px;
  opacity: 0.6;
}
```

Do not reintroduce the old global `[idomkey='slider'],
[idomkey='progress-bar'] { overflow: unset !important; }`; scope it to the host
we own.

If the marker work is too large for one change, split the pure geometry into a
first PR (tested) and the observer/DOM wiring into a second.

## Tests

Extract the pure part and test it in `tools/sponsorblock-segments.test.ts`:

```ts
export function markerFrame(
  track: { left: number; top: number; width: number; height: number },
  host: { left: number; top: number },
  duration: number,
  segment: readonly [number, number]
): { left: number; top: number; width: number; height: number } | null;
```

Cover: mid-video offsets, clamping a segment beyond duration, zero/unknown
duration → null, a very short segment gets the 2 px minimum, and a segment
starting before 0 clamps to 0.

The DOM wiring is verified on device: open the controls at 102 s, screenshot,
and compare marker positions against `currentTime` and the bar geometry.

## Verification

- `npm test`, `npm run lint`, `npm run lint:css`, `npm run type-check`.
- On device, a video with segments: markers appear when controls show, sit on
  the track, and stay aligned after pause/resume and after the bar re-renders
  (open the guide and return).
- 720p build: markers still align (no fixed-pixel assumptions).
- No marker duplicates when pausing and resuming repeatedly.
- No regression to the popup or skip logic.

## Risks

- The TV DOM is YouTube's; selectors can change again. Keep them in one module
  and fail closed (no markers, no exceptions).
- A full-document MutationObserver is expensive. Observe only the player bar
  subtree, coalesce with rAF, and disconnect on destroy.
- Markers are decorative; if host detection fails, do not throw or block skips.

## Acceptance criteria

- [ ] Markers render for enabled categories on the current TV DOM.
- [ ] They remain aligned after a re-render and in the 720p build.
- [ ] No duplicate overlays and no observer loop.

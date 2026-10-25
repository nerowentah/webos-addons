# Cobalt-01 — SponsorBlock highlight fetch and lifecycle

Status: code committed; first-play check passed on the TV 2026-10-23; the cases below are open
Scope: the webOS-UA build only. SponsorBlock is not built into Cobalt builds (user-agent or native).
Addresses: the rework's new `enableSponsorBlockHighlight` path
Touches: `src/features/sponsorblock/sponsorblock.ts`,
`src/features/sponsorblock/segments.ts`,
`tools/sponsorblock-segments.test.ts`

## Problem

The highlight feature added by the rework cannot work in either direction.

1. **The request excludes highlights.** `FETCH_ACTION_TYPES` is
   `['skip', 'mute']` (`sponsorblock.ts:41`). SponsorBlock's `poi_highlight`
   segments have `actionType: "poi"`, not `skip` or `mute`, so the API filters
   them out before the client sees them.
2. **The jump only runs on `playing`.** `jumpToHighlight()` is called from
   `playingHandler` (`:63-64`) only. `init()` fetches asynchronously and never
   calls it (`:114-145`), and `applyRefreshedSegments()` does not either. On a
   cold play the fetch normally resolves after `playing`, so the first play does
   not jump; it waits for a pause and resume.
3. **The wrong highlight wins.** `this.segments.find(...)` (`:323`) picks the
   first highlight in the sorted list, then sets `highlightDone = true`
   (`:329`) before checking whether it is already behind the playhead. A
   highlight that is behind permanently suppresses any later one.

## Goal

When `Skip to Highlight` is enabled and a highlight is ahead, the first play
seeks to it once, shows the existing notification, and never jumps backwards.
When it is disabled, behaviour is unchanged.

## Design

### 1. Request the `poi` action type

```ts
const FETCH_ACTION_TYPES = encodeURIComponent(
  JSON.stringify(['skip', 'mute', 'poi'])
);
```

Keep sending the full category list; the server intersects both filters. Add a
comment that `poi_highlight` is `actionType: "poi"` so this is not re-broken.

### 2. Make selection pure and testable

Add to `segments.ts`:

```ts
/** The start of the first highlight strictly ahead of `currentTime`; null when none is. */
export function nextHighlightStart(
  segments: readonly Segment[],
  currentTime: number
): number | null;
```

Implementation: earliest `category === 'poi_highlight'` with
`start > currentTime + 1` (the existing 1 s tolerance). Highlight segments are
points, so this only reads `segment[0]`.

`jumpToHighlight()` becomes:

```ts
const start = nextHighlightStart(this.segments || [], video.currentTime);
if (start === null) return;
this.highlightDone = true;
...
video.currentTime = start;
```

Do not set `highlightDone` when nothing is ahead. If a later highlight should
still be reachable after the viewer seeks back, reset `highlightDone` on
`seeked` when the playhead moves before the jumped start; keep that out of the
first change unless it is easy to verify.

### 3. Run it after the data arrives

- In `init()`, after `rebuildSegments()`, call `jumpToHighlight()` when
  `this.video && !this.video.paused`. If `attachVideo()` had to poll and finds
  the video later, call it from that path too; otherwise a slow player attach
  waits for the first pause/resume.
- In `applyRefreshedSegments()`, do the same after `rebuildSegments()`.
- Keep the `playingHandler` call for the resume case.
- Guard with `isDestroyed` as the other paths do.

Do not move it to `timeupdate`: the jump is a one-shot, not a poller.

## Tests

Extend `tools/sponsorblock-segments.test.ts`:

- `nextHighlightStart`: no highlight → null; one behind → null; one exact
  boundary (`currentTime + 1`) → null; one ahead → its start; several → the
  earliest ahead, not the earliest overall; zero-length highlight accepted.
- A request-shape test is optional, but if `FETCH_ACTION_TYPES` is exported,
  assert it contains `poi`.

The handler wiring (init/refresh/playing) is verified on device: a video with a
submitted highlight is the fixture.

## Verification

- `npm test`, `npm run lint`, `npm run type-check`.
- On device with `Skip to Highlight` on: open a video with a highlight ahead;
  the toast appears once on the first play and the playhead moves to it.
- Seek behind the highlight after the jump; the handler must not jump again
  unless the reset is implemented.
- With the setting off: no seek, no toast.
- A video with no highlight: no toast, no freeze.

## Risks

- Highlights are voted points, not ranges; a stale highlight may land in an ad
  or a sponsor segment. That is the category's own data quality, not ours.
- A very early highlight (`< 1 s`) is treated as already reached; that is the
  existing tolerance and avoids a jarring seek from 0.
- `poi` is a distinct action type; do not merge it with `skip` in the request or
  the server will return only one of them.

## Acceptance criteria

- [ ] The first play jumps to an ahead highlight exactly once.
- [ ] A behind highlight never causes a backward seek or suppresses a later one.
- [ ] `Skip to Highlight` off is a no-op.

# RF1705-01 — SponsorBlock terminal segments

Status: ready to implement
Addresses (RF1705 tracker): #112, #79, and the #85/#90 fix that never reached this fork
Touches: `src/features/sponsorblock/segments.ts`, `src/features/sponsorblock/sponsorblock.ts`, `tools/sponsorblock-segments.test.ts`

## Problem

When a SponsorBlock segment ends at (or past) the end of the video, the app seeks
to a point at or beyond media duration. YouTube's player treats that as a wrap,
so the video restarts from 0. Because `pickSegment` only ignores segments whose
`end <= currentTime`, the same segment is then ahead of the playhead again and
re-triggers — the infinite loop reported in #79 and #112.

Relevant current code:

- `sponsorblock.ts` `scheduleSkip()` timeout: `video.currentTime = end;` with no
  duration check.
- `segments.ts` `pickSegment()`: skips a segment only when
  `seg.segment[1] <= currentTime + 0.05`.
- `video.duration` is read nowhere in the SponsorBlock path (only
  `ui/time-remaining.ts` uses it).
- `skipSegmentsOnce` defaults to `false` (`config.ts`), so the existing
  "skip once" guard cannot break the loop.
- `enableSponsorBlockOutro` defaults to `true`, which is the category most
  likely to end at duration.

Note: `segments.ts` is currently an uncommitted extraction out of
`sponsorblock.ts`. This plan builds on that extraction; land it first or
rebase onto it.

## Goal

A segment that runs to the end of the video is skipped once, lands just short of
the end, and lets the native `ended` transition happen. No restart, no loop.

## Non-goals

- Changing the category defaults.
- Pausing/advancing to the next video, or any autoplay behaviour.
- Rewriting the refresh/back-off logic.

## Design

### `segments.ts`

Add a tail constant and two pure helpers:

```ts
/** Playback tail left before the end so the native `ended` transition still fires. */
export const END_TAIL_S = 0.35;

/** Where to seek for a segment ending at `end`. Unknown/short duration returns `end` unchanged. */
export function skipTarget(end: number, duration: number): number;

/** Whether the segment ends within the tail of the video (i.e. seeking to `end` would be a wrap). */
export function isTerminal(end: number, duration: number): boolean;
```

`skipTarget` semantics:

1. `duration` not finite or `<= 0` → return `end` (unchanged behaviour; nothing
   to clamp against).
2. Otherwise return `Math.min(end, Math.max(0, duration - END_TAIL_S))`.
   This both clamps real overshoot (bad data) and leaves the tail for videos
   where `end === duration`.

`isTerminal` returns `false` for unknown duration, else
`end >= duration - END_TAIL_S`.

Rename the third parameter of `pickSegment` from `skippedStarts` to
`excludedStarts` — it now carries both skip-once starts and terminal starts.
No behaviour change on its own.

### `sponsorblock.ts`

1. New per-video field `terminalHandled = new Set<number>()`. The handler is
   created per `videoID`, so the set cannot leak across videos.
2. New helper used by `scheduleSkip()`:

   ```ts
   excludedStarts(): ReadonlySet<number> | null
   ```

   - `skipSegmentsOnce` off and `terminalHandled` empty → `null`.
   - `skipSegmentsOnce` off and `terminalHandled` non-empty → `terminalHandled`.
   - `skipSegmentsOnce` on → union of `skippedSegmentStarts` and
     `terminalHandled` (only allocate the merged set when both are non-empty).

3. In the skip timeout, replace the two guards and the seek:

   ```ts
   const duration = video.duration;
   const target = skipTarget(end, duration);
   const terminal = isTerminal(end, duration);

   // Buffering or a rate change can leave the playhead short of the start, or
   // already past the target: re-evaluate instead of jumping.
   if (video.currentTime < start - 0.05 || video.currentTime >= target - 0.05) {
     if (terminal) this.terminalHandled.add(start);
     this.nextSkipTimeout = null;
     this.lastScheduled = null;
     this.scheduleSkip();
     return;
   }

   this.skippedSegmentStarts.add(start);
   if (terminal) this.terminalHandled.add(start);
   showNotification(...);
   video.currentTime = target;
   ```

   Two changes matter: the "already past" test now compares against `target`,
   not `end` (otherwise a terminal segment reschedules forever without ever
   being recorded as handled), and the seek never exceeds `duration - END_TAIL_S`.

4. `destroy()` clears `terminalHandled` alongside the other state.

### Related one-liner in the same change

Add an `ended` listener that calls `leaveMutedSegment()`. A video that ends
inside a mute segment currently leaves `mutedSegment` set and the element muted
until the next seek or destroy, so the following video can start muted.

## Tests

Extend `tools/sponsorblock-segments.test.ts` (it already loads the module
through `loadSrc`):

- `skipTarget`: mid-video `end` unchanged; `end === duration` → `duration - 0.35`;
  `end > duration` → clamped; `duration = Infinity` → unchanged; `duration = 0`
  and `NaN` → unchanged; very short video (`duration < 0.35`) → `0`.
- `isTerminal`: true at the boundary and beyond, false mid-video, false when
  duration is unknown.
- `pickSegment` with an `excludedStarts` set: a terminal start that has been
  handled is not returned again; `null` keeps current behaviour.

## Verification

- `npm test`, `npm run lint`, `npm run type-check`.
- On device (`npm run deploy`), open a video whose outro segment ends at the
  duration (an outro-heavy video is easiest to find):
  - the "Skipping Outro" toast appears once;
  - playback ends normally and does not restart;
  - scrubbing back before the segment and letting it play again does not
    re-skip a terminal segment.
- A mid-video sponsor segment still skips as before, and `Skip Once` still
  behaves as documented.

## Risks

- `video.duration` is `NaN`/`Infinity` for live streams; `skipTarget` and
  `isTerminal` both fall through to unchanged behaviour, so live is untouched.
- A terminal segment shorter than 0.35 s gets a near-zero seek; harmless, and
  the "already past target" branch covers it.
- If YouTube reports a duration slightly shorter than the real media length,
  the tail seek may still end up within a second of the end — acceptable, and
  strictly better than a wrap.

## Acceptance criteria

- No video restarts after a terminal SponsorBlock skip, with `Skip Once` both
  on and off.
- No terminal segment is re-skipped within the same video.
- Existing segment/back-off tests pass unchanged.

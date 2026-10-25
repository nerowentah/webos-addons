# Cobalt-02 — Terminal SponsorBlock segments

Status: code committed; terminal skip checked on the TV 2026-10-23 (`Skip Once` default only)
Scope: the webOS-UA build only. SponsorBlock is not built into Cobalt builds (user-agent or native).
Addresses: RF1705 #112, #79, and the #85 fix in upstream `dc071f6`
Supersedes: the former `rf1705-01` plan (deleted)
Touches: `src/features/sponsorblock/segments.ts`,
`src/features/sponsorblock/sponsorblock.ts`,
`tools/sponsorblock-segments.test.ts`

## Problem

`scheduleSkip()` still ends with `video.currentTime = end`
(`sponsorblock.ts:405`). When an outro/sponsor segment ends at (or past) the
media duration, that seek is a wrap on YouTube's player: the video restarts
from 0, the same segment is ahead of the playhead again, and it loops. The
rework's new guard:

```ts
if (video.currentTime < start - 0.05 || video.currentTime >= end - 0.05) {
```

only re-evaluates when the timer fires short of the start or already past the
end. It does not clamp the seek and does not record a terminal segment, so it
does not fix #112/#79. `skipSegmentsOnce` defaults to `false`, so the existing
guard cannot break the loop.

This is exactly the bug RF1705 fixed in `dc071f6`:

```js
const TERMINAL_SEGMENT_TOLERANCE_SECONDS = 1;
const NATURAL_END_TAIL_SECONDS = 0.25;
```

## Goal

A segment that ends within the last second of the video is skipped once, lands
0.25 s before the end, and lets the native `ended` transition happen. No
restart, no loop, with `Skip Once` both on and off.

## Design

Port the upstream helper rather than re-deriving it. In `segments.ts`:

```ts
export const TERMINAL_TOLERANCE_S = 1;
export const NATURAL_END_TAIL_S = 0.25;

/**
 * Where to seek for a segment ending at `end`; null when no seek is needed
 * (already inside the tail), which is what breaks the terminal loop.
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
```

Semantics to preserve:

- Unknown/zero duration → `end` unchanged (live streams are untouched).
- `end` overshoots duration → clamp to `duration`.
- Terminal segment and the playhead already in the tail → `null`, never seek
  backwards.
- A very short video returns `0` as the terminal target.

In `sponsorblock.ts` (import `skipTarget` and `TERMINAL_TOLERANCE_S` from
`./segments`):

1. Add `terminalHandled = new Set<number>()` (per handler, therefore per video).
2. Replace the third `pickSegment` argument with an `excludedStarts` set built
   from `skippedSegmentStarts` (when `skipSegmentsOnce`) and `terminalHandled`.
   Rename the parameter in `segments.ts` accordingly.
3. In the timeout:

   ```ts
   const target = skipTarget(end, video.duration, video.currentTime);
   const terminal = end >= video.duration - TERMINAL_TOLERANCE_S;

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
   showNotification(...);
   video.currentTime = target;
   ```

   The `target - 0.05` comparison (not `end - 0.05`) is what makes a terminal
   segment record itself instead of rescheduling forever.

4. Add `ended` → `leaveMutedSegment()` so a video ending inside a mute segment
   does not leave the element muted for the next one.
5. Clear `terminalHandled` in `destroy()` with the other per-video state.

## Tests

Extend `tools/sponsorblock-segments.test.ts`:

- `skipTarget(120, 120, 90)` → `119.75`; `skipTarget(119.8, 120, 90)` →
  `119.75`; `skipTarget(120, 120, 119.9)` → `null`.
- Mid-video `end` unchanged; `end > duration` clamps; `NaN`/`0` duration
  returns `end`; duration `< 0.25` returns `0`.
- `pickSegment` with an `excludedStarts` set does not return a handled
  terminal start; `null` keeps the current behaviour.

## Verification

- `npm test`, `npm run lint`, `npm run type-check`.
- On device, find a video whose outro segment ends at duration:
  - the toast appears once;
  - playback reaches `ended` and does not restart;
  - seeking back before the segment and replaying does not re-skip it.
- A mid-video segment still skips normally; `Skip Once` still behaves.

## Risks

- Live streams report `Infinity`/`NaN`; both helpers fall through to the
  unchanged seek, so live is untouched.
- A segment ending 0.9 s before duration is treated as terminal and gets a
  0.25 s tail. That is upstream's tolerance and is deliberate.
- The tail is shorter than one frame at 24 fps; `ended` still fires because the
  media element reaches its duration.

## Acceptance criteria

- [ ] No video restarts after a terminal skip, with `Skip Once` on or off.
- [ ] A terminal segment is not re-skipped within the same video.
- [ ] A video ending inside a mute segment restores audio state.

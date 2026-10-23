# RF1705-02 — Playback-rate quality

Status: measure first, then implement
Addresses (RF1705 tracker): #107, #81, #46 (partially — see non-goals)
Touches: `src/features/playback/video-quality.ts`, `tools/inspect.ts` (probe only)

## Problem

On the Cobalt builds, raising playback speed above 1.0x collapses quality
(1080p50 → 480p25) and/or freezes the video. Two separate causes are mixed
together in that tracker:

1. **Cobalt-specific** — `#46`: Cobalt's MIME parser rejects the fractional
   bitrate YouTube puts in the codec string at non-1.0 rates. This cannot occur
   here: YT-X has no MIME parser, YouTube's own player negotiates MSE.
2. **Not Cobalt-specific** — the _observation_ that YouTube lowers the optimal
   representation when the playback rate is applied. If the platform advertises
   a 60 fps ceiling, `50 fps × 1.25 = 62.5` exceeds it and 1080p50 stops being
   optimal. The webview advertises its own `MediaCapabilities`, so this can
   affect YT-X too.

Current YT-X behaviour:

- `video-quality.ts` calls `setPlaybackQualityRange('highres', 'highres')`
  once, on `playbackStart`, and then removes its own listener.
- Nothing listens for `ratechange`, so a speed change is never followed by a
  re-assert.
- `forceHighResVideo` defaults to `false` (`config.ts`), so out of the box the
  app leaves the choice entirely to YouTube.

The defect is therefore plausible here but **not yet observed**. Step 0 exists
to keep us from coding against a hypothesis.

## Goal

When `Default Max Resolution` is enabled, changing the playback rate does not
silently drop the presentation quality, and the app does not fight the user's
own quality choice.

## Non-goals

- Re-implementing Cobalt's bitrate parsing workaround (`#46`). Out of scope by
  architecture; note it in the tracker reply instead.
- Changing YouTube's speed list or adding a speed control (`#106`). Separate
  effort — see "Follow-ups".
- Touching the decoder or codec negotiation (`force-codec.ts` owns that).

## Step 0 — measure on device

Before any code change, capture the actual behaviour:

1. `npm run deploy`
2. Play a 50 fps video at 1080p50 with `Default Max Resolution` **on**.
3. `npm run inspect -- eval` the following and record at 1.0x, then at 1.25x:
   - `document.querySelector('video').playbackRate`
   - `document.querySelector('video').getVideoPlaybackQuality()`
   - the player's `getPlaybackQualityLabel()` and
     `getAvailableQualityData().slice(0,3)`
4. Repeat with `Default Max Resolution` **off**.
5. Also record `MediaCapabilities.decodingInfo()` for the 1080p50 AV1/VP9
   configuration to see what the webview actually advertises.

Outcome decides the plan:

- **Collapse occurs with the setting on** → implement as below.
- **Collapse occurs regardless of the setting** → implement as below, but the
  feature becomes "keep the user's selected quality across rate changes"
  rather than "force max".
- **No collapse at all** → close `#107`/`#81` as Cobalt-only for YT-X, keep this
  file as the record of the measurement, and skip the code change.

## Design (if step 0 confirms)

Split the one-shot behaviour into an idempotent apply plus a guard against
rate-change downgrades.

```ts
/** Re-assert window after a rate change: long enough for renegotiation, short enough not to fight a manual pick. */
const RATE_REASSERT_WINDOW_MS = 5000;
```

1. Extract the current body of `setPlaybackQuality` into
   `applyMaxQuality(manager)` so it can be called more than once (drop the
   `removeEventListener` from inside it; keep the per-video listener wiring in
   `handleNewVideo`).
2. In `handleNewVideo`, after registering `playbackStart`, bind a `ratechange`
   listener to the current `<video>` element (use `getVideo()` from
   `core/utils` rather than a raw query so it stays consistent with the other
   modules, and remove the previous binding first).
3. On `ratechange`:
   - bail when `!shouldForce()` or `playerMode === PREVIEW`;
   - debounce ~250 ms (YouTube fires several changes per user action);
   - call `applyMaxQuality` once, then verify with the existing 100 ms poll for
     up to `RATE_REASSERT_WINDOW_MS`;
   - do nothing further if the quality label did not change.
4. Clear the debounce/poll timers in the `newVideo` handler and when the label
   matches, so nothing keeps running across videos.
5. Keep the `Selected/Max` toast behaviour unchanged.

Do **not** re-assert on a timer: only in response to a rate change within the
window, otherwise the app overrides a deliberate manual quality selection.

## Tests

`video-quality.ts` is DOM/player-bound and has no unit-test harness today.
Keep the decision logic testable by extracting a pure predicate, e.g.

```ts
export function shouldReassert(
  force: boolean,
  preview: boolean,
  hasPlayed: boolean,
  rate: number
): boolean;
```

and cover it in a new `tools/video-quality.test.ts` following the `loadSrc`
pattern (`tools/sponsorblock-segments.test.ts` is the model). The player wiring
itself is verified on device.

## Verification

- 50 fps 1080p video: 1.0x → 1.25x keeps 1080p50 with `Default Max Resolution`
  on.
- Same video, setting off: behaviour unchanged from today.
- Manual quality pick (720p) at 1.0x, then a rate change: the app must not
  override it.
- Shorts/preview players are not touched (`PREVIEW` mode guard).
- `npm run lint:all`, `npm run verify`.

## Risks

- Re-asserting too eagerly fights the user. Mitigated by the setting gate, the
  preview guard and the time window.
- YouTube may ignore `setPlaybackQualityRange` for the current video until the
  next segment fetch; the existing poll is what tells us, and a no-op result is
  reported honestly rather than looped on.
- If the root cause turns out to be server-side ABR, no client fix will work.
  Accept and document; do not ship a hack that pins a representation.

## Acceptance criteria

- Either a measured, reproducible improvement with the setting on, or a
  documented "not reproducible in the webview" that closes the tracker items.
- No change to behaviour when the setting is off.

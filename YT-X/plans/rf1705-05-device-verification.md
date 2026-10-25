# RF1705-05 — Device verification pass

Status: needs a TV (manual, not CI)
Addresses (RF1705 tracker): #35, #102, #103, #99, #25, #66, #74, #101, #104, #109, #110
Touches: verification results only — this plan produces findings, not product code

## Why

The tracker is full of behaviours that are _claims about the runtime_, and YT-X
runs on a different runtime than the reporter used. Some of those claims are
answered by the architecture (no Cobalt binary, no `/tmp` state), but several
are still open questions in the webview and the codebase has no answer either
way:

| Topic                       | Code status                                                                                           | Tracker           |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------- |
| Live streams                | no live-specific path at all                                                                          | #102, #103, #99   |
| Voice search                | `appinfo.json` declares `inAppVoiceIntent` + `supportQueryRouting`; nothing in `src/` reads an intent | #35, #103         |
| AV1 on MStar/Realtek        | `forceVideoCodec: 'no_av1'` exists, default `auto`                                                    | #110, #99         |
| Cast / DIAL                 | already owned by [`ytx-cast-native-only.md`](./ytx-cast-native-only.md) — do not duplicate here       | #25               |
| Settings across a cold boot | `localStorage`, no `/tmp`                                                                             | #66, #110 issue 3 |
| Family account picker       | opt-in hook, default off                                                                              | #109              |
| Second launch after Home    | web app lifecycle + `supportQuickStart: true`                                                         | #74               |
| Fonts (Korean / math)       | LG system fonts; only Arial→Noto Sans Math is vendored                                                | #101, #104        |

Each row is a half-hour check. Doing them together, on one build, produces a
defensible answer for the whole class instead of a fix per bug report.

## Native Cobalt matrix — separate track

This plan verifies the **userscript** in the webview. A native Cobalt package
has a different runtime and appinfo; its matrix is
[`native-cobalt-05`](./native-cobalt/05-device-matrix.md). Do not reuse these
results for a native build.

Native candidates include:

- 4K/UHD: `#2`, `#42`, `#47`
- launch/crash: `#10`, `#15`, `#20`, `#29`, `#30`, `#32`, `#33`, `#36`,
  `#41`, `#45`, `#68`, `#84`, `#87`, `#88`, `#92`, `#97`, `#108`
- build/runtime: `#38`, `#39`, `#40`, `#53`, `#54`, `#65`, `#75`, `#76`,
  `#83`, `#89`, `#94`, `#95`, `#96`, `#98`
- live/codec: `#99`, `#102`, `#103`, `#110`, `#111`
- speed: `#46`, `#81`, `#106`, `#107`
- input: `#105`
- packaging/feed: `#7`, `#17`, `#18`, `#19`, `#37`, `#70`, `#82`, `#93`,
  `#100`, `#113`, `#114`

## Tooling you already have

```sh
npm run deploy:fhd                                # build + install + launch
npm run inspect                                  # DOM, focus, video, heap
npm run inspect -- eval "<expr>"                 # one-off probe
npm run drive -- "down,down,ok" shot.png         # real key/pointer input
npm run verify:device                            # deploy + on-TV checks
npm run compare:tv                               # paused-frame TV snapshot
```

Reminders from the README that matter here: screenshots cannot capture the
hardware video plane (use `video.currentTime` advancing), and `dispatchEvent`/
`el.click()` from `eval` do not reach the app's listeners — pointer flows must
go through `drive`.

## 1. Live streams — highest value

1. Open a live stream. Probe:
   ```js
   const v = document.querySelector('video');
   ({
     duration: v.duration,
     currentTime: v.currentTime,
     w: v.videoWidth,
     h: v.videoHeight
   });
   ```
   `duration === Infinity` is expected; `currentTime` must advance.
2. `npm run inspect` → check for a stalled decoder, and read the player's
   `getPlayerStateObject().isLive` / `getPlaybackQualityLabel()`.
3. Repeat with `Video Codec = Avoid AV1`.

Decision: if it works, the tracker items (#102/#103) are Cobalt-only and should
be closed with a pointer to YT-X. If it fails with AV1 and works with
`Avoid AV1`, make `Avoid AV1` the documented workaround and consider whether
`auto` should exclude AV1 on the affected SoC band. If it fails both ways, open
a real YT-X issue with the capture — this is the one item that would justify new
product code.

## 2. AV1 / "video format is not supported" (#110 issue 1, #99)

1. On an MStar-class set (the report's LM21A), play a 1440p/4K AV1 video at
   `Video Codec = Auto`.
2. Then `Avoid AV1` (reload the app: the setting says so).
3. Record: does playback start, does `currentTime` advance, what does
   `getPlaybackQualityLabel()` report, and what did YouTube negotiate.

Also worth checking `#99`'s "only fails in guest mode" report — sign out, play,
then sign in. That is a YouTube-side gate, not ours, but it changes the answer
we give.

## 3. Voice search (#35, #103)

1. From the home screen, press and hold the mic key, say a query.
2. Watch whether YouTube's own search opens or nothing happens.
3. In `npm run inspect`, check whether a launch/relaunch with an intent payload
   occurs, and whether `handleRelaunch` in `core/utils.ts` receives anything.

Decision: if nothing arrives, `inAppVoiceIntent` is not sufficient for this app
id and the honest answer is "not supported" — remove the misleading README
silence, or implement the intent handler if the payload does arrive.

## 4. Cast / DIAL (#25) — owned elsewhere

Skip this item: [`ytx-cast-native-only.md`](./ytx-cast-native-only.md) already
covers the cast destination and removes `dialAppName`. Read its verification
steps instead of inventing a second procedure.

The only thing worth recording here is the answer to #25's actual claim ("cast
fails because the app is not installed"): once the native-only plan is verified
on Android **and** iOS, that report is answered, not fixed.

The other half of #25 — the webOS 25 cast-core freeze — is governed by
`block-webos-cast.ts` and is already guarded by firmware version, so no extra
verification is needed beyond a single cast on a webOS 25 set after the change.

## 5. Persistence across a real cold boot (#66, #110 issue 3)

1. Change two YT-X settings and confirm YouTube's own previews toggle.
2. Disable **Quick Start+**, power the TV fully off, power on.
3. Re-open the app: settings must survive. This is the check that `/tmp` state
   cannot pass and `localStorage` should.

## 6. Second launch (#74)

1. Open the app, press Home, then open it again — three times.
2. Repeat after switching inputs.
3. If the second launch fails, the relevant knobs are `supportQuickStart` and
   the app's lifecycle handling; `#74`'s native-Cobalt explanation does not
   apply to this web app, so this would be a genuine web-app finding. For the
   native package, `#74` does apply and is tested in `native-cobalt-05`.

## 7. Family account picker (#109)

Enable `Skip Family Account Picker`, fully restart the app, and confirm it lands
on the home screen. The reporter is on webOS 6.5.3 — test on that firmware,
since the hook depends on `startAccountSelectorCommand` still existing in the
current YouTube TV client.

## 8. Fonts (#101, #104)

1. Switch the app language to Korean — check for tofu in menus, titles,
   SponsorBlock labels and the options panel.
2. Check superscripts/math glyphs in a video title (this is what the vendored
   Noto Sans Math covers).

## Recording the results

Append a short section per topic to the plan folder as
`plans/results-<date>.md`: TV model, webOS version, build version, probe output
verbatim, verdict (works / broken / Cobalt-only). That file is what the tracker
replies get written from — do not answer a hardware report from inference.

## Acceptance criteria

- Every row in the table above has a recorded verdict with the probe output.
- Anything that turns out to be a real YT-X defect becomes its own numbered
  plan in this folder rather than being fixed opportunistically here.

# Native Cobalt-06 — Settings against functionality

Status: host-side audit done, per-setting TV check open (TV offline)
Addresses: "native broke most features"
Touches: `src/native-main.ts`, `src/ui/controls.ts`, TV verification only

## Finding (host side)

The native full bundle used to be the userscript bundle: its modules are evaluated in one chain, so the first module
that throws on Cobalt (missing API, absent page object) stopped every module after it, while the panel (loaded early in
the chain) still showed every option. That matches "most features broke" without any one feature being wrong.

Change: `src/native-main.ts` now loads the same modules one by one (`tools/native-main.test.ts` pins the list to
`userScript.ts`). A module that throws loses only itself, a module that waits for a YouTube object (top-level await)
does not hold the others, and the result per module is in `window.__ytxModules` and localStorage `ytx-modules`
(`ytx-err` keeps the messages). Options that cannot work on native are greyed in the panel (`NATIVE_INACTIVE`).

## Setting map

| Setting (key)                                                                                                                                                                                                                                                                         | Module                                                                             | Bundle       | Native expectation                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| Ad Block, tracking, auto captions, rows ahead, live/upcoming/top games/most relevant (`enableAdBlock`, `keepPlaybackTracking`, `enableTrackingBlock`, `disableAutoCaptions`, `loadRowsAhead`, `removeLiveVideos`, `removeUpcomingVideos`, `removeTopLiveGames`, `removeMostRelevant`) | `features/adblock/adblock.ts`                                                      | early + full | Works if the response hooks run; needs a live-ad proof             |
| Shorts, members-only, end screens (`removeShorts`, `removeMembersOnly`, `removeEndscreen`)                                                                                                                                                                                            | `shorts.ts`, `members-only.ts`, `remove-endscreen.ts`                              | early + full | Same as above                                                      |
| Force high res, show quality (`forceHighResVideo`, `showQualityOnStart`)                                                                                                                                                                                                              | `playback/video-quality.ts`                                                        | full         | Needs the player API object; check `__ytxModules`                  |
| Video codec (`forceVideoCodec`)                                                                                                                                                                                                                                                       | `playback/force-codec.ts`                                                          | full         | The Cobalt binary negotiates codecs itself; likely a no-op, verify |
| Keep playing, keyboard search, time remaining, account picker (`keepPlaying`, `keyboardSearch`, `showTimeRemaining`, `autoAccountSelect`)                                                                                                                                             | `keep-playing`, `keyboard-search`, `ui/time-remaining`, `mods/auto-account-select` | full         | Needs `closest`/idle polyfills (done); verify each                 |
| Pointer button, logo, animations, panel care (`pointerSettingsButton`, `hideLogo`, `disableAnimations`, `panelCareMode`)                                                                                                                                                              | `ui/badge.ts`, `ui/panel-care.ts`                                                  | full         | Verified for badge/panel care; logo/animations open                |
| Block Cast Wake (`blockWebosCast`)                                                                                                                                                                                                                                                    | `platform/block-webos-cast.ts`                                                     | full         | Inactive on native (greyed)                                        |

## TV check (when it is back)

1. `node tools/native.ts update --model-full 65QNED86ASA.ATSFLJD --key …`, relaunch, wait for Home.
2. Read `window.__ytxModules` and `ytx-err` over the debug port: every non-greyed module must be `ok`; fix each `error:`.
3. Per row above, toggle the setting and confirm its effect; record pass/fail here.

## Acceptance

- No module reports `error:` on the TV except by design.
- Every active option has a recorded effect; every inactive one is greyed with a reason.

Scripted pass: `npm run verify:ytx -- --suite native --port 19222` (web: `--suite web`) opens the panel with GREEN, checks module status, CSP violations and the panel's accessibility attributes, and writes `dist/verify-<suite>.md` with the manual items still to do.

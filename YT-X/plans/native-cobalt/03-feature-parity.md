# Native Cobalt-03 — Feature parity

Status: matrix below partly filled from the 2026-10-23/24 TV runs
Addresses: product features that behave differently under native Cobalt
Touches: webapp features, config, UI input

## Goal

Create an explicit include/adapt/defer/drop matrix for every YT-X feature and
the RF1705 features worth adopting. Do not assume a webview feature works
because its code loads.

## YT-X features to evaluate

- ad blocking, thumbnail quality, Shorts removal, members-only removal;
- logo/end-screen removal;
- force quality and force codec;
- Keep Playing;
- SponsorBlock skip/mute/highlight/markers;
- Panel Care;
- account-selector bypass;
- settings panel and keyboard/pointer input.

## RF1705 features to evaluate

- Return YouTube Dislike;
- auto-login/account selection;
- playback speed shortcuts and custom ranges;
- subtitle toggle;
- Shorts visibility;
- sponsored QR blocking;
- configurable startup page;
- autostart/relaunch handling;
- Homebrew/feed integration.

## Matrix so far (LG 65QNED86 only)

| Feature                                             | Native status                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Ad blocking                                         | Adapted: response hooks in the preload; synthetic payload proven, live response open |
| Settings panel, themes, Panel Care                  | Included (flex layout, no grid; Auto resolves to QNED)                               |
| Thumbnail quality, keyboard search                  | Adapted: need the `requestIdleCallback` / `closest` polyfills                        |
| Shorts, members-only, end screens                   | Included (shared hooks), not individually device-tested                              |
| SponsorBlock                                        | Dropped on Cobalt (page CSP blocks the servers), by design                           |
| Block Cast Wake                                     | Dropped on native (greyed out; nothing to block)                                     |
| Magic Remote pointer/wheel, voice, speed, subtitles | Untested                                                                             |

## Required decisions

Each row must end as one of:

| Decision | Meaning                                                        |
| -------- | -------------------------------------------------------------- |
| Included | Native implementation is tested on the device matrix.          |
| Adapted  | Behavior exists but differs from the userscript; document how. |
| Deferred | Explicitly out of this release with an issue reference.        |
| Dropped  | Feature is incompatible or not worth the native cost; say why. |

Pay particular attention to:

- **Playback speed** (`#4`, `#22`, `#23`, `#46`, `#81`, `#103`, `#106`,
  `#107`): Cobalt’s MIME parser rejects fractional bitrates; the webview never
  sees that path. Native speed support is not a copy of the userscript fix.
- **Magic Remote** (`#105`): pointer and wheel are platform input, not a webapp
  feature. The feature matrix should record which controls actually respond.
- **Voice search** (`#35`, `#103`): separate from pointer support; do not claim
  it from the remote working.
- **Cast/DIAL** (`#25`): separate app-id and native appinfo path.
- **Settings persistence** (`#66`): `localStorage` under Cobalt must survive a
  cold boot and a second launch.

## Issue inputs

- Playback speed: `#4`, `#22`, `#23`, `#46`, `#81`, `#103`, `#106`, `#107`
- Subtitles: `#31`
- Voice search: `#35`
- Shorts: `#44`, `#48`, `#52`
- QR: `#49`, `#55`
- Startup: `#50`, `#86`, `#91`
- Settings: `#66`
- Account selection: `#109`
- Fonts: `#101`, `#104`
- Cast: `#25`
- Magic Remote: `#105`

## Acceptance

- Every YT-X feature has a native status: included, adapted, deferred or dropped.
- No feature is assumed to work because it works in the webview.
- Playback-speed, cast and voice behavior have separate device results.
- The matrix names the issue or PR that proves each included feature.

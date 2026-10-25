# Native Cobalt-05 — Device matrix

Status: one TV recorded (LG 65QNED86, webOS 25); other rows need hardware
Addresses: native compatibility, playback, input and install results
Touches: verification results only; this plan produces findings, not product code

## Goal

Replace inference with recorded results. The userscript result in
[`../cobalt/results-2026-10-23.md`](../cobalt/results-2026-10-23.md) is one
TV on the webview path; it is not a native Cobalt matrix.

## Coverage

Test at least:

- webOS 5.x, 6.x, 10.x, 11.x, 22, 25 and 26 where supported;
- OLED and non-OLED;
- ARMv7 and AArch64;
- MStar, Realtek and LG1213-class SoCs;
- cold boot, second launch, resume and cast.

If the support floor changes, record the decision and remove unsupported rows
instead of silently omitting them.

## Per-build checks

Record:

- launch result and process state;
- UI render;
- clear playback, 4K, HDR, AV1/VP9;
- live streams;
- settings persistence;
- remote input:
  - pointer hover and click;
  - wheel up/down in menus and over the player;
  - natural-scroll direction;
  - Back/Home/color/media keys;
  - pointer/wheel after resume and second launch;
- cast/DIAL;
- package size and install path.

## Issue inputs

- 4K/quality: `#2`, `#42`, `#47`
- Launch/crash: `#10`, `#15`, `#20`, `#29`, `#30`, `#32`, `#33`, `#36`,
  `#41`, `#45`, `#68`, `#84`, `#87`, `#88`, `#92`, `#97`, `#99`, `#108`
- Live: `#102`, `#103`
- Speed: `#81`, `#107`
- AV1/Starfish: `#99`, `#110`
- Settings/account: `#66`, `#109`
- Voice: `#35`
- Cast: `#25`
- Magic Remote: `#105`
- Packaging/feed: `#7`, `#17`, `#18`, `#19`, `#37`, `#70`, `#82`, `#93`,
  `#100`, `#113`, `#114`

## Recording

Append a dated section to `plans/results-<date>.md` with:

- TV model, webOS version, SoC, build version and app id;
- raw probe output, not a summary;
- verdict: works / broken / Cobalt-only / unsupported;
- whether the result applies to the native package or the userscript.

## Acceptance

- A dated `plans/results-<date>.md` exists with raw probe output.
- A one-TV result is never presented as a compatibility matrix.
- Magic Remote pointer, wheel and common keys are verified or the limitation is
  documented per device.
- Failures are triaged as runtime, packaging, hardware or YouTube-side.
- The native matrix is separate from the userscript matrix.

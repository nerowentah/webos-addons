# RF1705 tracker — individual implementation plans

Source review: the
[RF1705/youtube-webos-cobalt-adfree](https://github.com/RF1705/youtube-webos-cobalt-adfree)
issue tracker (100 items, all states) read against the working tree on
2026-10-22.

That project ships a patched **Cobalt binary** (~20.6 MB IPK; it owns the
player, codec negotiation, A/V pipeline, fonts and app lifecycle). YT-X ships a
**userscript** into YouTube's own web app (0.72 MB IPK; runs in the webOS
webview). Most of that tracker is therefore already structurally out of scope
here. These plans cover only what is genuinely live in this codebase, plus the
release-engineering gaps the tracker exposed.

> Unrelated batch in this folder: [WCAG 2.2 AA](./00-index.md) (plans 01–12) and
> [native-only cast](./ytx-cast-native-only.md). This batch is prefixed
> `rf1705-` so the numbering stays separate.

## Order

| #   | Plan                                                                            | Type                | Blocked by                             |
| --- | ------------------------------------------------------------------------------- | ------------------- | -------------------------------------- |
| 1   | [SponsorBlock terminal segments](./rf1705-01-sponsorblock-terminal-segments.md) | bug fix             | the in-flight `segments.ts` extraction |
| 2   | [Playback-rate quality](./rf1705-02-playback-rate-quality.md)                   | measure → fix       | step 0 (device)                        |
| 3   | [IPK packaging integrity](./rf1705-03-ipk-packaging.md)                         | release engineering | —                                      |
| 4   | [Homebrew channel feed](./rf1705-04-homebrew-repo-feed.md)                      | release engineering | 3 (needs a trustworthy artefact)       |
| 5   | [Device verification pass](./rf1705-05-device-verification.md)                  | investigation       | —                                      |

Start with 1 (real bug, reproducible, small blast radius) and 3 (independent,
mechanical). 5 runs on hardware and produces the input for 2.

## Tracker mapping

**Architecturally out of scope (no action)** — issues that live inside the
Cobalt/Starboard runtime this app does not contain:

`#15` `#16` `#20` `#29` `#30` `#32` `#33` `#36` `#41` `#42` `#45` `#47` `#54`
`#68` `#71` `#74` `#84` `#88` `#92` `#94` `#97` `#108` `#113`

**Already handled in this codebase (verify only)**

- `#21` settings nav double-step — capture-phase handler + spatial nav
- `#43` intro-skip spam — timer re-arm tolerance
- `#66` settings persistence — `localStorage`; cold-boot check in plan 5
- `#109` family account picker — `auto-account-select`, opt-in
- `#101` / `#104` fonts — LG system fonts, only Arial is overridden

**Needs the device pass (plan 5)**

`#35` `#99` `#102` `#103` `#110`

**Addressed by a plan in this folder**

| Tracker                    | Plan                                                   |
| -------------------------- | ------------------------------------------------------ |
| #112, #79                  | 1                                                      |
| #107, #81, #46             | 2                                                      |
| #70, #82                   | 3                                                      |
| #19, #93, #100, #114       | 4                                                      |
| #35, #99, #102, #103, #110 | 5                                                      |
| #25                        | [`ytx-cast-native-only.md`](./ytx-cast-native-only.md) |

Deliberately not planned:

- **#106** custom playback speeds, **#31** press-0 subtitles — the subtitle and
  shortcut-key paths were intentionally retired (`config/migrate.ts`); a speed
  UI is a product decision, not a fix. Revisit only if plan 2 shows the rate
  path is healthy.
- **#26** scrubbing bar — no reproducible signal, and the DOM belongs to
  YouTube.
- **#24** sign-outs, **#87** speed jank — both reported against Cobalt's A/V
  pipeline; no equivalent code here.
- webOS 1–5 crashes (`#32`, `#36`, `#84`, `#88`) — below the supported floor by
  policy (`.browserslistrc`, README).

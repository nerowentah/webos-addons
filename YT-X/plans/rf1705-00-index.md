# RF1705 tracker — individual implementation plans

Source review: the
[RF1705/youtube-webos-cobalt-adfree](https://github.com/RF1705/youtube-webos-cobalt-adfree)
issue tracker (114 issue/PR numbers, all states) read against committed baseline
`717b1b8` on 2026-10-23. The previous review covered 100 items on 2026-10-22.

That project ships a patched **Cobalt binary** (~20.6 MB IPK; it owns the
player, codec negotiation, A/V pipeline, fonts and app lifecycle). YT-X ships a
**userscript** into YouTube's own web app (0.72 MB IPK; runs in the webOS
webview). While YT-X stays userscript-only, most of that tracker is structurally
out of scope here. These plans cover only what is genuinely live in the
userscript codebase, plus the release-engineering gaps the tracker exposed.

If a native Cobalt port is approved, the runtime, build, hardware and feature
items move to [`plans/native-cobalt/`](./native-cobalt/00-index.md); they are not
extra userscript work.

> Unrelated batch in this folder: [WCAG 2.2 AA](./00-index.md) (plans 01–12) and
> [native-only cast](./ytx-cast-native-only.md). This batch is prefixed
> `rf1705-` so the numbering stays separate.

## Order

| #   | Plan                                                           | Type                | Blocked by                       |
| --- | -------------------------------------------------------------- | ------------------- | -------------------------------- |
| 2   | [Playback-rate quality](./rf1705-02-playback-rate-quality.md)  | measure → fix       | step 0 (device)                  |
| 3   | [IPK packaging integrity](./rf1705-03-ipk-packaging.md)        | release engineering | —                                |
| 4   | [Homebrew channel feed](./rf1705-04-homebrew-repo-feed.md)     | release engineering | 3 (needs a trustworthy artefact) |
| 5   | [Device verification pass](./rf1705-05-device-verification.md) | investigation       | —                                |

Terminal segments (former plan 1) moved to [`cobalt/02`](./cobalt/02-terminal-segments.md).
Start with 3 (independent, mechanical). 5 runs on hardware and produces the input for 2.

## Tracker mapping

At the refresh there were 35 open issues plus open PR `#111` (`#36` is open); every
open item is represented in the categories below.

**Closed items, one-line disposition** (reference only, no action):

- Closed issues, fixed upstream or a different runtime: `#3` black screen on LG C1,
  `#5` phone cast, `#6` autostart, `#8` and `#9` ads on shorts/home, `#11` playback
  error after 30-50 s, `#12` crash after language change, `#14` crash on open.
  YT-X is a userscript with its own ad blocking; none applies here.
- Closed PRs: `#27` workflow permissions and `#34` form-data CVE (upstream CI and
  dependency hygiene), `#62` Shorts blocker reload, `#77` rooted Store overlay
  (native packaging, see rf1705-03). `#78` and `#80` are the SponsorBlock marker
  fixes already ported by [cobalt/03](./cobalt/03-progress-bar-markers.md).

**Out of scope for the userscript (no action here)** — issues that live inside
the Cobalt/Starboard runtime this app does not contain:

`#15` `#16` `#20` `#29` `#30` `#32` `#33` `#36` `#41` `#42` `#45` `#47` `#54`
`#68` `#71` `#74` `#84` `#88` `#92` `#94` `#97` `#108` `#113`

**Native Cobalt candidates (separate track)** — only if the native port is
approved; do not implement these in the userscript batch:

`#2` `#4` `#10` `#15` `#20` `#22` `#23` `#29` `#30` `#31` `#32` `#33` `#36`
`#38` `#39` `#40` `#41` `#42` `#45` `#46` `#47` `#53` `#54` `#65` `#68` `#70`
`#71` `#74` `#75` `#76` `#82` `#83` `#84` `#87` `#88` `#89` `#92` `#94` `#95`
`#96` `#97` `#98` `#99` `#102` `#103` `#105` `#106` `#107` `#110` `#111`
`#113`

`#32` (webOS 3.9) and `#108` (webOS 4.10) remain below the current support
floor; the native track may revisit `#84`/`#88` only if it chooses to support
webOS 5.x.

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
| #107, #81                  | 2 (userscript measurement)                             |
| #70, #82                   | 3 (userscript); native-cobalt-04 for the native app    |
| #18, #19, #93, #100, #114  | 4                                                      |
| #35, #99, #102, #103, #110 | 5 (userscript); native-cobalt-05 for the native app    |
| #25                        | [`ytx-cast-native-only.md`](./ytx-cast-native-only.md) |
| native candidates above    | [`plans/native-cobalt/`](./native-cobalt/00-index.md)  |

**Added or corrected in the 2026-10-23 refresh** — previously absent or
under-classified:

`#2`/`#42` 4K, `#10` launch, `#22` speed, `#26` scrub defer, `#38`–`#40` build,
`#53`/`#54` compression, `#65` build, `#75`/`#76` media, `#83`/`#89` A/V,
`#87` crash, `#95`/`#96`/`#98` packaging/logging, `#105` Magic Remote, `#106`
speed, `#111` AV1 opt-out, `#113` package size.

Deliberately not planned for the userscript:

- **#106** custom playback speeds, **#31** press-0 subtitles — the subtitle and
  shortcut-key paths were intentionally retired (`config/migrate.ts`); a speed
  UI is a product decision, not a fix. Revisit only if plan 2 shows the rate
  path is healthy. Both move to native feature parity if the native port is
  approved.
- **#26** scrubbing bar — no reproducible signal, and the DOM belongs to
  YouTube.
- **#24** sign-outs, **#87** crashes — reported against Cobalt's A/V/runtime
  path; no equivalent userscript code here. `#87` is a native candidate.
- webOS 1–5 crashes (`#32`, `#36`, `#84`, `#88`) — below the userscript support
  floor by policy (`.browserslistrc`, README). The native track may choose a
  different floor.

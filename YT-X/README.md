# YouTube Extended for webOS

<p align="center">
  <img src="https://img.shields.io/badge/LG-webOS-000000?logo=webos&logoColor=white&style=flat-square" alt="webOS">
  <img src="https://img.shields.io/badge/License-GPL--3.0-informational?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Minimum-webOS%206-4e4a48?style=flat-square" alt="Minimum webOS 6">
</p>

**YT-X** is an extended YouTube client for LG webOS TVs (app ID
`youtube.leanback.v4`). It is a personal fork of
[webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos) with
extra playback and display controls, maintained in the
[nerowentah/webos-addons](https://github.com/nerowentah/webos-addons)
repository.

## Inspired by and forked from

This project is **forked from and inspired by**
[webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos); portions
of this codebase are derived from it. The **Keep Playing** feature is inspired
by [marcussacana/youtube-webos-cobalt-app](https://github.com/marcussacana/youtube-webos-cobalt-app).
Both upstream projects are licensed GPL-3.0, which this project matches (see
[License & Credits](#license--credits)).

---

## Features

### Ad Blocking & Content

- Ad blocking across the home, search, watch, and Shorts feeds, including the
  promoted and sponsored placements that only appear once signed in
- Higher-quality thumbnails
- Shorts removal (from subscriptions)
- Members-only removal across the home, search, subscription, channel, and Live
  feeds, including members-only channel sections and early-access
  "members first" posts
- YouTube logo removal
- End-screen removal

### Video Playback

- Force highest video quality
- Force video codec (AV1 / VP9 / AVC (H.264) / HEVC (H.265) / Avoid AV1)
- **Keep Playing** — prevent the "Video paused. Continue watching?" auto-pause
- Full animation support

### SponsorBlock

- [SponsorBlock](https://sponsor.ajay.app/) integration
- Auto-skip sponsors, intros, outros, interaction reminders, self-promotion,
  non-music sections, recaps, tangents/jokes, and hook/greetings
- Skip segments only once

### Interface

- Panel Care Mode with per-panel profiles: OLED-Care (true black UI) and
  QNED MiniLED-Care (dark comfort UI). Off uses the neutral translucent
  QNED-style plate
- Panel Care Mode defaults to Auto, which reads the model string from the app's
  user agent (the only signal when `webOS.deviceInfo` is unavailable) and
  applies the matching profile; unclassified panels fall back to
  Off, and the manual setting always overrides detection
- Panel Care themes only the YT-X settings panel and badge. YouTube's own
  surfaces (player, guide, browse) are never recoloured, and YT-X's playback
  additions use YouTube's dark-theme palette only: `#0f0f0f`, `#272727`,
  `#ffffff`, `#aaaaaa`, `#717171`, `#ff0000`, `#3ea6ff`
- Classic Red is the only UI theme
- Bypass the account selector screen
- YT-X settings button on screen

### System

- [Autostart support](#autostart)

> [!NOTE]
> Click the on-screen **YT-X** badge with the Magic Remote pointer to open the
> configuration screen.

---

## Requirements

- **webOS 6 or newer** (webOS TV 6, 2018 onwards)
- Uninstall the official YouTube app before installing this one

### Supported versions

The app runs inside the webOS webview, so what matters is the TV's webOS
version, which determines the browser engine:

| webOS  | Engine           | Status                        |
| ------ | ---------------- | ----------------------------- |
| 1 – 2  | Safari 7/8 (WAM) | Not supported — dropped       |
| 3 – 5  | Chrome 38 – 68   | Not supported — dropped       |
| 6      | Chrome 79        | **Minimum supported version** |
| 7 – 25 | Chrome 87+       | Supported                     |

Support for webOS 5 and older was removed because those engines lack features
the app now relies on directly. Dropping them lets the source and tooling target
ES2025 while Babel downlevels the shipped artifact to the Chrome 79 floor, and
removes the fetch, `DOMRect`, and generator polyfills.

`.browserslistrc` is the support matrix of record — changing the floor there
changes what the build is allowed to emit.

---

## Installation

Prebuilt `.ipk` releases are published on
[nerowentah/webos-addons](https://github.com/nerowentah/webos-addons/releases);
to build from source instead, continue below.

1. Clone the repository:

   ```sh
   git clone https://github.com/nerowentah/webos-addons.git
   cd webos-addons/YT-X
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Build and package the app:

   ```sh
   npm run build
   npm run package
   ```

4. Install the resulting `.ipk` (created in the project root) using one of:

   - [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop)
   - The webOS CLI, after [adding your TV](#add-the-tv-to-the-cli):
     `ares-install youtube.leanback.v4_<version>_all.ipk`

### On the TV

> [!IMPORTANT]
> If your TV is rooted, follow [the alternative setup section](#alternate-setup-rooted-tv)
> instead, then skip to [install to the TV](#installing-to-the-tv).

1. Create an [LG Developer account](https://webostv.developer.lge.com/login)
2. Install the [Developer Mode](https://in.lgappstv.com/main/tvapp/detail?appId=232503)
   app from the LG Content Store
3. Launch it, sign in with your LG Developer credentials, and enable:
   - Developer Mode
   - Key Server

### Add the TV to the CLI

```sh
npm exec ares-setup-device
```

Follow the prompts:

1. Add device
2. Enter the IP from the Developer Mode app
3. Use default values unless needed
4. Enter the 6-digit passphrase shown on the TV screen

Verify with:

```sh
npm exec ares-setup-device --list
```

Sample output:

```log
name            deviceinfo                     connection  profile    passphrase
--------------  -----------------------------  ----------  -------    ----------
mytv (default)  prisoner@192.168.137.102:9922  ssh         tv         EF32E8
```

### Alternate setup (rooted TV)

1. Enable SSH via the Homebrew Channel
2. Generate a key: `ssh-keygen -t rsa`
3. Copy `id_rsa` to `~/.ssh` (Windows: `%USERPROFILE%\.ssh`)
4. Append `id_rsa.pub` to `/home/root/.ssh/authorized_keys` on the TV
5. Register the device:

   ```sh
   ares-setup-device -a webos \
     -i "username=root" \
     -i "privatekey=id_rsa" \
     -i "passphrase=SSH_KEY_PASSPHRASE" \
     -i "host=TV_IP" \
     -i "port=22"
   ```

### Installing to the TV

```sh
npm run deploy # Builds 1920x1080, packages, installs, and launches on the default device selected via ares-setup-device.
```

---

## Autostart

To enable autostart, run the following command on the TV via **SSH** or
**Telnet**:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/addDevice' '{"appId":"youtube.leanback.v4","pigImage":"","mvpdIcon":""}'
```

This lets the app appear as an input source and launch automatically if it was
the last-used app. It stays active in the background for faster startup
(minor increase in idle memory usage).

To disable autostart:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/deleteDevice' '{"appId":"youtube.leanback.v4"}'
```

---

## Compatibility notes

### Casting on webOS 2025

On webOS 2025 firmware (webOS platform ≥ 10 / firmware ≥ 33), the built-in
Chromecast ("cast core") service conflicts with this app and freezes it
([webosbrew/youtube-webos#343](https://github.com/webosbrew/youtube-webos/issues/343)).
The app blocks its own `/wake_cast_core` fetch on those firmware versions
unless the launch came from a cast handoff (`cc2`, `dialLaunch`,
`pairingCode`, or a webOS relaunch).

The default package omits `dialAppName`, so the app does not register a DIAL
entry. The phone lists only the TV's native Cast target. The setting labelled
**Block Cast Wake (webOS 25)** controls only that wake fetch; it cannot add,
remove, or rename a cast destination. It is **off by default**, because the
native Cast receiver needs the wake to complete: with the block on, a cold cast
start left the TV unresponsive in testing. Existing installs are migrated to
off once; re-enable it only if you do not cast.

If a phone cannot find the TV, restore `"dialAppName": "YouTube"` in
`assets/appinfo.json` and rebuild. That restores the app's DIAL entry and is
the compatibility path for phones that rely on DIAL.

### Playback plates follow YouTube's own styling

YT-X does not strip `app-quality-root` from `<body>`, so YouTube's own plates
apply. The scrim, title plate and action bar are not restyled: webOS renders
`<video>` on a separate native/hardware plane that CSS `backdrop-filter` cannot
sample, so a translucent plate only ever blurred DOM content. Do not add
`transform`, `filter` or `will-change` to `<video>` or its ancestors to try to
blur the video: that breaks native pass-through and can hurt playback.

---

## Development

### Pre-requisites

- The latest **Node.js** LTS release (Node.js ships with **npm**, the package
  manager this project uses)
- **git**

### Setup

```sh
git clone https://github.com/nerowentah/webos-addons.git
cd webos-addons/YT-X
npm install
```

### Building an IPK

```sh
npm run build
npm run package
```

The `.ipk` file is generated in the project directory. Stop here if you plan to
install it via [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop),
or continue with [adding the TV to the CLI](#add-the-tv-to-the-cli) to install
it with one command.

#### Graphics resolution (1920x1080 or 1280x720)

webOS offers web apps two graphics canvases, `1920x1080` and `1280x720` — there
is no UHD canvas, and the TV upscales whichever it is given to the panel in
hardware. The default build declares `1920x1080`; to build the 720p variant:

```sh
npm run build:hd   # or: npm run package:hd
```

`npm run deploy` always builds `1920x1080` unless told otherwise; use
`npm run deploy:hd` (or `--resolution 1280x720`) to deploy the 720p build.

### User agent

webOS builds the app's User-Agent from the template in `assets/appinfo.json`
(`vendorExtension.userAgent`) and fills in this TV's model, firmware and network.
YouTube picks its stylesheets from that UA before any userscript runs, so it can
only be chosen at build time, not from the settings panel:

| `--ua`            | UA                                         | Playback plates                                                              |
| ----------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `cobalt` (opt-in) | PS4 Cobalt UA plus the same LG device tail | YouTube's Cobalt variant: transparent title card and tray, translucent pills |
| `webos` (default) | the template in `appinfo.json`             | YouTube's LG variant: opaque black title card and tray                       |

```sh
npm run deploy:cobalt       # or: npm run deploy:hd:cobalt, npm run build:cobalt, or YTX_UA=cobalt npm run deploy
```

Builds default to `webos` (including `npm run build`, `package` and `deploy`, and so the released package); `--ua cobalt` or `YTX_UA=cobalt` selects the Cobalt UA. `cobalt` is experimental: its pages carry a stricter CSP, so YT-X stamps its styles with the page's style nonce. On a 65QNED86 (webOS 25) it played 3840-wide video with
YT-X active; other models and remote or pointer behaviour are untested. The
platform default UA (`Web0S; Linux/SmartTV ... WebAppManager`) still gets the LG
variant, so it is not offered.

Both variants install under the same app ID, so they replace one another rather
than appearing as two apps. Nothing else differs: the UI lays out in `vh` and
scales to the smaller canvas on its own, and playback still happens at the
panel's own output resolution either way. Install the 720p build on 1080p sets
to cut graphics memory, or on 720p sets where it is a pixel-for-pixel match.

### Quality gates

```sh
npm run lint:all # audit, eslint, type-check, prettier
npm run verify   # production build plus ES compatibility check
```

`npm run compare:chrome` is a manual Chrome reference gate; it needs Chrome and
network access, so it is not part of `lint:all` or `verify`. Run it once with
`--login` (desktop user agent) to sign in; probes then use the TV's own webOS UA (`--ua cobalt` for the PS4 Cobalt build).
Both `compare:tv` and `compare:chrome` seek to `--time` (default 102 s) and
pause, so frames line up.

`verify` fails if the bundle uses syntax newer than ES2022, and
`tools/check-syntax-floor.ts` rejects the specific syntax Chrome 79 cannot parse
(optional chaining, nullish coalescing, logical assignment, static blocks).
Everything else for the Chrome 79 floor comes from Babel via `.browserslistrc`;
private class fields are left native because Chrome 74+ supports them.

### Debugging on the TV

Needs a TV added with `ares-setup-device` and the app installed (`npm run deploy`).
These attach through `ares-inspect` and drive the app over the DevTools protocol.

```sh
npm run inspect                              # DOM, focus, video and heap diagnostics
npm run inspect -- eval "document.querySelectorAll('video').length"
npm run drive -- "down,down,ok" shot.png     # keys: up down left right ok back red green yellow blue
npm run verify:device                        # deploy + on-TV checks (manual, not run in CI)
npm run compare:tv                            # write the paused-frame TV snapshot (tv.json)
npm run compare:chrome -- --tv <tv.json>      # Chrome reference probe + DIFFs vs the TV (manual, not run in CI)
```

Add `-d <device>` to pick a device.

The device profile needs **both** `passphrase` and `privatekey`
(`ares-setup-device -m <device> -i privatekey=<keyname>`). Without the key the CLI
falls back to an empty password and only reports
`All configured authentication methods failed`.

Limitations:

- Screenshots cannot capture the hardware video plane. Check playback through
  `<video>.currentTime` advancing instead.
- Keys and clicks sent through the protocol count as real input. A script calling
  `dispatchEvent` or `el.click()` from `eval` does not reach the app's listeners,
  so pointer-driven UI goes through `drive`/`verify:device`, which use `Input.*`.
- If `inspect` reports `"visibility": "hidden"`, the app is backgrounded and input
  is dropped. `npm run launch` brings it forward.

### Chrome TV reference comparison

`npm run compare:chrome` launches Chrome with the YouTube TV URI and the TV's
webOS user agent (`--ua cobalt` selects the PS4 Cobalt one, a different YouTube
build), emulates a TV viewport (`--viewport 1280x720` for the hd build, default
1920x1080), and probes the playback controls over CDP. `--eval <file>` runs a
script in the probed page for ad-hoc cascade inspection. YouTube may still serve
the TV and Chrome different style variants (for example the black title card and
suggestions tray), so only same-variant values are comparable. It is a manual reference gate, not part of `npm test` or
CI. The on-TV probe remains the source of truth for the installed build.

First run:

```sh
npm run compare:chrome -- --login
```

Sign in to YouTube TV, select the account, then close Chrome. Later runs reuse
the dedicated profile:

```sh
npm run compare:chrome
npm run compare:chrome -- --attach --port 9222
npm run compare:chrome -- --chrome "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Outputs go to `%TEMP%\ytx-chrome-compare`: `chrome-official.json` and
`chrome-official.png` (plus a cropped `chrome-official-bar.png`). Pass
`--tv <file>` with a saved TV snapshot to list soft DIFFs against it.

Limitations:

- Desktop Chrome is not a performance baseline. Chrome timing is recorded for
  information only; the on-TV p95 latency gate is the acceptance measure.
- Chrome captures the video surface in screenshots; the TV hardware video plane
  does not. Do not pixel-diff video content. Compare control-bar DOM values and
  use cropped UI screenshots for visual review.
- Chrome may serve a different YouTube build than the TV. Exact colors and radii
  are reported as DIFF, not failures; only the hard invariants fail the gate.

YT-X is a userscript injected into youtube.com. Do not add a Luna service, a
local proxy or a custom focus engine: YouTube owns the page, its focus and its
player.

### Dependency notes

Two advisories in the development dependency tree have no upstream fix and are
accepted, gated by `tools/audit.ts`. Neither ships in the packaged `.ipk`:

| Package      | Advisory                                                                   | Why accepted                                                                       |
| ------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `braces`     | [`GHSA-vfj7-8cjw-p6xm`](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | 3.0.3 is the latest release; reached only via `es-check`/`shelljs` → `fast-glob`   |
| `sprintf-js` | [`GHSA-hp3w-g68c-fv3c`](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | 1.1.3 is the latest release; reached only via the `@webos-tools/cli` devDependency |

The `@webos-tools/cli` devDependency (the official LG webOS CLI, at its latest
release) also pulls a set of npm-deprecated packages — `npmlog`,
`are-we-there-yet`, `gauge`, `fstream`, `inflight`, and nested `glob@7`/`rimraf@2`.
They are development-only and inherited transitively from that CLI; no
non-deprecated release exists at the pinned versions, and forcing newer versions
through `overrides` breaks the CLI's callback-based file handling, so they are
left as-is.

---

## Quick Commands

### Build, install, and launch

```sh
npm run deploy
```

To launch a specific video directly:

```sh
npm run launch -- -p '{"contentTarget":"v=F8PGWLvn1mQ"}'
```

---

## License & Credits

Licensed under **GPL-3.0**.

- **Forked from**: [webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos)
  (GPL-3.0) — much of the codebase derives from this project.
- **Inspired by**: [marcussacana/youtube-webos-cobalt-app](https://github.com/marcussacana/youtube-webos-cobalt-app)
  (GPL-3.0) — the **Keep Playing** feature follows its `nonstop.js` approach.
- **SponsorBlock**: [sponsor.ajay.app](https://sponsor.ajay.app/)

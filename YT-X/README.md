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
- Not built into the Cobalt builds (user-agent and native): YouTube's page CSP
  for that user agent blocks the SponsorBlock servers (see
  [User agent](#user-agent))

### Interface

- Text Size (100/125/150/200%) scales YT-X's own panel, toasts, badge and popup;
  YouTube's text is unchanged. YT-X also honours the reduced-motion preference.
- Panel Care Mode with per-panel profiles: OLED-Care (true black UI) and
  QNED MiniLED-Care (dark comfort UI). Off uses the neutral translucent
  QNED-style plate
- Panel Care Mode defaults to Auto, which reads the model string from the app's
  user agent (the only signal when `webOS.deviceInfo` is unavailable) and
  applies the matching profile; unclassified panels fall back to
  Off, and the manual setting always overrides detection
- Panel Care themes only the YT-X settings panel, badge and notifications. YouTube's own
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
> configuration screen. On the remote, press **GREEN** to open it.

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

In the Homebrew Channel, add the repository
`https://github.com/nerowentah/webos-addons/releases/latest/download/repo.json`
to install and update from the TV. Each release also carries `SHA256SUMS.txt`.

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
   npm run package:fhd # 1920x1080 canvas; for 1280x720 use package:hd
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
npm exec -- ares-setup-device --list
```

The `--` matters: without it npm consumes `--list` and ares opens its
interactive menu instead of printing the list.

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
npm run deploy:fhd # Builds 1920x1080, packages, installs, and launches on the default device selected via ares-setup-device.
```

Pick another TV with `-d/--device` (or `YTX_DEVICE`), and stop before the
install with `--dry-run`:

```sh
npm run deploy:fhd:cobalt -- -d mytv
node tools/device/deploy.ts --resolution fhd --ua cobalt --dry-run
```

The same `-d`/`YTX_DEVICE` selection applies to `inspect`, `drive` and
`verify:device`.

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
Chromecast ("cast core") service can conflict with this app and freeze it
([webosbrew/youtube-webos#343](https://github.com/webosbrew/youtube-webos/issues/343)).
The app's **Block Cast Wake (webOS 25)** setting blocks its own
`/wake_cast_core` fetch unless the launch came from a cast handoff (`cc2`,
`dialLaunch`, `pairingCode`, or a webOS relaunch). It is **off by default**
because the native Cast receiver needs the wake; with it on, a cold cast start
left the TV unresponsive in testing. Existing installs are migrated to off
once. The setting cannot add, remove, or rename a cast destination.

The default package no longer registers a DIAL name (`dialAppName` is omitted).
On webOS 25 the TV still advertises its system DIAL device, so a phone can show
a second TV entry next to native Cast. That entry has no registered app and
cannot launch YouTube-X; the app cannot remove the system advertisement, and
webOS 25 has no LG Connect Apps toggle for it. Cast to the native Cast entry
(the one that launches YouTube-X); the other entry fails.

If a phone cannot find the native Cast entry, restore
`"dialAppName": "YouTube"` in `assets/appinfo.json` and rebuild. That restores
the app's DIAL registration so the second entry becomes usable, at the cost of
the duplicate remaining.

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
npm run package:fhd
```

The `.ipk` file is generated in the project directory. Stop here if you plan to
install it via [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop),
or continue with [adding the TV to the CLI](#add-the-tv-to-the-cli) to install
it with one command.

#### Graphics resolution (1920x1080 or 1280x720)

webOS offers web apps two graphics canvases, `1920x1080` and `1280x720` — there
is no UHD canvas, and the TV upscales whichever it is given to the panel in
hardware. Every build names its canvas explicitly:

| Script        | Canvas    |
| ------------- | --------- |
| `build:fhd`   | 1920x1080 |
| `build:hd`    | 1280x720  |
| `package:fhd` | 1920x1080 |
| `package:hd`  | 1280x720  |
| `deploy:fhd`  | 1920x1080 |
| `deploy:hd`   | 1280x720  |

Append `:cobalt` to any of them (`build:hd:cobalt`, `deploy:fhd:cobalt`, …) for
the Cobalt user agent. `package:dist` packages whatever is already in `dist/`
without rebuilding. `deploy:native` (below) has no canvas: Cobalt renders at the
panel's resolution and ignores the web app's `resolution` field.

The tooling accepts the symbolic canvas name or the pixel value, so
`--resolution hd` and `--resolution 1280x720` are equivalent:

```sh
npm run package:hd # or: npm run build:hd && npm run package:dist
node tools/device/deploy.ts --resolution hd
```

### Native Cobalt build (experimental)

Besides the userscript, YT-X can run inside RF1705's native Cobalt runtime
([youtube-webos-cobalt-adfree](https://github.com/RF1705/youtube-webos-cobalt-adfree)
IPK, not bundled here). It replaces the stock `youtube.leanback.v4` app and is
separate from the userscript: the same settings panel and ad hooks, but the Cobalt
player and codecs. SponsorBlock is not included and "Block Cast Wake" is inactive there.

```sh
npm run deploy:native   # build:fhd:cobalt, then inject the scripts; keeps the session
node tools/native/native.ts setup --runtime <RF1705.ipk> \
  --device-strings --model QNED86 --firmware 33.31.75 --year 2025
```

`deploy:native` / `update` needs no arguments: `--model-full` defaults to the
selected device's `modelName` from `ares-device -i`, and the SSH key comes from
ares. ares stores the device's key name and passphrase, so an encrypted `~/.ssh`
key is decrypted into a temporary copy for the run and deleted afterwards — ssh
cannot prompt for a passphrase when it has no terminal. `--key <file>` and
`YTX_SSH_KEY` still override it. The TV's OpenSSH 6.1 only offers `ssh-rsa` host
keys, which OpenSSH 9 disables by default; the tool passes
`HostKeyAlgorithms=+ssh-rsa` itself, so plain `ssh` needs the same option.
Select another TV with `--device <name>` (default `tv`).

`setup` reinstalls and signs you out; use `update` while iterating. To go back to the
web app, run `npm run deploy:fhd`.
To roll back a bad native build, run `node tools/native/native.ts clean` and reinstall the
stock app (or `npm run deploy:fhd` for YT-X). The release workflow can also build the
native package: dispatch it with the runtime's download URL and sha256; it lands in a
draft pre-release, never in a normal release.

Engine version: the native build runs on RF1705's runtime 2.0.6, which embeds Cobalt 23.lts.6 (Starboard 13, the legacy engine). YT-X ships no Cobalt of its own, and RF1705 has not released a newer engine; Google's own Cobalt is at 27 LTS (Starboard 18), which would reach YT-X only through a new RF1705 runtime. `tools/native/native.ts` warns when the runtime IPK is not a tested version (`TESTED_RUNTIMES` in `tools/native/native-device.ts`), because the injection points and the device-string patches are verified only on those.

What differs on the native build:

- SponsorBlock is not built in: YouTube's page CSP for the Cobalt user agent blocks its servers, which is deliberate and not worked around.
- "Block Cast Wake" is inactive (greyed out); Force Video Codec is likely a no-op because the Cobalt binary negotiates codecs itself.
- The stock app id `youtube.leanback.v4` is required, the `cobalt` binary stays the stock ELF, and a relaunch needs a full exit first. See the header of `tools/native/native.ts`.
- Browse previews play on native: the webOS-only muting and the thumbnail rule are not loaded, and `native-previews.ts` lifts the tile's thumbnail layer while a preview plays and puts the player back to full size if it is left on the preview's size after entering a video.
- Cobalt lacks CSS grid, `:checked`, `var()` and several DOM APIs; the shared code avoids or fills them (`tools/tests/cobalt-css.test.ts`, `src/platform/cobalt-polyfills.ts`).
- **Playback Speed** (Main tab, 1x-2x) asks the player for the rate, then checks that the media clock really runs faster; a platform that ignores the rate (the webOS browser's hardware video path, measured on a 65QNED86) is put back to 1x with a "not supported" toast. Whether native Cobalt honours it is not yet measured on a TV.
- RF1705 features such as Return YouTube Dislike, speed ranges and subtitle shortcuts are not YT-X features and stay with RF1705's runtime.

Sign-in and cast names: YT-X rewrites the sign-in `device_model` to the full SKU (`--model-full`) so Google files the TV under "Television", and the lounge screen is named `[YT-X] webOS TV <model>`. The system Cast receiver keeps its own name (`[LG] webOS TV <model>`). Google keeps one screen record per registration, so every `setup` leaves an old entry on phones; remove old TVs under Settings > Watch on TV, and prefer `update` over `setup`.

Debugging the native build: the runtime ships no `/json` debugger endpoint (every path on port 9222 answers 404), but its WebDriver server on `[::1]:4444` runs scripts in the page and takes screenshots; forward it with `ssh -L 14444:[::1]:4444 <tv>` and use the standard `/session` endpoints. YT-X's scripts are injected from a `file://` origin, so the page reports their uncaught errors as a bare `Script error.`; failures YT-X catches on purpose are kept in `window.__ytxFails`. To find a misbehaving module without rebuilding, put module names (as listed in `src/native-main.ts`, comma-separated) in `localStorage['ytx-skip']` and relaunch.

Check a running build with `npm run verify:ytx -- --suite native --port 19222` (see below). `npm run capture:identity` writes a redacted sign-in identity report to `dist/`.

### User agent

webOS builds the app's User-Agent from the template in `assets/appinfo.json`
(`vendorExtension.userAgent`) and fills in this TV's model, firmware and network.
YouTube picks its stylesheets from that UA before any userscript runs, so it can
only be chosen at build time, not from the settings panel:

| `--ua`            | UA                                                      | Playback plates                                                              |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `cobalt` (opt-in) | Cobalt UA (`Web0S; Linux`) plus the same LG device tail | YouTube's Cobalt variant: transparent title card and tray, translucent pills |
| `webos` (default) | the template in `appinfo.json`                          | YouTube's LG variant: opaque black title card and tray                       |

```sh
npm run deploy:fhd:cobalt   # or: npm run deploy:hd:cobalt, or YTX_UA=cobalt npm run deploy:fhd
```

Builds default to `webos` (every `build:*`, `package:*` and `deploy:*` script, and so the released package); a `:cobalt` suffix, `--ua cobalt` or `YTX_UA=cobalt` selects the Cobalt UA. `cobalt` is experimental: its pages carry a stricter CSP, so YT-X stamps its styles with the page's style nonce. On a 65QNED86 (webOS 25) it played 3840-wide video with
YT-X active; other models and remote or pointer behaviour are untested. The
platform default UA (`Web0S; Linux/SmartTV ... WebAppManager`) still gets the LG
variant, so it is not offered.

Both variants install under the same app ID, so they replace one another rather
than appearing as two apps. Nothing else differs: the UI lays out in `vh` and
scales to the smaller canvas on its own, and playback still happens at the
panel's own output resolution either way. Install the 720p build on 1080p sets
to cut graphics memory, or on 720p sets where it is a pixel-for-pixel match.

### Layout of `src/` and `tools/`

The userscript (`src/userScript.ts`, webOS browser) and the native Cobalt bundle
(`src/native-main.ts`) load the same feature modules in the same order, apart
from the pieces that exist because the two video planes differ;
`tools/tests/native-main.test.ts` names them and fails if the lists drift:

| Module                                 | Loaded by | What it fixes                                                          |
| -------------------------------------- | --------- | ---------------------------------------------------------------------- |
| `styles/hide-offers.css`               | both      | hides the subscription upsell surface                                  |
| `styles/inline-preview-fix.css`        | webOS     | keeps the tile thumbnail over an inline preview the panel cannot draw  |
| `features/playback/previews.ts`        | webOS     | mutes and pauses browse previews (their video is never composited)     |
| `features/playback/native-previews.ts` | native    | lifts the thumbnail layer over a playing preview; repairs a stuck size |

`tools/` is grouped by purpose, each tool's own test beside it:

| Folder           | Holds                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `tools/build/`   | version, UA and resolution selection, packaging, IPK and syntax-floor checks, manifest, audit |
| `tools/native/`  | native Cobalt packaging, device-string patching, IPK/ar/tar helpers, sign-in identity capture |
| `tools/device/`  | the on-TV harness: `inspect`, `drive`, `deploy`, `verify-device`, `verify-ytx`                |
| `tools/compare/` | the Chrome and TV reference comparison                                                        |
| `tools/tests/`   | unit tests of `src/` code (`npm test` runs every `*.test.ts` under `tools/`)                  |
| `tools/lib/`     | `load-src` (tests import `src/` modules by path) and the Node resolver hook                   |

### Quality gates

```sh
npm run lint:all # audit, eslint, type-check, prettier
npm run verify   # production fhd build plus ES compatibility check
```

`npm run compare:chrome` is a manual Chrome reference gate; it needs Chrome and
network access, so it is not part of `lint:all` or `verify`. Run it once with
`--login` (desktop user agent) to sign in; probes then use the TV's own webOS UA (`--ua cobalt` for the PS4 Cobalt build).
Both `compare:tv` and `compare:chrome` seek to `--time` (default 102 s) and
pause, so frames line up.

`verify` fails if the bundle uses syntax newer than ES2022, and
`tools/build/check-syntax-floor.ts` rejects the specific syntax Chrome 79 cannot parse
(optional chaining, nullish coalescing, logical assignment, static blocks).
Everything else for the Chrome 79 floor comes from Babel via `.browserslistrc`;
private class fields are left native because Chrome 74+ supports them.

### Debugging on the TV

Needs a TV added with `ares-setup-device` and the app installed (`npm run deploy:fhd`).
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

### Scripted YT-X check

`npm run verify:ytx -- --suite web` (or `--suite native --port 19222` with the debug port
forwarded) opens the settings panel with GREEN, checks module status, CSP violations and
the panel's accessibility attributes, and writes `dist/verify-<suite>.md` with the manual
items that still need a person.

### Chrome TV reference comparison

`npm run compare:chrome` launches Chrome with the YouTube TV URI and the TV's
webOS user agent (`--ua cobalt` selects the PS4 Cobalt one, a different YouTube
build), emulates a TV viewport (`--viewport 1280x720` for the `build:hd` variant,
default 1920x1080), and probes the playback controls over CDP. `--eval <file>` runs a
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

One advisory in the development dependency tree has no upstream fix and is
accepted, gated by `tools/build/audit.ts`. It does not ship in the packaged `.ipk`:

| Package  | Advisory                                                                   | Why accepted                                                                     |
| -------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `braces` | [`GHSA-vfj7-8cjw-p6xm`](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | 3.0.3 is the latest release; reached only via `es-check`/`shelljs` → `fast-glob` |

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
npm run deploy:fhd
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

<h1 align="center">
  YouTube Ad-Free
</h1>
<p align="center">
  <img src="https://img.shields.io/github/stars/webosbrew/youtube-webos?style=flat-square&logo=github" alt="GitHub Stars">
  <img src="https://img.shields.io/github/v/release/webosbrew/youtube-webos?style=flat-square" alt="Latest Release">
  <img src="https://img.shields.io/github/contributors/webosbrew/youtube-webos?style=flat-square" alt="Contributors">
  <img src="https://img.shields.io/github/downloads/webosbrew/youtube-webos/total?style=flat-square" alt="Total Downloads">
  <img src="https://img.shields.io/badge/LG-webOS-000000?logo=webos&logoColor=white&style=flat-square" alt="webOS">
</p>

<p align="center">
  YouTube app for webOS TV with ad blocking and other enhancements
</p>

---

## Features

### Ad Blocking & Content

- Ad Blocking (home, search, watch, and Shorts feeds), including the promoted and sponsored placements that only appear once signed in
- Remove end screens
- Shorts Removal (from subscriptions)
- Members-Only Removal across the home, search, subscription, channel, and Live feeds, including members-only channel sections (also covers early-access "members first" posts)
- Higher-Quality Thumbnails
- YouTube Logo Removal

### Video Playback

- Force Highest Video Quality
- Force Video Codec (AV1 / VP9 / AVC (H.264) / HEVC (H.265) / Avoid AV1)
- Full Animation Support

### SponsorBlock

- [SponsorBlock](https://sponsor.ajay.app/) Integration
- Auto-skip sponsors, intros, outros, interaction reminders, self-promotion,
  non-music sections, recaps, tangents/jokes, and hook/greetings
- Custom Segment Colors
- Skip Segments Once (skip each segment only a single time)

### Interface

- On-Screen Clock Overlay (optionally always visible)
- Panel Care Mode with per-panel profiles: OLED-Care (True Black UI) and QNED MiniLED-Care (Dark Comfort UI), with video shelf opacity control
- Panel Care Mode defaults to Auto, which reads the panel type from the TV model in the app's user agent and applies the matching profile. Any panel it cannot classify falls back to Off; the manual setting always overrides the detection
- Classic Red is the only UI theme
- Fix Multiline Titles
- Bypass account selector screen

### System

- [Autostart Support](#autostart)

> [!NOTE]
> Press the 🟩 **Green** button on your remote, or click the **YTAF** badge (below the **Settings** entry in the left guide) with the Magic Remote pointer, to access the configuration screen. Remotes without color buttons (e.g. MR25GA) use the badge.

---

## Requirements

- **webOS 6 or newer** (webOS TV 6, 2018 onwards).
- Uninstall the official YouTube app before installing this one.

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
the app now relies on directly. Dropping them lets the build ship ES2019
instead of ES5 and removes the fetch, `DOMRect` and generator polyfills.

`.browserslistrc` is the support matrix of record — changing the floor there
changes what the build is allowed to emit.

---

## Installation

You can install the app using one of the following methods:

- **[webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel):**
  App is available in the official webOS Brew repository.
- **[Device Manager](https://github.com/webosbrew/dev-manager-desktop):**
  Use a pre-built `.ipk` file from the [Releases](https://github.com/webosbrew/youtube-webos/releases) page.
- **Command Line (webOS CLI):** Configure the tools [below](#development-setup)

---

## Autostart

To enable autostart, run the following command on the TV via **SSH** or **Telnet**:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/addDevice' '{"appId":"youtube.leanback.v4","pigImage":"","mvpdIcon":""}'
```

This allows the app to show up as an input source and launch automatically if it was the last used app. It will remain active in the background for faster startup (minor increase in idle memory usage).

To disable autostart:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/deleteDevice' '{"appId":"youtube.leanback.v4"}'
```

---

## Compatibility notes

### Cast to TV is disabled on webOS 2025

On webOS 2025 firmware (webOS platform ≥ 10 / firmware ≥ 33), the built-in
Chromecast ("cast core") service conflicts with this app and freezes it
([webosbrew/youtube-webos#343](https://github.com/webosbrew/youtube-webos/issues/343)).
The fix blocks the app's `/wake_cast_core` fetch on those firmware versions,
which means the "cast/push video from the mobile YouTube app" flow is disabled
there. Older firmware leaves the fetch alone, so phone-to-TV casting keeps
working.

Note: `dialAppName` is what registers the app with the TV's DIAL service
(`com.webos.service.dial`), which is the _only_ way the mobile YouTube app
discovers the TV. Do not remove it — without it the TV disappears from the
phone's cast list entirely.

---

## Development Setup

### Pre-requisites

- The latest **Node.js** LTS release. Node.js ships with **npm**, which is the package manager this project uses.
- **git**

### Setup

1. Clone the repository.

   ```sh
   git clone https://github.com/webosbrew/youtube-webos.git
   cd youtube-webos
   ```

2. Install dependencies.

   ```sh
   npm install
   ```

### Building an IPK

```sh
npm run build:dev
npm run package
```

The `.ipk` file will be generated in the project root directory. You can stop here if you're fine with installing the IPK via [the webOS Dev Manager app](https://github.com/webosbrew/dev-manager-desktop). Alternatively, continue below if you want to make it so you can install the IPK on your TV with one command.

#### Graphics resolution (1920x1080 or 1280x720)

webOS only offers web apps two graphics canvases, `1920x1080` and `1280x720` — there is no UHD canvas, and the TV upscales whichever one it is given to the panel in hardware. The default build declares `1920x1080`; to build the 720p variant:

```sh
npm run build:hd   # or: npm run package:hd
```

Both variants install under the same app ID, so they replace one another rather than appearing as two apps. Nothing else differs: the UI lays out in `vh` and so scales to the smaller canvas on its own, and playback still happens at the panel's own output resolution either way. Install the 720p build on 1080p sets to cut graphics memory, or on 720p sets where it is a pixel-for-pixel match.

### On the TV

> [!IMPORTANT]
> If your TV is rooted, follow [the alternative setup section](#alternate-setup-rooted-tv) instead and then skip to [installing to the TV](#installing-to-the-tv)

1. Create an [LG Developer account](https://webostv.developer.lge.com/login)
2. Install the [**Developer Mode** app](https://in.lgappstv.com/main/tvapp/detail?appId=232503) from the LG Content Store
3. Navigate to the app, Log-in in with LG Developer Credentials and enable:
   - Developer Mode
   - Key Server

### Add the TV to the CLI

```sh
npm exec ares-setup-device
```

Follow the prompts:

1. Add device
2. Enter IP from the Developer Mode app
3. Use default values unless needed
4. Enter 6-digit passphrase shown on the TV screen

Verify:

```sh
npm exec ares-setup-device --list
```

Sample output:

```log
name            deviceinfo                     connection  profile    passphrase
--------------  -----------------------------  ----------  -------    ----------
mytv (default)  prisoner@192.168.137.102:9922  ssh         tv         EF32E8
```

---

## Installing to the TV

```sh
npm run deploy # Installs to the default device selected via `ares-setup-device`.
```

## Debugging

webOS supports the standard Chrome Devtools Protocol which allows you to inspect the app.

```sh
ares-inspect -d <device_name> --app youtube.leanback.v4
```

Or if you've set your TV as the default device:

```sh
npm run inspect
```

---

## Alternate Setup (Rooted TV)

1. Enable SSH via Homebrew Channel
2. Generate SSH key:

   ```sh
   ssh-keygen -t rsa
   ```

3. Copy `id_rsa` to `~/.ssh` (Windows: `%USERPROFILE%\.ssh`)
4. Append `id_rsa.pub` to `/home/root/.ssh/authorized_keys` on the TV
5. Set up device:

   ```sh
   ares-setup-device -a webos \
     -i "username=root" \
     -i "privatekey=id_rsa" \
     -i "passphrase=SSH_KEY_PASSPHRASE" \
     -i "host=TV_IP" \
     -i "port=22"
   ```

---

## Quick Commands

### Build, Install, and Launch

```sh
npm run build:dev && npm run package && npm run deploy && npm run launch
```

To launch a specific video directly:

```sh
npm run launch -- -p '{"contentTarget":"v=F8PGWLvn1mQ"}'
```

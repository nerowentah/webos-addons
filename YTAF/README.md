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

- Ad Blocking (home, search, watch, and Shorts feeds)
- Remove end screens
- Shorts Removal (from subscriptions)
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
- UI Themes (Blue Force Field / Classic Red)
- Fix Multiline Titles
- New Liquid Glass UI (remove black borders)
- Bypass account selector screen

### System

- [Autostart Support](#autostart)

> [!NOTE]
> Press the 🟩 **Green** button on your remote, or click the **YTAF** badge (bottom-left) with the Magic Remote pointer, to access the configuration screen. Remotes without color buttons (e.g. MR25GA) use the badge.

---

## Requirements

- Uninstall the official YouTube app before installing this one.

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

On webOS 2025 firmware (webOS platform ≥ 10 / firmware ≥ 33), the built-in
Chromecast ("cast core") service conflicts with this app and freezes it
([webosbrew/youtube-webos#343](https://github.com/webosbrew/youtube-webos/issues/343)).
The fix blocks the app's `/wake_cast_core` fetch on those firmware versions,
which means the "cast/push video from the mobile YouTube app" flow is disabled
there. Older firmware leaves the fetch alone, so phone-to-TV casting keeps
working.

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

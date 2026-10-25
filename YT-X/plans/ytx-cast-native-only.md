# Plan: Remove the duplicate phone cast destination (native Cast only)

**Status:** Implemented and verified on the TV; phone matrix pending.
**Repository:** `D:\Cloud\Github\webos-addons`
**Target:** `YT-X/`
**Source reviewed:** working tree, 2026-10-23
**Test TV:** `65QNED86ASA.ATSFLJD`, webOS 25, firmware `33.31.75`,
`172.16.10.15`, ares device `tv`

> This is the repo copy of the implementation plan.

## Goal

Make the phone's YouTube cast list show **one** destination for the TV instead
of two, by removing the app's DIAL registration and relying on the TV's native
Cast receiver. Casting must keep working on **Android and iOS**, with the TV app
both closed and already running.

Also define what the existing `blockWebosCast` checkbox can and cannot do, so
the setting stops implying it can mask a destination.

## Non-goals

- Hiding the TV's native Cast entry. That is a system service, not app state.
- Making the checkbox switch between DIAL and native Cast at runtime.
- Stopping `appcasting` / `com.webos.chromecast.cell` or otherwise changing
  system casting. That needs root and would affect all casters.
- Re-fixing the #343 cast-core freeze beyond preserving the existing guard.

## Current behaviour (verified)

Two live advertisements exist at the same time:

| Entry                                   | Source                                                        | Evidence                                                                                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[LG] webOS TV QNED86ASA` — native Cast | system Cast stack (`appcasting`, `com.webos.chromecast.cell`) | `:8008/setup/eureka_info` returns the name and `ssdp_udn`; `8008`/`8009` open                                                                                                                                                       |
| `[LG] webOS TV QNED86ASA` — app DIAL    | `dialAppName: "YouTube"` in `assets/appinfo.json`             | SSDP `urn:dial-multiscreen-org:service:dial:1`; `Location: http://172.16.10.15:1626/`; `Application-URL: http://172.16.10.15:36866/apps`; `/apps/YouTube` after removal → 404 with `Origin: https://www.youtube.com` + a browser UA |

Both destinations use the same friendly name, so the phone cannot tell them
apart by label. The DIAL app endpoint confirms the app name is exactly
`YouTube`; it is not `YouTube-X`.

> **Header correction:** a bare `/apps/YouTube` request returns `403`, which is
> not proof of registration. Send `Origin: https://www.youtube.com` and a
> browser-like `User-Agent`; the post-change endpoint is then `404` while the
> app is both running and closed. The original plan's "403 = registered" check
> was wrong.

### What controls what

| Lever                                      | Controls                                     | Runtime?                               |
| ------------------------------------------ | -------------------------------------------- | -------------------------------------- |
| `dialAppName` in `appinfo.json`            | whether the app is registered as a DIAL app  | No — read at install/registration time |
| `blockWebosCast` / `block-webos-cast.ts`   | whether the page may fetch `/wake_cast_core` | Yes                                    |
| `appcasting` / `com.webos.chromecast.cell` | native Cast discovery and receiver           | No — system service                    |

The checkbox gates only the page's wake request. It does **not** stop the
native Cast device from being advertised, and it cannot remove or rename the
DIAL registration. That is why both entries remain with the checkbox on.

### Which platforms use which path

- Android YouTube uses both Cast and DIAL; the duplicate is visible there.
- iOS YouTube may use DIAL only. This is the main unknown and the reason the
  native-only build must be tested on an iPhone before shipping.

## Decision

**Chosen approach: native-only.** Remove `dialAppName` from
`assets/appinfo.json`, rebuild, and verify that the phone still discovers the
TV through native Cast and that casting launches `youtube.leanback.v4` with the
`cc2` path.

This is the only app-level lever that reduces the destination count. It keeps
the native Cast receiver, which is the path the app already handles through the
cast-launch exception.

Rejected alternatives:

| Alternative                                | Why not                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| Keep DIAL, hide native Cast                | Needs a system/root change to the Cast service; not available to a normal web app |
| Rename `dialAppName`                       | Does not change the DIAL device friendly name or reduce the count                 |
| Runtime checkbox that masks one entry      | `dialAppName` is install-time; native discovery is system-level                   |
| Two live variants selected by the checkbox | Not possible from one installed package; would need two packages                  |

## Implementation

### 1. Remove the DIAL registration

File: `YT-X/assets/appinfo.json`

- Delete the `"dialAppName": "YouTube"` line.
- Do **not** change:
  - `"id": "youtube.leanback.v4"` (the native Cast receiver maps to this ID)
  - `"deeplinkingParams"`
  - `"supportGIP"` / `"supportQueryRouting"`
  - `"handlesRelaunch"`
  - `"trustLevel"` / `"privilegedJail"`
  - `"supportQuickStart"`
  - `"wolwowlan"`
- Keep the JSON valid; remove the trailing comma from the preceding field if
  needed.

Expected diff:

```diff
-  "dialAppName": "YouTube",
```

### 2. Preserve the cast-launch exception

File: `YT-X/src/platform/block-webos-cast.ts`

No functional change in the first build. The existing detection of `cc2`,
`dialLaunch`, and the synthetic relaunch must stay, because the native Cast
Connect path is expected to launch the app with `cc2`.

Verify before shipping that the exception still covers the native launch:

- `https://www.youtube.com/tv?cc2=1` → wake allowed.
- `...?dialLaunch=watch` → wake allowed (kept for the DIAL fallback build).
- Normal page load → wake blocked when the checkbox is on.

### 3. Checkbox semantics (decided)

The checkbox cannot select or mask a destination. The measured result is that
native-only works with the block **off** and the TV becomes unresponsive with
the block **on**, so the block defaults to `false`:

- Keep `blockWebosCast: false` as the default.
- Keep the label `Block Cast Wake (webOS 25)` and document it as an advanced
  troubleshooting switch. Enabling it makes the only remaining cast entry fail
  or hang on this firmware.
- One-time migration `nativeCastV1` flips stored `true` to `false`; a later
  explicit enable sticks.
- Keep the `hasCastCoreConflict()` firmware gate unchanged.
- Do not reintroduce a second destination just to make the checkbox meaningful.

### 4. Optional fallback: build-time DIAL variant

Only if Phase 2 fails on iOS or Android.

- Add a package-time flag, e.g. `YTX_DIAL=1`, that injects
  `"dialAppName": "YouTube"` into the packaged `appinfo.json`.
- Ship two packages:
  - default: native-only (one destination)
  - `YTX_DIAL=1`: DIAL enabled (two destinations, but iOS-safe)
- This is **build-time**, not a runtime checkbox. Do not pretend otherwise in
  the UI.
- Keep the same app ID so the native Cast mapping is unchanged.

## Phase 0 — Confirm the duplicate before changing code

Do this on the phone first; it takes minutes and prevents a wrong fix.

1. Note the exact labels and icons of the two entries.
2. Close YouTube-X on the TV and reopen the phone cast list.
3. Force-stop the phone's YouTube app, toggle Wi-Fi, and reopen the list.
4. If one entry disappears after the phone restart, it was a stale cache and no
   code change is needed.
5. If both entries survive and share the TV name, proceed with the native-only
   build.

Useful read-only checks from the PC:

```powershell
curl.exe -s http://172.16.10.15:8008/setup/eureka_info
curl.exe -s -i -H "Origin: https://www.youtube.com" -H "User-Agent: Mozilla/5.0 (Linux; Android 14) Chrome/126.0.0.0 Mobile Safari/537.36" http://172.16.10.15:36866/apps/YouTube
```

A bare request returns `403`; that is a header/permission response, not proof
that the app is registered. After removing `dialAppName`, the request with
`Origin` and a browser UA returns `404` both while the app is running and after
it is closed.

## Phase 1 — Build and deploy

1. Apply the appinfo change.
2. Run the normal build/package/deploy for `YT-X` with the Build agent.
3. Confirm the installed `appinfo.json` on the TV no longer contains
   `dialAppName`.
4. Relaunch the app; if the DIAL registration is cached, reboot the TV once.

## Phase 2 — Test matrix

Run every row with the block **off** (the default). Do not run a row with the
block on: the Phase 2 cold-start probe with the block on left the TV
unresponsive, and the phone matrix is for the shipping configuration.

| #   | Phone   | TV app          | Checkbox | Expected                                   |
| --- | ------- | --------------- | -------- | ------------------------------------------ |
| 1   | Android | closed          | off      | one entry; select → app launches and plays |
| 2   | Android | running         | off      | one entry; select → resumes/plays          |
| 3   | iOS     | closed          | off      | one entry; select → app launches and plays |
| 4   | iOS     | running         | off      | one entry; select → resumes/plays          |
| 5   | either  | after TV reboot | off      | one entry; cold cast still launches        |

For each row record:

- number of destinations in the phone's cast list;
- which entry was selected;
- whether the video plays;
- TV `location.href` (expect `cc2` or the native launch params);
- whether `/wake_cast_core` was allowed (use `tools/inspect.ts`);
- any freeze, black screen, or app restart.

Suggested checks on the TV:

```powershell
node tools/inspect.ts -d tv eval 'location.href'
node tools/inspect.ts -d tv eval 'JSON.parse(localStorage.getItem("ytx-configuration")).blockWebosCast'
```

### Pass criteria

- Exactly one destination on both Android and iOS.
- Selecting it launches YouTube-X and plays, with the TV app closed and running.
- Cold start after a TV reboot still works.
- No freeze on firmware `33.31.75` with the block off.

### Fail criteria / fallback trigger

- The TV disappears entirely on one platform.
- The native entry launches the wrong receiver, a black screen, or an error.
- The #343 freeze returns with the block off.
- Casting only works with a setting that hangs the TV.

On any of these, stop and use the fallback in step 4 or restore the rollback
package. Do not hack the system Cast service.

## Results (2026-10-23)

- Build `1.0.36` with `dialAppName` removed is installed on the test TV.
- `/apps/YouTube` returns `404` with `Origin: https://www.youtube.com` and a
  browser UA, both while the app is running and after it is closed. A bare
  request returns `403`; that is not evidence of registration.
- Native Cast is still advertised on `:8008`/`:8009`.
- Cold start with the block off: `pychromecast` `start_app("233637DE")` launched
  the app at `https://www.youtube.com/tv?cc2=1#/`, `/wake_cast_core` was
  allowed, and the TV stayed responsive.
- Cold start with the block on: the Cast start reported success, but the TV
  became unresponsive to SSH, `:8008`, and DevTools and needed a power cycle.
  This is why the block now defaults to off.
- Source default is `false`; `nativeCastV1` migrates existing configs once;
  version bumped to `1.0.37`.
- Rollback package: `YT-X/youtube.leanback.v4_1.0.35_dial-rollback.ipk`.

## Rollback

1. Deploy `YT-X/youtube.leanback.v4_1.0.35_dial-rollback.ipk` (known-good
   DIAL build), or restore `"dialAppName": "YouTube"` in `assets/appinfo.json`
   and rebuild.
2. Relaunch or reboot the TV if the DIAL registration is cached.
3. On the phone, force-stop YouTube and toggle Wi-Fi to clear a stale entry.

## Risks and open questions

- **Native receiver mapping:** the TV may advertise native Cast but not map
  YouTube to `youtube.leanback.v4`. Phase 2 row 1 is the decisive test.
- **iOS DIAL dependence:** if iOS only lists DIAL devices, native-only removes
  the TV on iPhone. The fallback variant is then required.
- **DIAL device still advertised:** the `:1626` device description is served by
  the system and will remain. The phone should stop listing it once no app
  matches, but confirm with `/apps/YouTube` returning 404.
- **Voice/assistant routing:** removing `dialAppName` may affect Google
  Assistant/Alexa casting (`supportGIP`, `supportQueryRouting`). Test a voice
  cast if those features matter.
- **README drift:** the current compatibility note is contradicted by the 2025
  Cast stack; update it only after the test result, not before.
- **Phone cache:** a stale destination can survive an app reinstall; Phase 0
  distinguishes cache from a live advertisement.
- **Checkbox expectation:** if the user expects the checkbox to switch between
  the two entries, that requirement cannot be met by this app; the plan should
  be rejected or changed to a two-package design instead.

## Acceptance criteria

- [ ] Android shows exactly one TV destination and casts successfully.
- [ ] iOS shows exactly one TV destination and casts successfully.

## Effort

- Code change: one line in `assets/appinfo.json`.
- Documentation/UI: small, after the test result is known.
- Build/deploy: ~10 minutes.
- Phone matrix: 30-60 minutes with both platforms.
- Fallback build-time variant: 1-2 hours.

## References

- `YT-X/assets/appinfo.json` — `dialAppName`, launch/deeplink fields.
- `YT-X/src/platform/block-webos-cast.ts` — cast-launch detection and wake gate.
- `YT-X/src/platform/tv-specs.ts` — `hasCastCoreConflict()`.
- `YT-X/src/config/config.ts` — `blockWebosCast` default.
- `YT-X/src/config/ui-text.ts` — `Block Cast Wake (webOS 25)` label.
- `YT-X/src/ui/ui.ts` — settings checkbox.
- `YT-X/README.md` — compatibility note.
- `YT-X/src/core/launch-url.ts` — launch URL construction.
- Upstream: issue #343, issue #401, PR #482.

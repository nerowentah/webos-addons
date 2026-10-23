# Cobalt-06 — Cast verification and documentation

Status: needs a TV and two phones (manual)
Addresses: the README's cast claims and the open Phase 2 matrix in
[`ytx-cast-native-only`](../ytx-cast-native-only.md)
Touches: `YT-X/README.md`, `YT-X/assets/appinfo.json` (verification only),
`YT-X/plans/results-<date>.md` (new)

## Problem

The rework removes `"dialAppName": "YouTube"` from `assets/appinfo.json` and
rewrites the README's compatibility note to state the result as fact:

> The default package omits `dialAppName`, so the app does not register a DIAL
> entry. The phone should list only the TV's native Cast target.

The code change matches RF1705's appinfo (which has no `dialAppName`), but the
behaviour is not verified. `ytx-cast-native-only.md` says "phone verification
pending" and explicitly says to update the README only after Phase 2. The
README is currently ahead of the evidence, and iOS is the open risk: it may
list DIAL-only destinations.

One more thing the plan assumes but the repo does not have: `handlesRelaunch`
is **not** in `YT-X/assets/appinfo.json`. The plan says "do not change
`handlesRelaunch`", and `block-webos-cast.ts` relies on a `webOSRelaunch` event
for a cast handoff while the app is already running. If the web app does not
receive that event without the flag, the cast-while-running row will fail for a
reason unrelated to DIAL.

## Goal

One cast destination on Android and iOS, with the TV app closed, running and
after a reboot; a README that states only what the matrix measured; a recorded
result.

## Design

### 1. Soften the README now

Until the matrix runs, describe the change as intent, not outcome:

- "The default package no longer registers a DIAL name."
- "Expected: the phone lists only the TV's native Cast target; verification on
  Android and iOS is pending (`plans/results-<date>.md`)."
- Keep the rollback instruction (restore `dialAppName`, rebuild, redeploy).
- Keep the "Block Cast Wake (webOS 25)" explanation; it is accurate.

Do not claim "one destination" or "casting works" before the matrix.

### 2. Verify the registration cache cleared

Follow Phase 0/1 of the cast plan:

```sh
curl.exe -s -i http://<tv>:1626/
curl.exe -s -i http://<tv>:36866/apps/YouTube
curl.exe -s -i http://<tv>:36866/apps/NoSuchApp
```

`/apps/YouTube` must be `404` after a relaunch/reinstall (and a reboot if the
registration is cached). If it stays `403`, the package still registers DIAL;
check the packaged `dist/appinfo.json`, not just the source asset.

### 3. Check `handlesRelaunch`

Before the phone matrix, decide and test:

- If `webOSRelaunch` is delivered to the web app without the flag, record that
  and leave the appinfo alone.
- If it is not delivered while the app is running, add
  `"handlesRelaunch": true` to `assets/appinfo.json` and retest the
  cast-while-running rows. This is a behaviour fix, not a DIAL change.
- Do not change any other appinfo field in the same pass.

### 4. Run the matrix

Run every row from `ytx-cast-native-only.md`; do not infer iOS from Android:

| #   | Phone   | TV app  | Checkbox | Expected                               |
| --- | ------- | ------- | -------- | -------------------------------------- |
| 1   | Android | closed  | on       | one entry; select → launches and plays |
| 2   | Android | running | on       | one entry; select → resumes/plays      |
| 3   | Android | closed  | off      | one entry; select → launches and plays |
| 4   | iOS     | closed  | on       | one entry; select → launches and plays |
| 5   | iOS     | running | on       | one entry; select → resumes/plays      |
| 6   | iOS     | closed  | off      | one entry; select → launches and plays |
| 7   | either  | reboot  | on       | one entry; cold cast launches          |
| 8   | either  | reboot  | off      | one entry; cold cast launches          |

Record device models, firmware, phone OS versions and the exact result
(pass/fail, one/two entries, what appeared). If iOS fails, stop and implement
the build-time DIAL fallback from the cast plan; do not ship native-only as
the default.

### 5. Write the result

Add `YT-X/plans/results-<date>.md` with the matrix and the `/apps/YouTube`
probe. Update the README from that file. The plan's status line becomes
"verified on <devices>" or "reverted: <reason>".

## Verification

- `npm run build` then inspect `dist/appinfo.json` for `dialAppName`.
- The `curl` probe above.
- The eight-row matrix.
- Cast with the TV app closed and running; cold start after a reboot.
- Voice/assistant casting if `supportGIP`/`supportQueryRouting` matter to the
  release; removing DIAL can affect it.

## Risks

- **iOS DIAL dependence:** if iOS lists only DIAL, native-only removes the TV
  from iPhones. The fallback is a build-time `YTX_DIAL=1` package; the runtime
  checkbox cannot fix it.
- **Registration cache:** a stale DIAL entry can survive an install. Reboot
  before declaring failure.
- **README drift:** the current text was written before the test. If the matrix
  fails, revert the README and the appinfo together.
- **`handlesRelaunch`:** a missing flag can masquerade as a DIAL failure. Test
  it separately.
- **Voice routing:** removing `dialAppName` can change Assistant/Alexa
  behaviour; test if those are supported.

## Acceptance criteria

- [ ] The README no longer claims an unverified outcome.
- [ ] `dist/appinfo.json` has no `dialAppName`.
- [ ] `/apps/YouTube` is 404 after the change.
- [ ] Android and iOS each show exactly one destination and cast successfully
      with the app closed and running.
- [ ] Cold start after a reboot works.
- [ ] `handlesRelaunch` behaviour is recorded (and added if needed).
- [ ] `plans/results-<date>.md` exists and matches the README.
- [ ] The rollback package and procedure are documented.

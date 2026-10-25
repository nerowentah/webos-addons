# Native Cobalt-04 — Packaging and release

Status: `tools/native.ts` packages and installs (done); CI release, feed and rollback open
Addresses: native appinfo, runtime payload, compression, ownership, feed and
rollback
Touches: native `appinfo.json`, package contents, release workflow, Homebrew feed

## Goal

Ship a native Cobalt IPK that installs cleanly, runs as the expected webOS user,
survives a reboot and can be rolled back without leaving the TV in a bad state.

## Native appinfo

Set only the fields the native runtime needs:

- `type: native`
- `main: cobalt`
- `handlesRelaunch` and `nativeLifeCycleInterfaceVersion`
- `requiredMemory`, `spinnerOnLaunch`, `transparent` as measured
- no `dialAppName` unless cast verification requires it

Do not copy the web app’s `type: web` / `main: index.html` fields. Do not add
fields that the native lifecycle does not read.

## Package contents

- Cobalt binary and `content/`
- runtime libraries (`libstdc++`, `libgcc_s`, required webOS libs)
- filtered system fonts
- injected webapp assets
- no `webOSUserScripts/userScript.js` dependency

## Packaging integrity

- Normalize ownership/modes before packaging.
- Verify the IPK container.
- Test compressed runtime content-size handling.
- Keep the package size bounded and record the installed size.
- Preserve the savegame path; do not make the app directory world-writable.

## Release

- Stable Homebrew feed URL.
- Beta entry policy: beta shares the app id and replaces stable unless a
  separate id is chosen.
- Rollback package and procedure.
- App-id collision warning for users replacing the official YouTube app.
- Release workflow must publish the native artefact and the feed from the same
  build.

## Issue inputs

- Install hangs/size: `#7`, `#17`, `#37`, `#113`
- Feed: `#18`, `#19`, `#93`, `#100`, `#114`
- Compression: `#53`, `#54`
- Ownership: `#70`, `#82`
- Missing libraries: `#71`
- Packaging cleanup: `#96`
- Cast: `#25`
- Lifecycle: `#74`

## Acceptance

- The IPK installs via Dev Manager and Homebrew.
- No world-writable app directory; savegame survives reboot.
- Rollback to the official/previous app is documented and tested.
- The feed points at the current release.
- The native appinfo fields are present in the packaged `appinfo.json`, not just
  in a source template.
- Package size and installed size are recorded.

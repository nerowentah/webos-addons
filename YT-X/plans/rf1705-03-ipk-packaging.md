# RF1705-03 — IPK packaging integrity

Status: ready to implement
Addresses (RF1705 tracker): #70, #82 (packaging ownership/mode class), #74's
"binary permissions" note; native-track additions: #7, #17, #37, #53, #54,
#71, #96, #113
Touches: `package.json`, new `tools/package.ts`, new `tools/check-ipk.ts`,
`.github/workflows/release.yml`, `.github/workflows/ci.yml`

Native Cobalt note: this plan covers the **web app** IPK. A native Cobalt package
has a different payload, ownership and appinfo; see
[`native-cobalt-04`](./native-cobalt/04-packaging-and-release.md). The mode and
archive checks here should still run on a native IPK where they apply.

## Problem

`npm run package:dist` is a bare `ares-package -n dist`. `ares-package` copies modes
and ownership straight from the filesystem, so the artefact inherits whatever
the build machine had. I unpacked the committed build
(`YT-X/youtube.leanback.v4_1.0.35_all.ipk`) and every entry is:

```
drwxrwxrwx  cwt  0  usr/palm/applications/youtube.leanback.v4/
-rw-rw-rw-  cwt  0  usr/palm/applications/youtube.leanback.v4/index.js
-rw-rw-rw-  cwt  0  usr/palm/applications/youtube.leanback.v4/webOSUserScripts/userScript.js
```

So the shipped application code is **world-writable** and owned by the build
user's uid. That is the same class of packaging defect RF1705 fixed in #82 and
that #70 turned into a boot-loop for the native app.

For a web app the consequence is milder than for Cobalt (no `.starboard.storage`
or savegame is written into the app directory), so this is an **integrity**
problem, not a boot-loop: any local process or user on the TV can modify the
code that runs the userscript. It should not ship that way.

Also missing: nothing verifies the artefact at all. CI builds and runs tests but
never inspects the thing users install.

`dist` staleness is _not_ a problem — `webpack.config.ts` already sets
`output.clean: true`.

## Goal

Every published `.ipk` has predictable, non-world-writable modes, and CI fails
if it does not.

## Non-goals

- Changing the app id, version scheme or `ares-package` itself.
- Repacking the outer `ar` container (keeps the plan cross-platform).
- Chowning to `5000`: see "Ownership" below for why it is deliberately skipped.

## Native Cobalt packaging (separate track)

The native package is built by `tools/native-ipk.ts` / `tools/native.ts` (see
[`native-cobalt/04`](./native-cobalt/04-packaging-and-release.md)); the web
`tools/package.ts` and `tools/check-ipk.ts` below are still not written. The native package additionally needs:

- compressed runtime/content-size handling (`#53`, `#54`);
- ownership and savegame path (`#70`, `#82`);
- missing AArch64 libraries (`#71`);
- obsolete packaging paths (`#96`);
- package-size/install-hang investigation (`#7`, `#17`, `#37`, `#113`);
- native appinfo fields, Cobalt binary, runtime libraries and fonts.

Do not treat the web-app mode fix as native packaging proof. The native
packaging plan is
[`native-cobalt-04`](./native-cobalt/04-packaging-and-release.md).

## Design

### 1. `tools/package.ts`

Replaces the `package` script. Responsibilities, in order:

1. Fail with a clear message if `dist/appinfo.json` is missing (i.e. the build
   was not run).
2. Resolve and run `ares-package` the same way `tools/deploy.ts` does
   (`run('package', 'ares-package', ['-n', 'dist'])`, using the local CLI
   entrypoint), so there is one code path for local and CI packaging.
3. Before invoking it, normalize `dist` modes when the platform supports it:

   ```ts
   if (process.platform !== 'win32') {
     // files 0644, directories 0755
     chmodSync(entry, isDir ? 0o755 : 0o644);
   }
   ```

   On Windows `chmod` only toggles the read-only bit, so skip with one
   informational line. **CI and releases run on ubuntu, which is where the
   published artefacts are produced** — local Windows builds are developer
   builds.

4. Run `tools/check-ipk.ts` on the produced file and fail the script on a
   violation.

### 2. `tools/check-ipk.ts`

Standalone, no CLI dependency, so it can also run in CI against a downloaded
artefact. It reads the `.ipk` as an `ar` archive (the format is trivial: a
global header, then 60-byte headers), extracts `data.tar.gz` via `node:zlib`,
and walks the tar headers to assert:

- `appinfo.json` exists at `usr/palm/applications/<id>/` and its `id` and
  `version` match the filename `<id>_<version>_all.ipk`;
- no entry is group- or other-writable (`mode & 0o022 === 0`);
- no regular file is marked executable;
- no unexpected top-level entry is present (e.g. `Thumbs.db`, `.DS_Store`,
  `node_modules/`, source maps, `*.test.*`).

If writing the tar walker is more than we want to own, the fallback is
`tar -tvzf` shelling out — but that is not guaranteed on Windows dev boxes, so
the Node reader is preferred (≈80 lines, no new dependency).

### 3. Wiring

- `package.json`: `"package": "node tools/package.ts"`; `"package:hd"` keeps
  `npm run build:hd && npm run package:dist`.
- `release.yml`: the existing `npm run package:dist` step now enforces the check;
  keep `SHA256SUMS.txt`.
- `ci.yml`: add a packaging job (or extend the existing build job) that runs
  `npm run build:fhd && npm run package:dist && node tools/check-ipk.ts ./*.ipk`, so a
  mode regression fails a PR instead of reaching a release.

### Ownership (deliberate decision)

RF1705 normalizes to gid `5000` because Cobalt runs as `6386:5000` and writes
savegame data into its own directory. A web app does not write into the app
directory; its persistence lives in `localStorage`, managed by the platform's
app-data path. Chowning therefore buys nothing here, and `chown` cannot be done
portably from Node on Windows. Normalize **modes only**, and record this
reasoning in the script comment so a future contributor does not "fix" it.

## Tests

- `tools/check-ipk.test.ts`: build a tiny synthetic `ar` + tar fixture in a
  temp directory with (a) clean modes → passes, (b) a `0666` file → fails,
  (c) a missing `appinfo.json` → fails, (d) a version mismatch → fails. This
  keeps the gate itself honest without needing a real build.
- Follow the existing plain-Node `node:test` setup (`npm test`).

## Verification

- `npm run package:dist` on Linux/macOS → `tar -tvzf` on the produced `data.tar.gz`
  shows `-rw-r--r--` files and `drwxr-xr-x` directories.
- `npm run package:dist` on Windows → succeeds, prints the skip notice, and the check
  step still runs (it inspects the archive, not the filesystem).
- CI packaging job green on a clean checkout and red when a mode is
  deliberately set to `0666` in `dist` before packaging.

## Risks

- Rewriting modes before `ares-package` means the local `dist/` changes; that
  is fine (it is build output, not tracked).
- The check must not reject legitimate entries. Keep the "unexpected entry"
  list explicit rather than an allowlist of every file.
- If `ares-package` ever starts normalizing modes itself, the check becomes a
  cheap no-op rather than a conflict.

## Acceptance criteria

- No published `.ipk` contains group/other-writable entries.
- CI fails on a packaging regression.
- `npm run package:dist` behaves identically on Windows and POSIX for the parts that
  matter (the archive check), with the mode step skipped loudly on Windows.

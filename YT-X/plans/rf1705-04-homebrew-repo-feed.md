# RF1705-04 — Homebrew channel feed

Status: ready to implement
Addresses (RF1705 tracker): #19, #93, #100, #114, and the install-hang reports
#113 / #17 / #37 (see "Why this ranks high")
Touches: new `tools/gen-repo.ts`, `tools/gen-manifest.ts`,
`.github/workflows/release.yml`, `YT-X/README.md`, generated `YT-X/repo.json`

## Problem

YT-X is distributed only as `.ipk` assets on GitHub Releases. There is no
Homebrew Channel feed, so installation requires downloading an IPK and pushing
it with `ares-install` or Dev Manager.

In the RF1705 tracker that is the single most sustained user complaint: the feed
went stale (#93), the URL was wrong (#19), users asked for the feed before it
existed (#100), and a contributor had to add it (#114). Several users report
Dev Manager hanging at 95–97% and only succeeding via Homebrew (#113, #17, #37).
A feed is the installation path that already works for that segment of users.

## Goal

One stable URL users can paste into the Homebrew Channel, always pointing at the
latest release, generated from the release artefact rather than hand-edited.

## Non-goals

- Auto-update inside the app (`checkUpdateOnLaunch` stays `false`).
- A second app id for beta builds.
- Changing the release versioning scheme.

## The schema (verified against two working feeds)

`https://raw.githubusercontent.com/<owner>/<repo>/main/repo.json`:

```json
{
  "packages": [
    {
      "id": "youtube.leanback.v4",
      "title": "YouTube Extended for webOS",
      "shortDescription": "...",
      "iconUri": "https://raw.githubusercontent.com/.../extraLargeIcon.png",
      "manifest": {
        "id": "youtube.leanback.v4",
        "version": "1.0.0",
        "type": "web",
        "title": "YouTube-X for webOS",
        "iconUri": "...",
        "sourceUrl": "https://github.com/nerowentah/webos-addons",
        "rootRequired": false,
        "ipkUrl": "https://github.com/.../releases/download/v1.0.0/youtube.leanback.v4_1.0.0_all.ipk",
        "ipkHash": { "sha256": "..." },
        "ipkSize": 754000
      }
    }
  ]
}
```

`tools/gen-manifest.ts` already emits exactly these manifest fields. Two gaps:
it writes `ipkUrl` as a **bare filename** (correct for a local install, wrong
for a feed — the channel needs an absolute URL), and it omits `ipkSize`.

## Design

### 1. `tools/gen-manifest.ts` — accept an absolute URL

Add an optional `--ipk-url <absolute-url>` flag. When present, use it verbatim
for `ipkUrl`; otherwise keep the current filename behaviour. Add `ipkSize` from
`fs.statSync(ipkfile).size`. Keep the existing path confinement check.

### 2. New `tools/gen-repo.ts`

```
node tools/gen-repo.ts --base-url <release-download-url> [--out repo.json]
```

- Reads `assets/appinfo.json` and `getVersion()` (same helpers gen-manifest
  uses), plus the built `youtube.leanback.v4_<version>_all.ipk` in the cwd.
- Reuses the sha256 + size computation by importing the same helpers rather
  than duplicating them (extract `ipkMeta(file)` into `tools/version.ts` or a
  small shared module used by both tools).
- Emits `{ packages: [ ... ] }` with absolute `ipkUrl`
  (`${baseUrl}/${ipkfile}`), `ipkSize`, and `iconUri` derived from the
  `package.json` `repository` field exactly as `gen-manifest.ts` already does.
- Refuses to run if the IPK version and `appinfo.json` version disagree.
- Optional `--beta` writes a second entry with `id: "youtube.leanback.v4.beta"`
  and a `(Beta)` suffix in `title`/`shortDescription`.

### 3. Release workflow

After `Package IPK` and before `Publish release`:

1. Generate the manifest and the feed with `--base-url
"https://github.com/${GITHUB_REPOSITORY}/releases/download/${GITHUB_REF_NAME}"`.
2. Upload `youtube.leanback.v4.manifest.json` and `repo.json` as release
   assets.
3. Commit the generated `YT-X/repo.json` back to `main` so the raw URL is
   stable:

   `chore(release): publish homebrew feed for <tag>`

   This needs `contents: write` (the release job already has it) and a
   `git pull --rebase` guard for the concurrent-push case.

Alternative if commit noise on `main` is unwanted: publish the feed to a
`gh-pages` branch and document
`https://<owner>.github.io/<repo>/repo.json`. Same generator, different publish
step — pick one, not both.

### 4. README

In `Installation`, add the feed URL as the first option:

> Homebrew Channel → Add repository → `https://raw.githubusercontent.com/nerowentah/webos-addons/main/YT-X/repo.json`

Add the beta caveat if a beta entry is shipped (below).

## Beta channel caveat

Both entries share `manifest.id: youtube.leanback.v4`, so installing the beta
**replaces** the stable build (this is exactly what PR #114 did, and the copy in
that thread shows users did not realise it). If a beta entry ships:

- `shortDescription` must say it replaces the stable app;
- the beta entry should be gated behind a `--beta` flag so the default feed
  stays one clean entry unless you decide otherwise.

My recommendation: ship the stable feed first, add the beta entry only if beta
testers ask for it.

## Tests

- `tools/gen-repo.test.ts`: given a fixture appinfo + fake ipk bytes, assert
  the emitted JSON has an absolute `ipkUrl`, a 64-char sha256, `ipkSize`
  matching the fixture, one package when `--beta` is absent and two when it is,
  and that a version mismatch throws.
- Keep the generator DOM-free and filesystem-injectable, same pattern as
  `config-store.ts`, so `node --test` needs no temp IPK on disk.

## Verification

- Paste the generated URL into the Homebrew Channel on a TV → the app appears
  with the right title, icon and version, and installs.
- Re-run after a release → the same URL shows the new version without a manual
  edit.
- `npm run package && npm run manifest` still produce the locally useful
  (filename-based) manifest.

## Risks

- The feed is a mutable pointer to an immutable asset. If a release is deleted,
  the feed breaks — the commit history is the recovery path.
- GitHub's raw cache can serve a stale `repo.json` for a few minutes after a
  release; acceptable for a manual refresh flow.
- Do not commit the `.ipk` itself; only the feed and manifest.

## Acceptance criteria

- A single stable URL installs the current release through Homebrew.
- The feed is generated, never hand-edited, and CI fails if generation throws.

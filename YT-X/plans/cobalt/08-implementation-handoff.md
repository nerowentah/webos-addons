# Cobalt-08 — implementation handoff

Status: implementation paused at the user's request. This file records what is
already in the working tree, what is still unapplied, and the order to finish.
No source changes were made after the request to write to plan only.

## Working-tree state

The Cobalt rework and the follow-up edits are uncommitted. The existing
`plans/*.md` batch is still untracked, and `prettier-check` already fails on ten
older plan files.

Applied before the pause:

- `src/features/sponsorblock/segments.ts`
  - `TERMINAL_TOLERANCE_S`, `NATURAL_END_TAIL_S`, `skipTarget()`.
  - `nextHighlightStart()`.
  - `pickSegment()` now names its exclusion set `excludedStarts`.
  - `Rect`, `MarkerFrame`, and pure `markerFrame()` geometry for the overlay.
- `src/features/sponsorblock/sponsorblock.ts`
  - Fetch action types include `poi`.
  - `terminalHandled`, `excludedStarts()`, natural-end target, `ended` listener,
    terminal cleanup on refresh, and listener removal in `destroy()`.
  - Popup list filters highlights unless `enableSponsorBlockHighlight` is on.
  - Highlight jump runs from `init()`, refresh, `attachVideo()` and `playing`;
    it only marks `highlightDone` when it actually seeks.
- `src/core/csp-nonce.ts`
  - `NONCE_WAIT_MS`, pure `selectNonce()`, style/link-first `pageNonce()` with a
    best-effort any-`[nonce]` fallback.
  - Shared `nonceStyle()` queue with a bounded observer, timeout, and
    re-stamp/re-append on flush.
- `src/styles/insert-style.ts` now calls `nonceStyle()` and no longer owns a
  permanent observer.
- `src/ui/time-remaining.ts` calls `nonceStyle()` when creating its dynamic
  style element.
- `src/features/sponsorblock/markers.ts` and
  `src/features/sponsorblock/sponsorblock-markers.css` exist, but the module is
  **not wired into `sponsorblock.ts` yet**.
- Tests added: `tools/csp-nonce.test.ts`; `tools/sponsorblock-segments.test.ts`
  extended for `skipTarget`, `nextHighlightStart`, and `markerFrame`.

Not applied:

- Marker module wiring, start/render/destroy hooks.
- Plan 04 (UA default, deploy parsing, scripts, README).
- Plan 06 (cast docs and `handlesRelaunch` probe).
- Plan 07 (hygiene, retired key, lockfile, formatting).

## Remaining work

### 1. Wire the markers (finishes 03)

In `src/features/sponsorblock/sponsorblock.ts`:

1. Import `SegmentMarkers` from `./markers`.
2. Add `markers: SegmentMarkers | null = null`.
3. In `attachVideo()`, after the video is found and listeners are attached:
   stop any old instance, create
   `new SegmentMarkers(video, () => this.segments || [], () => this.skippableCategories)`,
   and call `start()`.
4. Call `this.markers?.render()` after every `rebuildSegments()`:
   - `init()` after the non-empty rebuild (and in the empty-list path so the
     overlay clears);
   - `applyRefreshedSegments()`;
   - the category-change callback in `watchConfig()`.
5. In `destroy()`, call `this.markers?.stop()` and set it to `null`.

Check before running the build: `markers.ts` is currently included by the
TypeScript program but unused, so its first compile may surface formatting or
DOM-lib issues. The marker overlay must stay decorative: a missing track or a
zero-width bar must not throw or block skipping.

### 2. Apply plan 04

- `tools/app-ua.ts`: default `DEFAULT_UA_MODE` to `webos`.
- `tools/app-ua.test.ts`: rename the default test and assert `webos`.
- `tools/deploy.ts`: reject a bare `--ua` and a bare `--resolution` instead of
  silently using the default; update the help text.
- `package.json`: add the opt-in `build:cobalt` / `deploy:cobalt` (and HD
  variants if the existing scripts have them). Remove or relabel the now
  redundant `*:webos` aliases only if they are not used by CI.
- `README.md`: make webOS the documented default and Cobalt the experimental
  opt-in; update the release note.
- `tools/compare-chrome.ts`: align its Cobalt UA with `app-ua.ts` (the current
  string lacks the LG device tail), or document why the probe intentionally
  uses the shorter PS4 UA.
- Remember: `release.yml` runs `npm run package`, so the default flip changes
  the released artefact.

### 3. Apply plan 06

- Soften the cast claims in `README.md` until the Android/iOS matrix is
  recorded.
- Verify whether `handlesRelaunch` is needed for the relaunch path; do not add
  it to `assets/appinfo.json` speculatively.
- Record the actual `curl`/`ssap://system.launcher/launch` results and the
  phone matrix; a single device is not a matrix.

### 4. Apply plan 07

- Restore the popup dot hairline in `sponsorblock-ui.css` only if it does not
  alter row hit targets.
- Decide the shorts-gradient and stats-panel rules against a current TV
  screenshot; remove them when YouTube's own plates already supply the look.
- Remove the dead `qned-theme-active` reference from `panel-care.ts`/`theme.css`
  if no runtime path still sets it.
- Fix stale comments in `categories.ts` and the marker/skip modules.
- Add `fixMultilineTitles` to `RETIRED_KEYS` and cover it in
  `tools/migrate-config.test.ts`.
- Sync the lockfile root version from `1.0.0` to `1.0.37` (the current
  `package.json` version), preferably by editing the two root `version` fields
  rather than a broad `npm install --package-lock-only` rewrite.
- Format the ten pre-existing plan files and this new plan with Prettier, as a
  separate commit.

### 5. Verification

Run, in this order:

1. `npm test`
2. `npm run lint`
3. `npm run lint:css`
4. `npm run type-check`
5. `npm run build`
6. `npm run test:compat`
7. `npm run audit`
8. `npm run prettier-check`
9. `npm run verify`

Current expectations:

- The helper tests for `skipTarget`, `nextHighlightStart`, `markerFrame`, and
  `selectNonce` already pass.
- `prettier-check` still fails on the older plans; fix it in the 07 pass.
- Device-only checks remain: marker alignment at 1080p/720p after a bar
  re-render, Cobalt CSP styling from a cold watch URL, terminal-segment
  behaviour with `Skip Once` on and off, and the cast matrix.

## Risks / open decisions

- **Highlight popup:** `popupSegments()` only hides highlights when the category
  is disabled. Other disabled categories still appear, matching the old popup.
  Decide whether that is intentional before changing it.
- **Nonce fallback:** `pageNonce()` may return a script nonce that does not
  satisfy `style-src`. The queue then stops at the bounded timeout. Document
  this as best-effort; if a device shows blocked styles, retry style/link-only.
- **Marker observer:** `markers.ts` observes the progress bar's parent. If the
  whole controls subtree is replaced, recovery depends on the next
  `seeked`/`playing`/`durationchange` event. This is intentional to avoid a
  document-wide observer; verify on device.
- **Terminal refresh:** `applyRefreshedSegments()` clears `terminalHandled`.
  If a refresh re-sends a terminal segment while the playhead is in the tail,
  the next attempt re-marks it without seeking. Verify no notification spam.
- **UA default:** flipping to `webos` changes the release artefact. The opt-in
  Cobalt script and README must be updated in the same commit.
- **Lockfile:** `package.json` is `1.0.37`, the lockfile root is `1.0.0`. Keep
  the change to the root version fields unless `npm` proves a broader rewrite
  is necessary.

## Suggested commits

1. `sponsorblock: add highlight and terminal handling` (01 + 02 + tests).
2. `styles: bound the CSP nonce retry` (05 + tests).
3. `sponsorblock: restore progress-bar markers` (03 + wiring + CSS).
4. `build: default to the webOS user agent` (04 + docs).
5. `docs: qualify cast support` (06).
6. `chore: clear the rework's remaining debris` (07 code).
7. `chore: format plans and sync the lockfile version` (07 formatting).

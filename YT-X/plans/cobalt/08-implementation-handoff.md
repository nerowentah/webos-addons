# Cobalt-08 — implementation handoff

Status: all code is committed (`b71ea30` … HEAD). What remains needs a TV and
phones. Acceptance boxes in plans 01–07 are ticked only where `npm test`, lint,
the build or a file check proves them; device-only boxes stay open.

## Landed

- 01/02: `poi` fetch, highlight jump on init/refresh/`playing`, `skipTarget`,
  terminal handling with `ended` cleanup, tests.
- 03: `SegmentMarkers` wired into attach/refresh/config/destroy; geometry tests.
- 04: default UA is `webos`; Cobalt via `build:cobalt`, `build:hd:cobalt`,
  `package:cobalt`, `deploy:cobalt`, `deploy:hd:cobalt` or `--ua cobalt`; bare
  `--ua`/`--resolution` rejected; README updated.
- 05: bounded nonce queue shared by `insert-style` and `time-remaining`.
- 06 (docs only): README says cast verification is pending.
- 07: dot hairline, dead `qned-theme-active` removed, `fixMultilineTitles`
  retired, lockfile synced to `package.json`, plans formatted, README Panel
  Care wording covers notifications.

## Open

- **Device, 01–03:** first-play highlight jump, no restart loop after a terminal
  skip (`Skip Once` on and off), marker alignment at 1080p/720p after a bar
  re-render.
- **Device, 05:** Cobalt build styled from a cold watch URL.
- **06:** `/apps/YouTube` probe, `handlesRelaunch` check, Android/iOS matrix,
  reboot cold start, `plans/results-<date>.md`.
- **07:** shorts-gradient and stats-panel rules need TV measurements; neither
  is restored or formally removed yet.
- **Release:** the default UA flip changes the released artefact; decide the
  version bump (1.0.37 is current).

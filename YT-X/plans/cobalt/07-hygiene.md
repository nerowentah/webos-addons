# Cobalt-07 — Shorts gradient and stats panel decisions

Status: the hygiene items (dot hairline, dead state, comments, lockfile, retired key, plans formatting, tests) are done. Two
page-level decisions remain, and both need a TV screenshot.

Current state: the rework removed the shorts metadata gradient and the stats-for-nerds reposition from `src/styles/yt-fixes.css`,
relying on YouTube's own plates. Nothing restored them. This plan only records the measurement that confirms or reverses that.

## Checks (TV)

- **Shorts:** screenshot a shorts shelf on the TV, not the desktop. If the metadata text reads at AA contrast (4.5:1 against the
  thumbnail) with YouTube's own plate, the removal stands. Otherwise restore a gradient or solid bottom band.
- **Stats panel:** open the settings panel on a watch page with stats for nerds enabled. If the panel does not cover
  `.html5-video-info-panel`, the removal stands. Otherwise restore the offset (its selector `.iLKnN .html5-video-info-panel` is
  brittle: document the tested build).

Do not keep a rule "just in case": either measured or removed. Record both results in `plans/cobalt/results-*.md`.

## Acceptance criteria

- [ ] Shorts metadata contrast is measured; the rule is either restored or documented as unnecessary.
- [ ] The stats overlay is measured; the rule is restored or removed with a reason.

# Cobalt-07 — Regressions and hygiene

Status: ready to implement
Addresses: the review's P2 findings from the Cobalt/ad-free rework
Touches: `src/features/sponsorblock/sponsorblock-ui.css`,
`src/styles/yt-fixes.css`, `src/ui/panel-care.ts`, `src/ui/theme.css`,
`src/ui/ui.css`, `src/features/sponsorblock/segments.ts`,
`src/features/sponsorblock/categories.ts`, `src/config/migrate.ts`,
`package-lock.json`, `plans/cobalt/*.md`

## Problem

The rework removed more than the Cobalt alignment required, and left stale
state behind:

1. **WCAG regression in the SponsorBlock popup.** The rework deletes the
   `.sb-segment-dot` hairline:
   `box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.65)`. The removed comment says
   it exists so the dark category dots (outro `#0202ed`, hook `#395699`) clear
   3:1 against the `#0f0f0f` plate. Removing it fails WCAG 1.4.11 for a
   graphical object, and plan 07 is still open.
2. **Unexplained page fixes removed.** `yt-fixes.css` loses the shorts metadata
   gradient (the removed comment claimed ~5.7:1 AA) and the
   stats-for-nerds reposition (so the settings panel no longer covers it).
   Neither is implied by "use YouTube's own plates".
3. **Dead state.** `panel-care.ts:50` still toggles `qned-theme-active`, but
   `theme.css` has no rule for it. `segments.ts:10` and `categories.ts:5` still
   describe the deleted progress-bar overlay. `ui.css:2` still says the class
   is set in `ui.ts`.
4. **Version mismatch.** `package.json` is `1.0.36`; `package-lock.json` root
   is still `1.0.0`.
5. **Retired key not listed.** `fixMultilineTitles` was removed from the
   defaults and the panel, but not added to `RETIRED_KEYS` in `migrate.ts`.
   Stored configs keep it forever; harmless today, misleading later.
6. **Plans fail Prettier.** Ten existing `plans/*.md` files fail
   `prettier-check`, so `npm run lint:all` is red if plans are committed.

## Goal

No accessibility or layout regression survives the rework; comments and dead
selectors match the code; the repo is green under `lint:all`.

## Design

### 1. Restore the dot hairline

Put the rule back on `.sb-segment-dot` in `sponsorblock-ui.css`, scoped to the
popup (the overlay, once restored by `03-progress-bar-markers.md`, must not
inherit it):

```css
/* Dark category dots (outro, hook) need a 3:1 boundary on the #0f0f0f plate. */
.sb-segments-popup .sb-segment-dot {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.65);
}
```

If the palette rule forbids the `rgba`, use `#717171` at full opacity and
verify the ratio; do not drop the boundary. Add a comment pointing at WCAG
1.4.11.

### 2. Decide the shorts gradient and stats panel

The rework removed both without a plan entry. Choose explicitly:

- **Shorts:** if YouTube's own tile now supplies a readable band, record that
  in the commit and delete the old rule. If not, restore the gradient (or a
  solid bottom band) so the metadata keeps AA contrast. Verify with a
  screenshot of a shorts shelf on the TV, not desktop.
- **Stats panel:** if the settings panel no longer overlaps
  `.html5-video-info-panel`, delete the rule and say so. If it still overlaps,
  restore the offset. This is a five-minute check with the panel open on a
  watch page.

Do not keep a rule "just in case": either measured or removed.

### 3. Remove dead state and fix comments

- Remove the `qned-theme-active` toggle or add the rules that make it
  meaningful. Off/QNED/OLED should be distinguishable in the code, not by a
  class with no selector.
- Update `segments.ts` `MAX_SEGMENTS` comment ("the overlay draws one element
  each") to the popup/marker reality after `03`.
- Update `categories.ts` "shared by the progress-bar overlay and the popup" to
  match whichever surfaces remain.
- Update `ui.css` / `theme.css` comments that name `ui.ts` or the old page
  surfaces.
- README: Panel Care says "only the settings panel and badge"; notifications
  are themed too (`notifications.ts`). Say "panel, badge and notifications" or
  stop theming notifications.

### 4. Config and release hygiene

- Add `'fixMultilineTitles'` to `RETIRED_KEYS` with a one-line comment.
- Sync `package-lock.json`:

  ```sh
  npm install --package-lock-only
  ```

  Confirm the root `version` and `packages[""].version` are `1.0.36`.

- Format the plans:

  ```sh
  npx prettier --write plans
  ```

  Then run `npm run prettier-check` and commit the formatting separately from
  the code change if the diff is noisy.

### 5. Add the missing tests

Pure helpers introduced by this batch should be tested where the harness
allows:

- `nextHighlightStart` (`01`);
- `skipTarget` (`02`);
- `markerFrame` (`03`);
- nonce selection (`05`);
- UA default (`04`).

The handler/DOM wiring remains device-verified; do not add a fake DOM just to
raise the count.

## Verification

- `npm test`, `npm run lint`, `npm run lint:css`, `npm run type-check`,
  `npm run build`, `npm run test:compat`, `npm run audit`.
- `npm run lint:all` (including `prettier-check`).
- Contrast: compute the dot boundary against `#0f0f0f` (≥3:1) and the shorts
  metadata against the thumbnail (≥4.5:1 for normal text).
- On device: panel open on a watch page, stats overlay visible and not
  covered; shorts shelf readable; SponsorBlock popup dots visible.

## Risks

- Restoring the hairline on the marker overlay would change marker thickness;
  keep the selector scoped to the popup.
- Prettier over the whole `plans/` folder touches unrelated files; land it as
  its own commit.
- If the stats-panel rule is still needed, its selector
  (`.iLKnN .html5-video-info-panel`) is brittle; document the tested build.

## Acceptance criteria

- [ ] The popup dot boundary is ≥3:1 against the plate.
- [ ] Shorts metadata contrast is measured; the rule is either restored or
      documented as unnecessary.
- [ ] The stats overlay is measured; the rule is restored or removed with a
      reason.
- [ ] No dead `qned-theme-active` toggle or stale overlay comments remain.
- [ ] `RETIRED_KEYS` includes `fixMultilineTitles`.
- [ ] `package-lock.json` matches `1.0.36`.
- [ ] `npm run lint:all` is green, including the plans.
- [ ] README matches the themed surfaces.

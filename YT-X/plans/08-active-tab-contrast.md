# 08 — Fix active-tab contrast in the 720p build

- Priority: P2
- WCAG: 1.4.3 Contrast (Minimum) (AA)
- Files: `src/ui/ui.css`
- Related: plan 09 (non-colour cue) — ship together if possible

Status: implemented in code with unit tests; the TV checks below are open.

## Acceptance criteria

- [ ] Computed active tab contrast is ≥ 4.5:1 at 1280×720 and 1920×1080.
- [ ] Active, inactive, focus and hover states remain visually distinct.
- [ ] The focus ring still has ≥ 3:1 against the tab menu.
- [ ] No layout shift (only the colour changes).

## Verification

- Build both resolutions (`npm run build:fhd`, `npm run build:hd`).
- In Chrome with the YouTube TV reference harness, compute:
  ```js
  const el = document.querySelector('.ytx-tab-btn.active');
  getComputedStyle(el).color;
  getComputedStyle(el).backgroundColor;
  ```
  then composite over the tab-menu background and check the ratio.
- On TV, open the panel and capture a screenshot at 720p; sample the text and
  plate pixels.

## Risks

- The panel background is translucent over video. Use the documented worst case
  (`ui.css:6-10`): 0.95 dark plate over white → `#202020`; white still passes
  comfortably.
- QNED/OLED care modes change the plate, not the tab text; white passes on
  both. Recheck with care mode enabled.

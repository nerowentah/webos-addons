# 08 — Fix active-tab contrast in the 720p build

- Priority: P2
- WCAG: 1.4.3 Contrast (Minimum) (AA)
- Files: `src/ui/ui.css`
- Related: plan 09 (non-colour cue) — ship together if possible

## Problem

`.ytx-tab-btn.active` is `#ff4444` on `rgba(255, 0, 0, 0.15)` over the panel
(`src/ui/ui.css:365-368`). Composited over the tab-menu plate, that is about
`#343434`, giving **3.66:1**.

- At 1080p, `2.1vh` is 22.7 px and the weight is 700, so it counts as large
  text and passes 3:1.
- In the 720p build, `2.1vh` is 15.1 px bold → normal text, so it needs 4.5:1
  and fails.
- The inactive `#b5b5b5` (8.98:1) and focus `#ffffff` (6.90:1) states pass.

## Implementation

1. Change the active tab text to `#ffffff`. White on the tinted plate is
   about 12.3:1 in both builds. Keep red as an accent in the border/underline
   (plan 09) rather than as small text.
2. Leave `.ytx-tab-btn:focus` as-is (`color: #ffffff`), so focus and active no
   longer differ by text colour; plan 09 supplies the shape cue.
3. Do not lighten the whole palette: `#ff4444` still passes on the plain panel
   (5.41:1) and is used for the heading, arrows and close glyph.
4. If the design requires red active text, the minimum is `#ff6b6b` (4.49:1
   on `#343434`) — but prefer white plus a red underline, which also satisfies
   plan 09.
5. Do not reduce the tab font size to dodge the large-text threshold; that
   worsens readability at TV distance.

## Acceptance criteria

- [ ] Computed active tab contrast is ≥ 4.5:1 at 1280×720 and 1920×1080.
- [ ] Active, inactive, focus and hover states remain visually distinct.
- [ ] The focus ring still has ≥ 3:1 against the tab menu.
- [ ] No layout shift (only the colour changes).

## Verification

- Build both resolutions (`npm run build`, `npm run build:hd`).
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

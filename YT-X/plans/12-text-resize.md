# 12 — Let users enlarge YT-X text up to 200%

- Priority: P3
- WCAG: 1.4.4 Resize Text (AA)
- Files: `src/config/config.ts`, `src/config/ui-text.ts`, `src/config/migrate.ts`,
  `src/ui/controls.ts`, `src/ui/options-panel.ts`, `src/ui/ui.ts`,
  `src/ui/ui.css`, `src/features/sponsorblock/sponsorblock-ui.css`, `README.md`

## Problem

All YT-X typography is sized in `vh` (panel, tabs, labels, toasts, badge in
`rem`). Browser text-size changes do not affect `vh`, and webOS has no page
zoom, so users cannot enlarge the UI text. At 200% many labels would also
overflow the fixed 70 vw × 70 vh panel unless the existing density/stack rules
are exercised.

This is the largest item; it is independent of the semantic fixes.

## Design

Add a `Text Size` cycle control (100 / 125 / 150 / 200%) that sets a
`--ytx-text-scale` custom property. Apply it only to `font-size`, never to
layout heights, so the existing `recalcDensity()` and grid stacking handle the
extra text. This is the practical equivalent of text resize on a TV, where
browser zoom does not exist.

## Implementation

1. `config.ts`
   - add `export const textScaleModes = { normal: '100%', large: '125%',
huge: '150%', maximum: '200%' } as const;`
   - `export type TextScaleMode = keyof typeof textScaleModes;`
   - default `uiTextScale: 'normal' as TextScaleMode`
   - add `uiTextScale: Object.keys(textScaleModes)` to `enumValues`.
2. `ui-text.ts`: `uiTextScale: 'Text Size'` in `UI_LABELS`.
   Existing `MAX_LABEL_TEXT` (28) and the cycle value column accommodate
   `200%`.
3. `controls.ts`: extend `CycleKey` to include `'uiTextScale'` so
   `createAlignedCycleControl('uiTextScale', textScaleModes)` type-checks.
4. `options-panel.ts`: add the control to the UI Tweaks page (or Main), after
   `disableAnimations`. It is a system-wide readability control; UI Tweaks is
   the better home.
5. New `src/ui/text-scale.ts`:
   ```ts
   const SCALE: Record<TextScaleMode, string> = {
     normal: '1',
     large: '1.25',
     huge: '1.5',
     maximum: '2'
   };
   function apply(): void {
     document.documentElement.style.setProperty(
       '--ytx-text-scale',
       SCALE[configRead('uiTextScale')]
     );
     panelState.panel?.recalcDensity();
   }
   export function initTextScale(): void {
     apply();
     configAddChangeListener('uiTextScale', apply);
   }
   ```
   Import and call `initTextScale()` in `ui.ts` after the panel care init.
6. `ui.css`: add `--ytx-text-scale: 1;` to `:root` (or `html`), then wrap every
   YT-X `font-size` in `calc(<value> * var(--ytx-text-scale))`. Cover at least:
   - `.ytx-ui-container` (base 4.44vh)
   - `h1`, `.ytx-close-btn`, `.ytx-tab-btn`, `.ytx-cycle-label`,
     `.ytx-cycle-value`, `.arrow-btn`, `.current-value`
   - `.section-title`, `.section-title-note`, `.ytx-ui-version`
   - `.ytx-notification-container`, `.ytx-ui-badge` (`0.8rem`)
   - SponsorBlock `.sb-header-text`, `.sb-header-subtitle`,
     `.sb-segment-category`, `.sb-segment-time`, `.sb-popup-close`
     Leave layout properties (`width`, `height`, `padding`, `margin`,
     `min-height`, `border`, `outline`) in `vh`.
7. `sponsorblock-ui.css` uses the same variable; the property is inherited
   from `html`, so no extra wiring is needed.
8. Density: at 150–200%, labels wrap and the grid steps down via
   `recalcDensity()` (`options-panel.ts:281-299`). Verify the section titles and
   cycle value column still fit; `current-value` has `max-width: 22vh` and
   ellipsis, so long values truncate rather than overlap the arrows.
9. Do not scale YouTube’s own UI. This setting only affects YT-X surfaces.
10. `README.md`: add a line under Interface → “Text Size scales YT-X overlays
    100–200%; YouTube’s own text is unchanged.”

## Acceptance criteria

- [ ] Text Size appears in UI Tweaks and persists across launches.
- [ ] 100 / 125 / 150 / 200% visibly change all YT-X text, including toasts,
      badge and SponsorBlock popup.
- [ ] At 200% on 1080p and 720p, no text is clipped, no control overlaps, and
      every row remains reachable (page scrolls; grid stacks).
- [ ] The panel still fits in 70 vw × 70 vh; no horizontal scrollbar.
- [ ] Checkbox hit targets are unchanged in size; only text grows.
- [ ] Stored config without the key migrates to `normal` (the store merges
      defaults; no explicit migration needed unless defaults are not merged —
      verify `config-store.ts`).

## Verification

- Cycle to 200% on TV and screenshot each tab.
- `node tools/inspect.ts eval`:
  ```js
  const p = document.querySelector('.ytx-ui-container');
  [
    getComputedStyle(p).fontSize,
    getComputedStyle(p).getPropertyValue('--ytx-text-scale'),
    p.scrollWidth,
    p.clientWidth
  ];
  ```
- Check `document.documentElement.scrollWidth <= innerWidth`.
- Run `npm run check:text` (UI label lengths), `npm run lint:css`, type-check.

## Risks

- This is a broad CSS edit. Land it alone and eyeball every panel page at 100%
  first, then 200%, so a missed `font-size` is obvious.
- Header/close overlap at 200%: the h1 is centered and the close button is
  absolute. If the title wraps under the button, cap the header at 150% or
  allow the h1 to wrap with side padding; do not shrink the close target.
- Real browser text zoom is still unsupported on webOS. Document this as a
  user-controlled equivalent, not a claim that 1.4.4 is fully met by CSS.

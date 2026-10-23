# 09 — Identify the active tab without relying on colour

- Priority: P2
- WCAG: 1.4.1 Use of Color (A)
- Files: `src/ui/ui.css`
- Depends on: plan 08 (active text becomes white)

## Problem

The active tab is currently distinguished only by red text and a red-tinted
background (`src/ui/ui.css:365-368`). All tabs share the same weight, size,
border and position. A user who cannot distinguish the red tint cannot tell
which page is selected. Inactive `#b5b5b5` vs active `#ff4444` is a colour-only
difference.

## Implementation

1. Add a shape cue to the active tab using a pseudo-element, so it survives
   focus/hover rules that overwrite `box-shadow`:
   ```css
   .ytx-tab-btn {
     position: relative;
   }
   .ytx-tab-btn.active::after {
     content: '';
     position: absolute;
     left: 12%;
     right: 12%;
     bottom: 0.25vh;
     height: 0.28vh;
     border-radius: 0.14vh;
     background: #ff4444;
   }
   ```
2. Keep the active background tint and white text from plan 08. The underline
   is the non-colour cue; it is visible in greyscale.
3. Do not use `border-bottom`: it changes the box height and can shift the tab
   row. The absolute pseudo-element does not affect layout.
4. Ensure `.ytx-tab-btn:focus` does not remove the underline: `::after` is not
   affected by the focus `box-shadow`.
5. Optional second cue: prepend a small dot or change `font-weight` to 800.
   Weight alone is weak at TV distance; prefer the underline.
6. Add `aria-selected` in plan 03 for AT; this plan is the visual counterpart.

## Acceptance criteria

- [ ] A greyscale screenshot still shows which tab is active.
- [ ] Active tab underline is visible in Off, OLED and QNED care modes.
- [ ] Focus ring and underline do not overlap confusingly.
- [ ] No layout shift when switching tabs.
- [ ] Active state is still distinguishable at 720p.

## Verification

- Capture the panel with the Main tab active; desaturate the screenshot and
  confirm the underline is the remaining cue.
- Switch tabs with `drive.ts "right,ok"` and repeat.
- Check computed `::after` height/colour in Chrome.

## Risks

- Red underline over the QNED red-tinted plate may lose contrast in colour
  vision deficiency. The shape (a bar) is still visible; if it blends, use
  `#ffffff` for the bar instead, which is unambiguous on both plates.
- Do not animate the underline; it is a state indicator, not decoration.

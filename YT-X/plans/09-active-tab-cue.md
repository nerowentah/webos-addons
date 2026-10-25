# 09 — Identify the active tab without relying on colour

- Priority: P2
- WCAG: 1.4.1 Use of Color (A)
- Files: `src/ui/ui.css`
- Depends on: plan 08 (active text becomes white)

Status: implemented in code with unit tests; the TV checks below are open.

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

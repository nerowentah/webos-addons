# 12 — Let users enlarge YT-X text up to 200%

- Priority: P3
- WCAG: 1.4.4 Resize Text (AA)
- Files: `src/config/config.ts`, `src/config/ui-text.ts`, `src/config/migrate.ts`,
  `src/ui/controls.ts`, `src/ui/options-panel.ts`, `src/ui/ui.ts`,
  `src/ui/ui.css`, `src/features/sponsorblock/sponsorblock-ui.css`, `README.md`

Status: implemented in code with unit tests; the TV checks below are open.

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

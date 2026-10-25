# 04 — Expose the cycle controls as named value controls

- Priority: P1
- WCAG: 4.1.2 Name, Role, Value (A); 1.3.1 Info and Relationships (A)
- Files: `src/ui/controls.ts`, `src/ui/panel-keys.ts`
- Depends on: plan 02 (dialog wrapper)

Status: implemented in code with unit tests; the TV checks below are open.

## Acceptance criteria

- [ ] AX tree: `spinbutton` named “Video Codec” (or “Panel Care Mode”).
- [ ] `aria-valuetext` is the visible value (“Auto”, “OLED”, “HEVC (H.265)”).
- [ ] Changing the value updates `aria-valuetext` without moving focus.
- [ ] Left/Right and Enter still work; Space now also cycles.
- [ ] The `<`/`>` glyphs are absent from the AX tree.
- [ ] No change to the A-Z ordering (`dataset.sortKey`).

## Verification

- With the panel open, evaluate:
  ```js
  const row = document.querySelector('.ytx-cycle-row');
  [
    row.getAttribute('role'),
    row.getAttribute('aria-label'),
    row.getAttribute('aria-valuetext')
  ];
  ```
- Press Right and re-read `aria-valuetext`.
- CDP AX tree: one spinbutton per cycle row, with value.
- Unit-test the Space predicate only if extracted; no DOM test harness exists.

## Risks

- Some ATs expect Up/Down for spinbuttons; here Up/Down moves focus. WCAG does
  not prescribe keys, but document the divergence in a code comment. If this
  proves confusing, fall back to `role="button"` with `aria-label` containing
  the value (less ideal: value changes are not announced).
- `aria-valuenow` is an index, not a user-facing number. Always pair it with
  `aria-valuetext`; never leave only the index.
- Screen readers on webOS are limited; keep the visible value text accurate.

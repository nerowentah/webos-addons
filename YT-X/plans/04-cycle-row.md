# 04 — Expose the cycle controls as named value controls

- Priority: P1
- WCAG: 4.1.2 Name, Role, Value (A); 1.3.1 Info and Relationships (A)
- Files: `src/ui/controls.ts`, `src/ui/panel-keys.ts`
- Depends on: plan 02 (dialog wrapper)

## Problem

`createGenericControlRow()` builds a `div.ytx-cycle-row[tabindex=0]` with a
click handler (`src/ui/controls.ts:117-155`). It has no role, no accessible
name, and no value state. The visible `<`/`>` glyphs are click-only spans.
`updateDisplay()` only writes `textContent`, so AT never hears the value
change.

## Design

Use `role="spinbutton"` for the row. It is a discrete value control, and the
role lets AT hear the current value through `aria-valuetext` when it changes.
The custom keys stay as they are:

- Left/Right cycles the value (`panel-keys.ts:61-78`).
- Enter activates the row (`panel-keys.ts:96-102`).
- Up/Down moves spatial focus to the next/previous control.

Add an explicit Space handler for `.ytx-cycle-row` only, so keyboard users are
not forced to use Enter. Do not intercept Space for native checkboxes; the
browser already toggles those.

## Implementation

1. In `createGenericControlRow()` set on the container:
   - `role: 'spinbutton'`
   - `'aria-label': labelText`
   - `'aria-valuemin': '0'`
   - `'aria-valuemax'` and `'aria-valuenow'` / `'aria-valuetext'` via
     `updateDisplay()`.
2. Extend the helper’s parameters with a state getter:
   ```ts
   getState?: () => { index: number; count: number };
   ```
   In `createCycleControl()` pass:
   ```ts
   () => {
     const index = modesArray.indexOf(configRead(configKey));
     return { index: index < 0 ? 0 : index, count: modesArray.length };
   };
   ```
3. In `updateDisplay()` (called on init and on every config change):
   - `container.setAttribute('aria-valuemax', String(state.count - 1))`
   - `aria-valuenow = String(state.index)`
   - `aria-valuetext = displayValueGetter()`
     Keep the visible `valueText` update as-is.
4. Add `aria-hidden="true"` to the two `.arrow-btn` spans. They are pointer
   affordances only; the row itself carries the accessible name/value.
5. In `panel-keys.ts`, handle Space for cycle rows:
   ```ts
   if (evt.keyCode === 32 && focused?.classList.contains('ytx-cycle-row')) {
     consume(evt);
     focused.click();
   }
   ```
   Keep this after the Enter branch and do not apply it to checkboxes.
6. Do not add a visible label change; the `ytx-cycle-label` span remains the
   visible label and the `aria-label` must match it exactly.

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

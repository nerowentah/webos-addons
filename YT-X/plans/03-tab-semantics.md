# 03 — Give the settings tabs tablist/tab/tabpanel semantics

- Priority: P1
- WCAG: 4.1.2 Name, Role, Value (A); 1.3.1 Info and Relationships (A)
- Files: `src/ui/options-panel.ts`, `src/config/ui-text.ts`
- Depends on: plan 02 (dialog wrapper)

## Problem

`tabMenu` is a `div` and the tabs are plain `<button>`s
(`src/ui/options-panel.ts:52-83`). `setActivePage()` only toggles a CSS class
(`99-104`). There is no `tablist`, no `tab`, no `tabpanel`, no `aria-selected`,
and no `aria-controls`, so AT cannot tell that the row selects pages or which
page is current.

## Implementation

1. `tabMenu` props: `role: 'tablist'`, `'aria-orientation': 'horizontal'`,
   `'aria-label': PANEL.tabsLabel`.
   Add `tabsLabel: 'Settings sections'` to `PANEL` in
   `src/config/ui-text.ts` (under 40 chars).
2. Each tab button gets:
   - `role: 'tab'`
   - `id: 'ytx-tab-' + index`
   - `'aria-controls': pageIds[index]`
   - `'aria-selected': index === 0 ? 'true' : 'false'`
   - keep `tabIndex: 0` for all tabs. The custom spatial navigator
     (`panel-keys.ts:17-22`) filters `tabIndex >= 0`; roving tabindex would
     make inactive tabs unreachable by the D-pad. Document this deviation in a
     comment.
3. Keep all five page elements in a `pageIds` constant matching the existing
   ids: `ytx-page-main`, `ytx-page-ui-tweaks`, `ytx-page-system`,
   `ytx-page-privacy`, `ytx-page-sponsor`.
4. Each page gets `role: 'tabpanel'`, `'aria-labelledby': 'ytx-tab-' + index`,
   and `tabIndex: 0` only if the page has no focusable child (main has inputs,
   so omit; keep the existing ids).
5. In `setActivePage()`:
   - set `aria-selected="false"` on the previous tab and `"true"` on the new
     one before/while toggling `.active`;
   - the hidden page keeps `display:none` (already true), which removes it
     from the AX tree;
   - when the active page becomes visible, do not change focus if the user
     clicked a tab (existing `isTabFocused` logic already handles this).
6. Add `aria-label` on each tab? No: the visible text is the name. Avoid
   duplicating.

## Acceptance criteria

- [ ] AX tree: one `tablist` with five `tab` children.
- [ ] Exactly one tab has `aria-selected="true"` at all times.
- [ ] Each selected tab references its visible `tabpanel`.
- [ ] D-pad Left/Right still moves between tabs and Enter activates.
- [ ] Hidden pages are absent from the AX tree.
- [ ] Screen reader announces “Main, tab, 1 of 5, selected”.

## Verification

- CDP `Accessibility.getFullAXTree` with the panel open; assert roles,
  `selected`, and `controls`.
- `drive.ts "right,ok"` to switch to the UI tab; re-read the AX tree.
- Check that the second tab’s page is now the only visible tabpanel.

## Risks

- Do not add arrow-key tab switching that swallows Left/Right: those keys are
  owned by the spatial navigator and by cycle rows
  (`panel-keys.ts:61-93`). Tab activation stays Enter/click.
- If a future screen reader requires roving tabindex, extend
  `panelFocusables()` to include inactive tabs before changing `tabIndex`.

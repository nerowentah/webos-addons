# 03 — Give the settings tabs tablist/tab/tabpanel semantics

- Priority: P1
- WCAG: 4.1.2 Name, Role, Value (A); 1.3.1 Info and Relationships (A)
- Files: `src/ui/options-panel.ts`, `src/config/ui-text.ts`
- Depends on: plan 02 (dialog wrapper)

Status: implemented in code with unit tests; the TV checks below are open.

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

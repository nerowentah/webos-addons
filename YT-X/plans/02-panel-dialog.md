# 02 — Expose the options panel as a named modal dialog

- Priority: P1
- WCAG: 4.1.2 Name, Role, Value (A); 1.3.1 Info and Relationships (A)
- Files: `src/ui/options-panel.ts`, `src/config/ui-text.ts`

Status: implemented in code with unit tests; the TV checks below are open.

## Acceptance criteria

- [ ] AX tree contains `dialog` with name “YouTube Extended for webOS”.
- [ ] `aria-modal` is exposed as true.
- [ ] Focus still enters the active tab on open and cannot leave the panel.
- [ ] Back/Escape still close the panel.
- [ ] No duplicate id: `ytx-panel-title` appears once.

## Verification

- On TV, with the panel open:
  ```js
  session.send('Accessibility.getFullAXTree');
  ```
  find the dialog node and confirm `role`, `name`, and `modal`.
- `node tools/inspect.ts eval "document.querySelector('.ytx-ui-container').getAttribute('role')"`.

## Risks

- `aria-modal` tells AT to ignore the background. If the focus trap ever
  regresses, this becomes misleading, so keep the plan-06 focus tests.
- Do not add `role="application"`; it would override the screen reader's
  browse mode.

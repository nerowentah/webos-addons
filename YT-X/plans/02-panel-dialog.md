# 02 — Expose the options panel as a named modal dialog

- Priority: P1
- WCAG: 4.1.2 Name, Role, Value (A); 1.3.1 Info and Relationships (A)
- Files: `src/ui/options-panel.ts`, `src/config/ui-text.ts`

## Problem

`.ytx-ui-container` is a plain `div[tabindex=0]` (`src/ui/options-panel.ts:19-38`).
It has an `h1`, but no `role="dialog"`, no `aria-modal`, and no accessible
name. Assistive technology sees an unnamed generic container; the focus trap
and Back handling are invisible to it.

## Implementation

1. On the container props in `createOptionsPanel()` add:
   - `role: 'dialog'`
   - `'aria-modal': 'true'`
   - `'aria-labelledby': 'ytx-panel-title'`
     Keep `tabIndex: 0` as the no-focusable fallback.
2. Give the heading span an id:
   ```ts
   const elmHeading = createElement(
     'h1',
     {},
     createElement('span', { id: 'ytx-panel-title', text: PANEL.heading })
   );
   ```
3. Do not set `aria-hidden` on YouTube's app root. `aria-modal="true"` is
   valid here because `src/ui/panel-keys.ts:105-132` already traps focus and
   Back closes the panel. Hiding `ytlr-app` risks breaking YouTube's own
   incremental DOM and focus engine.
4. Confirm the panel is removed from the accessibility tree while
   `display:none` (it is, via `style.display` in `panel-controller.ts:47-53`).

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

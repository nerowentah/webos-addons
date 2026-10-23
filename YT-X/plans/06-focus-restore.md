# 06 — Restore focus when the settings panel closes

- Priority: P2
- WCAG: 2.4.3 Focus Order (A)
- Files: `src/ui/panel-controller.ts`, `src/ui/badge.ts`, `src/ui/ui.ts`,
  `src/ui/panel-state.ts`
- Depends on: plan 01 (keyboard opener supplies a real opener)

## Problem

Closing the panel calls `panel.blur()` and sets `lastSafeFocus = null`
(`src/ui/panel-controller.ts:47-53`). Focus falls to `<body>`; the D-pad user
loses their place in YouTube's UI. Opening the panel also never records where
focus came from.

## Implementation

1. Add module-level state in `panel-controller.ts`:
   ```ts
   let openerFocus: HTMLElement | null = null;
   ```
   Keep `panelState.lastSafeFocus` for the in-panel trap; do not overload it.
2. Change the signature to:
   ```ts
   export function showOptionsPanel(
     visible = true,
     opener: HTMLElement | null = null
   ): void
   ```
3. On open (`visible && !panelState.visible`), before moving focus:
   - `openerFocus = opener ?? (document.activeElement instanceof HTMLElement
     ? document.activeElement : null)`
   - ignore `<body>`, `<html>`, and anything inside the panel.
4. On close (`!visible && panelState.visible && panelState.panel`):
   - capture `const target = openerFocus;`
   - after `animatePanelOut()` starts and `panelState.visible = false`, schedule
     restoration on the next animation frame (or after the 300 ms hide). The
     opener is outside the panel and still visible, so rAF is sufficient:
     ```ts
     requestAnimationFrame(() => {
       if (target?.isConnected && target.getClientRects().length > 0) {
         target.focus();
       }
     });
     ```
   - clear `openerFocus = null` after attempting.
   - Do not call `panel.blur()` before saving the target; it is already saved.
5. Update callers:
   - `initBadge(() => showOptionsPanel(!panelState.visible, configBadge))`
     in `ui.ts:20`, and export the badge element or pass it from `badge.ts`.
   - Plan 01’s shortcut passes `document.activeElement` as the opener.
   - The panel’s own close callback `showOptionsPanel(false)` keeps the saved
     opener.
6. If the opener was the badge and the badge is in pointer-mode hidden
   (`getClientRects().length === 0`), fall back to leaving focus where the
   browser puts it; do not force focus onto a hidden node.

## Acceptance criteria

- [ ] Open with GREEN from a video tile; close with Back; focus returns to
      that tile (or the closest still-connected element).
- [ ] Open via the badge; close; focus returns to the badge when visible.
- [ ] Focus never lands on `<body>` after a normal close.
- [ ] If YouTube re-rendered the opener away, close is safe (no exception, no
      focus jump into a hidden node).
- [ ] The focus trap still cannot escape while the panel is open.

## Verification

- On TV:
  ```js
  // before opening
  document.activeElement.outerHTML.slice(0, 120)
  ```
  then open/close and re-read `document.activeElement`.
- Repeat from home, watch, and search.
- `drive.ts "green,back"` and inspect `activeElement`.

## Risks

- YouTube’s focus engine may immediately steal focus back to a different tile
  after close. If rAF loses the race, retry once after the 300 ms hide timer;
  do not loop indefinitely.
- Do not restore focus before the panel is hidden; focusing behind a modal can
  fight the focus trap (`panel-keys.ts:108-128`).

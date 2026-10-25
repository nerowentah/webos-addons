# 06 — Restore focus when the settings panel closes

- Priority: P2
- WCAG: 2.4.3 Focus Order (A)
- Files: `src/ui/panel-controller.ts`, `src/ui/badge.ts`, `src/ui/ui.ts`,
  `src/ui/panel-state.ts`
- Depends on: plan 01 (keyboard opener supplies a real opener)

Status: implemented in code with unit tests; the TV checks below are open.

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
  document.activeElement.outerHTML.slice(0, 120);
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

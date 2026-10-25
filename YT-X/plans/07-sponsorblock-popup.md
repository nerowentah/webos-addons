# 07 — Make the SponsorBlock popup labelled and dismissible

- Priority: P2
- WCAG: 1.3.1 Info and Relationships (A); 2.1.1 Keyboard (A);
  4.1.3 Status Messages (AA)
- Files: `src/features/sponsorblock/sponsorblock-ui.ts`,
  `src/features/sponsorblock/sponsorblock-ui.css`

Status: implemented in code with unit tests; the TV checks below are open.

## Acceptance criteria

- [ ] AX tree: `region` named “SponsorBlock” containing a `list` of
      `listitem`s.
- [ ] The popup has a keyboard-focusable “Dismiss” button with a visible
      focus ring.
- [ ] Activating Dismiss hides the popup and cancels the hide timer.
- [ ] Focusing/hovering the popup does not let it disappear underneath the
      user.
- [ ] On auto-show, the count is announced once, politely.
- [ ] Opening the settings panel still suppresses the popup.
- [ ] The icon is not announced twice.

## Verification

- Play a video with SponsorBlock segments; at 8 s check the AX tree for the
  region/status/list.
- `drive.ts` cannot focus the close button via D-pad; test with a USB keyboard
  Tab, or click via `tools/drive.ts` `click()` helper.
- Hover/focus, wait 10 s, confirm the popup stays while hovered.

## Risks

- A `role="status"` inside an auto-appearing region may announce before the
  user knows what SponsorBlock is; the title/subtitle are visible and the
  message is short.
- If rows are later made actionable (“skip to segment”), they need real
  buttons and keyboard activation; do not add click handlers to the current
  informational rows.
- Keep `AUTO_SHOW_DELAY_MS`/`AUTO_HIDE_MS` unchanged; this plan adds control,
  not new timing.

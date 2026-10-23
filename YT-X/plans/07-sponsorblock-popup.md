# 07 — Make the SponsorBlock popup labelled and dismissible

- Priority: P2
- WCAG: 1.3.1 Info and Relationships (A); 2.1.1 Keyboard (A);
  4.1.3 Status Messages (AA)
- Files: `src/features/sponsorblock/sponsorblock-ui.ts`,
  `src/features/sponsorblock/sponsorblock-ui.css`

## Problem

The popup is a `div[tabindex=-1]` with no role or name
(`sponsorblock-ui.ts:44-46`). Rows are `div[tabindex=-1]` (`103-105`). It
auto-appears 8 s after playback and auto-hides after another 8 s
(`151-173`) with no user control. Keyboard/pointer users cannot dismiss it,
and AT is not told that segment information appeared.

## Implementation

1. Popup:
   - `role="region"`
   - `aria-labelledby="sb-popup-title"`
   - give `titleText` the id `sb-popup-title`
   - keep `tabindex="-1"` so it is not in the Tab order
2. Add a dismiss button to the header:
   - native `<button type="button" class="sb-popup-close">`
   - `textContent = '✕'`, `aria-label = 'Dismiss'`
   - click handler: `clearTimers(); popup.classList.remove('visible')`
   - focus it with Enter/Space (native button behavior). Do not add a global
     Back handler; Back belongs to YouTube navigation.
3. Give the segment list structure:
   - `listContainer`: `role="list"`
   - each `.sb-segment-row`: `role="listitem"`
   - keep rows non-focusable; this is informational, not interactive.
4. Announce the auto-show once without reading every row:
   - add a visually hidden `<p class="sb-popup-status">` inside the popup with
     `role="status" aria-live="polite"`;
   - on `updateSegments()`, set it to
     `${segments.length} segment(s) found for this video`;
   - do not put `aria-live` on the whole list (avoids N announcements).
5. Pause the hide timer while the user is interacting:
   - `popup.addEventListener('focusin', pauseHide)`
   - `popup.addEventListener('mouseenter', pauseHide)`
   - `focusout`/`mouseleave`: restart a full `AUTO_HIDE_MS` timer
   - `pauseHide` clears `hideTimer` but leaves `showTimer` alone.
6. Icon: `alt=""` because the adjacent title already says “SponsorBlock”
   (`55-57`). If the title is ever removed, restore a meaningful alt.
7. CSS:
   - `.sb-popup-close` absolute top/right, 3.4vh square, same red/white
     focus ring language as `.ytx-close-btn`;
   - `outline` must not be removed without a replacement;
   - `.sb-popup-status` visually hidden (1px clip pattern), not `display:none`.
8. `suppressed` (panel open) still clears timers and hides the popup; keep
   that path.

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

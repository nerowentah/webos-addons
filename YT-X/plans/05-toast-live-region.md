# 05 — Announce toast notifications

- Priority: P2
- WCAG: 4.1.3 Status Messages (AA)
- Files: `src/ui/notifications.ts`, `src/ui/ui.css`

## Problem

`ensureContainer()` creates an unlabelled `div.ytx-notification-container`
(`src/ui/notifications.ts:34-43`), and messages are plain `div`s with text
(`66-69`). Nothing is announced when a toast appears or its text changes. The
messages also fade with `opacity: 0` but remain in the DOM for another second,
so stale text can linger in the accessibility tree.

## Implementation

1. In `ensureContainer()` set on the container:
   - `role: 'status'`
   - `'aria-live': 'polite'`
   - `'aria-atomic': 'false'`
     `role="status"` already implies polite; keep both for older engines.
2. Keep the existing message structure. `textContent` is safe and updates are
   what trigger the live-region announcement.
3. Make the removal state actually hidden from AT: in `ui.css`, add
   `visibility: hidden` to `.message-hidden` and include `visibility` in the
   transition list. Do not use `display:none` before the fade finishes.
4. Avoid the insertion-while-hidden problem: currently a message is appended
   with `message-hidden` and revealed two frames later. A live region can miss
   the initial insertion. Change the sequence to:
   - append the message with a new `message-enter` class that starts at
     `opacity: 0; transform: translateX(1.85vh)` and transitions to the normal
     state via a CSS animation, or
   - append it without `message-hidden` and trigger the fade with a keyframe.
     The text must be in the AX tree at insertion time.
5. On `update()`, changing `textContent` is enough; do not recreate the node.
   `aria-atomic="false"` avoids re-reading the whole stack.
6. Leave `liveMessages` dedupe logic unchanged. Reusing the same visible
   message for duplicate text must not produce a second announcement.

## Acceptance criteria

- [ ] AX tree contains one `status` region while a toast is visible.
- [ ] A new toast is announced once, politely.
- [ ] Updating the text of an existing toast announces the new text.
- [ ] Faded messages are not reachable in the AX tree.
- [ ] Multiple toasts do not all re-announce when one changes.
- [ ] Visual fade and 3 s dismissal timing are unchanged.

## Verification

- On TV: trigger a known toast (e.g. toggle Video Codec) and read
  `Accessibility.getFullAXTree` for a `status` node and text.
- Chrome: enable a screen reader or use CDP `Accessibility` + `Runtime`
  to confirm live-region properties.
- Snapshot the toast in `node tools/drive.ts` to check the fade still works.

## Risks

- `role="status"` on a container that holds multiple messages can produce
  noisy announcements. Keeping `aria-atomic="false"` and only changing one
  node at a time limits this.
- Do not set `aria-live="assertive"`; these are informational toasts.
- `visibility: hidden` on `.message-hidden` also removes it from hit-testing,
  which is fine for a non-interactive toast.

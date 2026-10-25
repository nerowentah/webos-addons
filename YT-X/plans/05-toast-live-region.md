# 05 — Announce toast notifications

- Priority: P2
- WCAG: 4.1.3 Status Messages (AA)
- Files: `src/ui/notifications.ts`, `src/ui/ui.css`

Status: implemented in code with unit tests; the TV checks below are open.

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

# 11 — Honour prefers-reduced-motion in YT-X surfaces

- Priority: P3
- WCAG: 2.3.3 Animation from Interactions (AAA; best practice for AA)
- Files: `src/ui/ui.css`, `src/features/sponsorblock/sponsorblock-ui.css`
- Related: existing `Disable Animations` config (`src/ui/theme.css:4-18`)

Status: implemented in code with unit tests; the TV checks below are open.

## Acceptance criteria

- [ ] With `prefers-reduced-motion: reduce`, panel/page/toast/popup
      transitions complete in ≤ 0.01 ms.
- [ ] Panel opens and closes normally; no stuck `collapse-start` state.
- [ ] Toasts still disappear after their configured time.
- [ ] No effect when the preference is absent or set to `no-preference`.
- [ ] No layout or contrast change.

## Verification

- Chrome DevTools → Rendering → Emulate CSS `prefers-reduced-motion: reduce`;
  open/close the panel and inspect computed `transition-duration`.
- CDP: `Emulation.setEmulatedMedia` with `features:
[{name:'prefers-reduced-motion', value:'reduce'}]`.
- On TV, the OS “Reduce motion” setting may or may not map to this media
  query; verify with `matchMedia('(prefers-reduced-motion: reduce)').matches`
  in `inspect.ts`.

## Risks

- 2.3.3 is AAA; this is not required for an AA claim. It is low-risk and
  improves comfort for motion-sensitive users.
- `!important` is intentional here to beat the component transitions; keep it
  scoped to the media query.
- Do not disable the focus ring or the panel’s `display:none` mechanics.

# 11 — Honour prefers-reduced-motion in YT-X surfaces

- Priority: P3
- WCAG: 2.3.3 Animation from Interactions (AAA; best practice for AA)
- Files: `src/ui/ui.css`, `src/features/sponsorblock/sponsorblock-ui.css`
- Related: existing `Disable Animations` config (`src/ui/theme.css:4-18`)

## Problem

YT-X panel, page, toast and SponsorBlock transitions always run. The
`disableAnimations` option is deliberately scoped to `ytlr-app` and its
children (`theme.css:8-18`), so the settings panel and notifications keep
their animations. Users who set the OS-level reduced-motion preference still
get the 150 ms panel/page/toast transitions and the popup slide.

## Implementation

1. Add a scoped media query at the end of `src/ui/ui.css`:
   ```css
   @media (prefers-reduced-motion: reduce) {
     .ytx-ui-container,
     .ytx-ui-container *,
     .ytx-notification-container .message,
     .ytx-ui-badge,
     .sb-segments-popup,
     .sb-segment-row {
       transition-duration: 0.01ms !important;
       transition-delay: 0s !important;
       animation-duration: 0.01ms !important;
       animation-delay: 0s !important;
       animation-iteration-count: 1 !important;
       scroll-behavior: auto !important;
     }
   }
   ```
   The wildcard inside the panel covers checkbox, close, tab and cycle
   transitions; the list outside covers toasts/badge/popup.
2. Add the same block for `.sb-*` selectors in `sponsorblock-ui.css` if that
   stylesheet is ever loaded without `ui.css`. Both are global imports today,
   so one block in `ui.css` is technically enough; duplicating the semantic
   selectors in the owning file is clearer.
3. Near-zero durations, not `none`: the JS hide timers
   (`panel-animation.ts:42-46`, toast removal) still fire as intended, and any
   `transitionend` listeners still fire.
4. Do not change the `disableAnimations` config’s scope as part of this plan.
   If product wants that toggle to cover YT-X too, that is a separate change
   (the comment in `theme.css:4-7` says the current scope is intentional).
5. The panel’s entrance still has a 300 ms exit timer before `display:none`;
   reduced motion only removes the visual fade. Opening/closing remains
   functional.

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

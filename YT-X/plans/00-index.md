# YT-X WCAG 2.2 AA — individual implementation plans

Source review: current working tree, 2026-10-22. All 12 findings are still
pending (0/12 complete at review time).

Location: `YT-X/plans/` — one independently shippable plan per finding.

Other plan tracks: [Cobalt userscript follow-up](./cobalt/00-index.md),
[RF1705 tracker](./rf1705-00-index.md),
[native Cobalt port](./native-cobalt/00-index.md), and
[native-only cast](./ytx-cast-native-only.md).

## Status of every track

| Track                                             | Done                                                             | Outstanding                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| WCAG 01-12 (this page)                            | none                                                             | all 12                                                                                           |
| [Cobalt follow-up](./cobalt/00-index.md)          | highlight `poi`, terminal skip, markers code, hygiene code       | TV checks: highlight cases, restart loop, marker re-render/720p, cast matrix, shorts/stats rules |
| [RF1705 tracker](./rf1705-00-index.md)            | terminal segments (moved to cobalt/02)                           | playback-rate measure, IPK packaging tools, Homebrew feed, device pass                           |
| [Native Cobalt port](./native-cobalt/00-index.md) | runtime, injection, identity, cast names, settings audit written | real ad proof, remote input, parity matrix, CI IPK job, more TVs, settings pass on TV            |
| [Native-only cast](./ytx-cast-native-only.md)     | appinfo, 404, cold start, docs                                   | Android and iOS single-destination matrix                                                        |

## Order

| #   | Plan                                                         | WCAG                | Priority | Depends on |
| --- | ------------------------------------------------------------ | ------------------- | -------- | ---------- |
| 1   | [Keyboard entry to settings](01-keyboard-entry.md)           | 2.1.1 (A)           | P1       | —          |
| 2   | [Panel dialog semantics](02-panel-dialog.md)                 | 4.1.2, 1.3.1 (A)    | P1       | —          |
| 3   | [Tab semantics](03-tab-semantics.md)                         | 4.1.2, 1.3.1 (A)    | P1       | 2          |
| 4   | [Cycle-row semantics](04-cycle-row.md)                       | 4.1.2, 1.3.1 (A)    | P1       | 2          |
| 5   | [Toast live region](05-toast-live-region.md)                 | 4.1.3 (AA)          | P2       | —          |
| 6   | [Focus restore on close](06-focus-restore.md)                | 2.4.3 (A)           | P2       | 1          |
| 7   | [SponsorBlock popup accessibility](07-sponsorblock-popup.md) | 1.3.1, 2.1.1, 4.1.3 | P2       | —          |
| 8   | [Active-tab contrast](08-active-tab-contrast.md)             | 1.4.3 (AA)          | P2       | —          |
| 9   | [Active-tab non-colour cue](09-active-tab-cue.md)            | 1.4.1 (A)           | P2       | 8          |
| 10  | [Section headings and groups](10-section-headings.md)        | 1.3.1, 2.4.6        | P3       | 2          |
| 11  | [Reduced motion](11-reduced-motion.md)                       | 2.3.3 (AAA)         | P3       | —          |
| 12  | [Text resize](12-text-resize.md)                             | 1.4.4 (AA)          | P3       | —          |

## Shared conventions

- Use the existing `createElement()` allowlist. `role` and `aria-*` are already
  permitted (`src/ui/dom.ts:6-19,52`), so no allowlist change is needed.
- Keep the custom D-pad focus engine (`src/ui/panel-keys.ts`); do not rely on
  native Tab order for TV navigation.
- Verify on the live TV with `node tools/inspect.ts` and CDP
  `Accessibility.getFullAXTree`; verify colour values with computed styles.
- Every plan is independently shippable. Run `npm run lint:all` and
  `npm run verify` after each.

## Definition of done for the batch

- [ ] Panel exposes a named modal dialog.
- [ ] Tabs expose tablist/tab/tabpanel with selected state.
- [ ] Cycle rows expose a name, role and current value.
- [ ] Toasts announce politely.
- [ ] Settings are reachable without a pointer.
- [ ] Focus returns to the opener on close.
- [ ] SponsorBlock popup is labelled and dismissible.
- [ ] AA contrast holds in both 1080p and 720p builds.
- [ ] Active tab is identifiable without colour.
- [ ] Section titles are headings/groups.
- [ ] YT-X honours reduced motion.
- [ ] Text can be enlarged to 200% without clipping.

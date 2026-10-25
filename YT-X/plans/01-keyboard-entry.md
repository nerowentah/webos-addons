# 01 — Keyboard/remote entry to the settings panel

- Priority: P1
- WCAG: 2.1.1 Keyboard (A)
- Files: `src/ui/badge.ts`, `src/ui/ui.ts`, `src/ui/panel-controller.ts`,
  `src/core/keys.ts`, `src/core/utils.ts`, `README.md`

Status: implemented in code with unit tests; the TV checks below are open.

## Acceptance criteria

- [ ] GREEN opens the panel from home, watch, search, and browse.
- [ ] GREEN does nothing while the panel is open; Back closes it.
- [ ] GREEN works on a remote whose green key reports 172.
- [ ] GREEN does not fire from `sendKey()`/synthetic events.
- [ ] Typing in a text field is unaffected.
- [ ] The badge still stays out of YouTube's tile focus order.

## Verification

- On TV: `node tools/drive.ts "green" shot.png` then
  `node tools/inspect.ts` — `settingsOverlayOpen` must be true.
- Send `back` and confirm the panel closes.
- Send GREEN twice; the second must be a no-op.
- Optional unit test for the key predicate if it is extracted as a pure
  function; `tools/keys.test.ts` already covers `REMOTE_KEYS`.

## Risks

- Some webOS remotes reserve colour keys for TV-side features. Test on the
  65QNED86 target first; BLUE is the fallback.
- The listener must be registered before YouTube's handlers (module import
  order in `ui.ts`), or YouTube may consume the key first.
- This shortcut is not a single-character shortcut, so 2.1.4 does not apply.

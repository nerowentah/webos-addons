# 01 — Keyboard/remote entry to the settings panel

- Priority: P1
- WCAG: 2.1.1 Keyboard (A)
- Files: `src/ui/badge.ts`, `src/ui/ui.ts`, `src/ui/panel-controller.ts`,
  `src/core/keys.ts`, `src/core/utils.ts`, `README.md`

## Problem

The only route to `showOptionsPanel()` is the badge click
(`src/ui/ui.ts:20`). The badge is a `<button>` but is forced out of every focus
order with `tabindex="-1"` (`src/ui/badge.ts:13`), and the README tells users to
click it with the Magic Remote pointer. A user without a pointer cannot open
any setting, which fails 2.1.1.

## Design

Add a documented remote-key shortcut. Keep the badge out of YouTube's D-pad
focus order (the comment in `badge.ts:8` explains why: it would steal tile
hover focus). Do not make the badge `tabIndex=0`.

Use the **GREEN** colour key by default. It is not used by any YT-X feature
(the screensaver uses YELLOW; keyboard search ignores all colour keys at
`src/features/keyboard-search/keyboard-search.ts:239`). Resolve the code via
`COLOR_CODE_MAP.get(evt.keyCode) === 'green'` so remotes that emit the
alternate code 172 also work (`src/core/keys.ts:31,57-67`).

## Implementation

1. In `src/ui/badge.ts` (or a small new `src/ui/shortcut.ts` imported by
   `ui.ts` before YouTube's handlers), register a capture-phase `keydown`
   listener on `window`:
   - Return early for `isSyntheticKey(evt)`, `evt.repeat`, or when
     `panelState.visible` is already true.
   - Return early when the active element is an editable control
     (`input`, `textarea`, `[contenteditable]`) so typing/search entry is not
     interrupted.
   - If `COLOR_CODE_MAP.get(evt.keyCode) === 'green'`, call
     `evt.preventDefault()` and `evt.stopImmediatePropagation()`, then
     `showOptionsPanel(true, document.activeElement as HTMLElement | null)`.
2. Do not toggle the panel closed on GREEN. Back already closes it
   (`src/ui/panel-keys.ts:49-53`), and a toggle would race with the open
   animation.
3. Add a short README line under the existing badge instruction:
   “Press **GREEN** on the remote to open YT-X settings.”
4. If GREEN proves reserved on a target model, switch the constant to BLUE
   (406/167/191) rather than adding a config key. A configurable binding is a
   larger change and was intentionally retired (`src/config/migrate.ts:31-32`).

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

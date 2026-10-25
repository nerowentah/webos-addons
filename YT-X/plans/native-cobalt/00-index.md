# Native Cobalt build — status

Status: running on one TV (LG 65QNED86, webOS 25, firmware 33.31.75); matrix, release and parity items open
Source: [RF1705/youtube-webos-cobalt-adfree](https://github.com/RF1705/youtube-webos-cobalt-adfree) runtime 2.0.6
(Cobalt 23.lts.6), reviewed at `99caa93` (2026-10-23)
Evidence: [`results-2026-10-23.md`](./results-2026-10-23.md)

YT-X ships **two builds from one codebase**. Neither replaces the other.

|                  | Web userscript                                                         | Native Cobalt                                                                                         |
| ---------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| What it is       | YT-X injected into the webOS web app (`youtube.leanback.v4`, type web) | RF1705's Cobalt binary with YT-X injected as `adblockPreload.js` + `adblockMain.js`                   |
| Build            | `npm run build:fhd` / `package:fhd` / `deploy:fhd`                     | `npm run build:fhd:cobalt`, then `node tools/native.ts package \| setup \| update`                    |
| Entry            | `src/userScript.ts` (full bundle)                                      | `src/native-early.ts` (hooks, before the document) + the same full bundle after load                  |
| Native-only code | none                                                                   | `src/native/`, `src/platform/cobalt-polyfills.ts`, `src/platform/is-native.ts` (marker `__ytxNative`) |
| Pick it when     | the stock web app plays your content                                   | you want the Cobalt player and native codecs                                                          |

Shared by both: hooks (`json-parse`, `json-stringify`, adblock, shorts, members-only, end screens, behind `claimHook`),
config store, settings panel, themes, `tv-specs`. Cobalt-safe CSS is enforced for every stylesheet by
`tools/cobalt-css.test.ts`.

## Decided and done (facts to keep)

- The stock app id `youtube.leanback.v4` is required; own ids abort with `LSRegisterPubPriv FAILED`.
- `cobalt` stays the stock ELF (RF1705 #74). The device identity is patched in place (`tools/native-device.ts`).
- Two-phase injection: hooks in the preload, full bundle after load; config writes replayed between them.
- Cobalt gaps are filled or avoided (see results): no grid, `:checked`, `var()`, 8-digit hex, `Element.closest/remove`,
  checkbox activation; `@keyframes` on `transform` aborts the app.
- Sign-in identity: `device_model` rewritten to the full SKU and lounge `deviceInfo` brand/model renamed, via the
  `--model-full` setup option.
- `setup` reinstalls and drops the session; use `update` for iteration.

## Open

| #   | Plan                                                   | Status                |
| --- | ------------------------------------------------------ | --------------------- |
| 3   | [Feature parity](./03-feature-parity.md)               | matrix partly filled  |
| 4   | [Packaging and release](./04-packaging-and-release.md) | CI/feed/rollback open |
| 5   | [Device matrix](./05-device-matrix.md)                 | one TV only           |

Also open: live ad-response proof, Magic Remote pointer/wheel, mute-segment audio, cast list on the phone (cache), more TVs.

## Conventions

- Keep the userscript working; native work must not regress `npm run build:fhd`, `package:fhd` or the UA modes.
- Never use userscript device results as native compatibility evidence.
- Run `npm run lint:all` and `npm run verify` after repository changes. Plans are covered by `prettier-check`.

Identity capture for the Security page check: `npm run capture:identity` (writes `dist/identity-<label>.md`, tokens redacted).

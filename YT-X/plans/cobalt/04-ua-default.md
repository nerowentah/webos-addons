# Cobalt-04 — User-agent default and build tooling

Status: decision needed, then implement
Addresses: the rework's build-time UA switch (`tools/app-ua.ts`)
Touches: `tools/app-ua.ts`, `tools/app-ua.test.ts`, `tools/deploy.ts`,
`tools/compare-chrome.ts`, `package.json`, `YT-X/README.md`

## Problem

The rework makes the PS4 Cobalt UA the default for every build:

```ts
export const DEFAULT_UA_MODE: UaMode = 'cobalt';
```

That changes which YouTube app/CSS/JS every user receives before the userscript
runs. The evidence for it is one TV (65QNED86, webOS 25) and the README itself
says other models and remote/pointer behaviour are untested. RF1705 does not
force this UA: its `Makefile` keeps the `$browserName$` template, and the
native Cobalt app gets the Cobalt build by being Cobalt.

There is also a tooling mismatch:

- `npm run build` / `package` / `deploy` produce `cobalt`;
- `tools/compare-chrome.ts` defaults to `--ua webos` (`:675`);
- so the manual reference gate compares the non-default build.

And `parseUa()` (`tools/deploy.ts:23-29`) returns `undefined` for a bare
`--ua`, which silently resolves to the default instead of reporting the missing
value.

## Goal

The default package keeps the webOS template UA (the LF build users have
today). The Cobalt UA remains available as a clearly labelled opt-in for the
matrix test and for users who want that build. Tooling defaults agree.

## Design

### 1. Flip the default

```ts
export const DEFAULT_UA_MODE: UaMode = 'webos';
```

Keep `COBALT_UA` and the `applyUserAgent` function unchanged. Update the test
matrix in `tools/app-ua.test.ts`:

- `resolveUaMode(undefined)` → `webos`
- `resolveUaMode('cobalt')` → `cobalt`
- unknown value still throws
- `applyUserAgent(appInfo, 'webos')` leaves the template byte-for-byte
- `applyUserAgent(appInfo, 'cobalt')` replaces it and still throws without
  `vendorExtension`

Do not change `compare-chrome.ts`: `--ua webos` is already the correct default
once the build default flips. Add a comment that the two defaults must stay in
sync (or export `DEFAULT_UA_MODE` and use it there if importing tooling into
tooling is acceptable; keeping the literals with a test is simpler).

### 2. Make the opt-in explicit in `package.json`

The shipped default is webos, so name the variants by what they select:

```json
"build:cobalt": "webpack --mode=production --env ua=cobalt",
"build:hd:cobalt": "webpack --mode=production --env resolution=1280x720 --env ua=cobalt",
"deploy:cobalt": "node tools/deploy.ts --ua cobalt",
"deploy:hd:cobalt": "node tools/deploy.ts --resolution 1280x720 --ua cobalt"
```

Keep `deploy:webos` / `deploy:hd:webos` as aliases (they now equal the default)
or remove them; do not leave both naming schemes undocumented. `package:cobalt`
should build then `ares-package`, following `package:hd`.

### 3. Reject a missing option value

`parseUa` / `parseResolution` should distinguish "flag absent" from "flag
present with no value". Return a sentinel or throw:

```ts
if (arg === '--ua') {
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('--ua needs a value: webos or cobalt');
  }
  return value;
}
```

`deploy.ts` already catches `resolveUaMode` and exits 1; let the parse error
take the same path. Add a small tooling test if `parseUa` is exported, or rely
on the existing CLI test pattern.

### 4. Document the real status

In the README build section, say:

- default: webOS template UA, LG build;
- `cobalt`: PS4 Cobalt UA, **experimental**, tested only on the listed model,
  remote/pointer untested;
- Cobalt build requires the CSP nonce handling from `05-csp-nonce.md`;
- the Chrome reference tool must match the build being tested.

Version note: a default-UA change is not a patch-level change. If this ships,
use a minor bump rather than `1.0.36`; if the default stays webos, the patch is
fine.

## Verification

- `npm test`, `npm run lint`, `npm run type-check`, `npm run build`.
- Inspect `dist/appinfo.json`: the default build must contain
  `$browserName$/$browserVersion$…`; `npm run build:cobalt` must contain the
  PS4 string.
- `node tools/deploy.ts --ua` exits non-zero with a readable message.
- `npm run compare:chrome` uses the webOS UA by default; `--ua cobalt` selects
  the cross-build.
- On device: install the default package and confirm the LG build; install the
  cobalt package and confirm the Cobalt build plus YT-X's styles (needs
  `05-csp-nonce.md`).

## Risks

- Users on the Cobalt build get a different YouTube UI and CSP; the nonce path
  becomes load-bearing. Do not flip the default until the matrix covers at
  least one OLED and one non-OLED model and remote-only input.
- The PS4 UA claims a hardware profile the TV is not; playback/codec decisions
  may differ even when the UI looks right.
- Keeping two UA modes doubles the device matrix permanently. If the Cobalt
  build is not clearly better, delete the mode instead of supporting both.

## Acceptance criteria

- [x] `DEFAULT_UA_MODE` is `webos`; the default `dist/appinfo.json` keeps the
      template.
- [x] `cobalt` is reachable via `--ua cobalt`, `YTX_UA=cobalt`, and the
      `*:cobalt` scripts.
- [x] `compare:chrome` defaults to the same UA as the default build.
- [x] A bare `--ua` fails loudly.
- [x] README labels Cobalt experimental and lists the tested model.

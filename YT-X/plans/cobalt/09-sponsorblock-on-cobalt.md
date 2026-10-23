# Cobalt-09 — SponsorBlock on the Cobalt user agent

Status: option 1 implemented; relay or non-page fetch not pursued
Found by: the 2026-10-23 device pass, see [results-2026-10-23.md](./results-2026-10-23.md)
Touches: `src/features/sponsorblock/sponsorblock.ts`, `README.md`, possibly a relay

## Problem

Under the Cobalt UA, YouTube serves a page with a CSP whose `connect-src` omits
`sponsor.ajay.app` and `sponsorblock.inf.re`. Every segment request fires a
`securitypolicyviolation`, so the popup, markers, skips and highlight jump never
run. A userscript cannot change a response header. The webOS UA build has no such
CSP and is unaffected.

## Options

1. **Document it as unsupported on Cobalt.** Cheapest; Cobalt trades SponsorBlock
   for YouTube's own plates. Add a README line and skip the fetch (no wasted
   requests, no console noise) when `isCobaltUa()`.
2. **Relay on an allowed host.** `connect-src` allows `*.appspot.com` and
   `*.google.com`; a small proxy there would pass. Adds an operated service and a
   privacy surface (video IDs hash prefixes pass through it).
3. **Non-page fetch path.** A webOS service or the app shell fetching on the
   userscript's behalf. Needs a device probe for whether the shell exposes one.

Recommendation: option 1 now, and revisit 2 or 3 only if Cobalt becomes the
default.

## Acceptance

- [x] Decision recorded here: option 1.
- [x] README states the Cobalt limitation.
- [ ] No CSP violations are logged on a Cobalt watch page (verify on the TV).

# Cobalt rework follow-up — individual plans

Source review: the working tree at `b610c1b` plus the uncommitted Cobalt/ad-free
rework, read against
[RF1705/youtube-webos-cobalt-adfree](https://github.com/RF1705/youtube-webos-cobalt-adfree)
at `99caa93` on 2026-10-23.

RF1705 ships a patched **Cobalt binary**; YT-X ships a **userscript** into
YouTube's own web app. The rework adopts the reference's observable behaviour
(no `app-quality-root` stripping, no DIAL entry, YouTube's own plates) and adds
a build-time Cobalt user agent. This batch covers the defects and open
verification the review found in that rework.

Two upstream fixes are the reference for the SponsorBlock items:

- `dc071f6` — `webapp/src/sponsorblock-skip-target.mjs` (terminal segments)
- `05ca3ff` — `webapp/src/sponsorblock.js` (markers on the current TV DOM)

## Order

| #   | Plan                                                    | Type                | Blocked by |
| --- | ------------------------------------------------------- | ------------------- | ---------- |
| 1   | [Highlight fetch and lifecycle](./01-highlight.md)      | bug fix             | —          |
| 2   | [Terminal segments](./02-terminal-segments.md)          | bug fix             | 1          |
| 3   | [Progress-bar markers](./03-progress-bar-markers.md)    | feature restoration | 2          |
| 4   | [User-agent default and tooling](./04-ua-default.md)    | decision + change   | —          |
| 5   | [CSP nonce lifecycle](./05-csp-nonce.md)                | hardening           | —          |
| 6   | [Cast verification and docs](./06-cast-verification.md) | investigation       | —          |
| 7   | [Regressions and hygiene](./07-hygiene.md)              | cleanup             | 1–6        |

Implementation progress and the remaining exact steps are recorded in
[08-implementation-handoff.md](./08-implementation-handoff.md).

Start with 1 and 2 (same file, real user-visible bugs), then 4 and 5
(independent, no device needed). 3 is the largest change. 6 needs a TV and two
phones and produces the documentation result.

`02-terminal-segments.md` executes and supersedes
[`rf1705-01`](../rf1705-01-sponsorblock-terminal-segments.md); do not implement
both. `rf1705-03` (IPK packaging) and `rf1705-04` (Homebrew feed) stay separate
and are not duplicated here.

## Shared conventions

- Keep the extraction in `src/features/sponsorblock/segments.ts` pure; DOM and
  player wiring stay in `sponsorblock.ts`. Follow the `loadSrc` test pattern in
  `tools/sponsorblock-segments.test.ts`.
- Prefer the upstream implementation over a re-derivation when one exists
  (`dc071f6`, `05ca3ff`). Porting is cheaper to review than inventing.
- Run `npm run lint:all` and `npm run verify` after each plan. The plans folder
  is covered by `prettier-check`, so format new Markdown.
- Device claims need a recorded probe. A one-model result is not a matrix.

## Definition of done for the batch

- [ ] The API request includes `poi`, and a highlight ahead is jumped on the
      first play, once.
- [ ] A terminal segment leaves a tail and lets `ended` fire; no restart loop
      with `Skip Once` on or off.
- [ ] Segment markers render on the current TV DOM and survive a bar re-render.
- [ ] The default build keeps the webOS UA; the Cobalt UA is opt-in and the
      Chrome reference tool defaults to the same variant.
- [ ] The nonce watcher is bounded, and every YT-X `<style>` retries the nonce.
- [ ] The cast README matches a recorded Android/iOS matrix.
- [ ] No WCAG or layout regression remains from the rework.
- [ ] `npm run lint:all` is green, including the plans.

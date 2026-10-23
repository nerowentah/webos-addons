# Cobalt-05 — CSP nonce lifecycle

Status: ready to implement
Addresses: the rework's `insert-style` watcher and `time-remaining` style
Touches: `src/styles/insert-style.ts`, `src/ui/time-remaining.ts`,
`src/core/csp-nonce.ts`, tests under `tools/`

## Problem

The rework adds two paths that stamp `<style>` elements with YouTube's CSP
nonce, but only one of them retries, and that one never stops:

1. `insert-style.ts` pushes every style into `pending` when no nonce is in the
   DOM and starts a `MutationObserver` on the whole document
   (`{ childList: true, subtree: true }`). On the webOS build there is no
   `style-src` and no `style[nonce]`/`link[nonce]`, so `flush()` always returns
   false and the observer runs for the life of the page. YouTube mutates the
   DOM constantly; each mutation runs a document-wide `querySelector`.
2. `time-remaining.ts` sets the nonce only when it creates the element
   (`:27-31`). If it is created before YouTube's nonce exists, the rule stays
   blocked under CSP and is never retried. The nonce can also differ after a
   navigation/reload, and the element is reused.

`pageNonce()` also only looks at `style[nonce], link[nonce]`. If YouTube keeps
the nonce on the bootstrap `<script>` only, styles never unblock.

## Goal

Every YT-X `<style>` gets the page nonce when one exists, retries for a bounded
time when the page has not produced one yet, and leaves no permanent observer.

## Design

### 1. Bound the wait

Add a budget to `insert-style.ts`:

```ts
const NONCE_WAIT_MS = 5000;

function watch(): void {
  if (watching) return;
  watching = true;

  const observer = new MutationObserver(() => {
    if (flush()) stop();
  });
  const timer = setTimeout(stop, NONCE_WAIT_MS);

  function stop(): void {
    observer.disconnect();
    clearTimeout(timer);
    watching = false;
    pending.length = 0;
  }

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}
```

Why 5 s: YouTube's first paint and style injection complete well inside that;
after it, the nonces are either present or the page is not nonce-gated. Do not
keep retrying forever. If the timeout fires on a CSP page, the styles are
already appended but blocked; log once in development, not per mutation.

### 2. Share one retry helper

Move the queue into `src/core/csp-nonce.ts` (or a new
`src/core/nonce-style.ts`) so both callers use it:

```ts
/** Sets the nonce now, or queues the element for the first nonce that appears. */
export function nonceStyle(el: HTMLStyleElement): void;
```

`insert-style` calls it before appending. `time-remaining` calls it whenever it
creates or re-creates its style element, and on `write()` if the element lost
its nonce. The helper owns the observer, the timeout and the queue; callers
never start their own.

Keep `pageNonce()` independent and synchronous. Extend its lookup in order:

1. `style[nonce]`, `link[nonce]`;
2. any `[nonce]` element as fallback (including `script[nonce]`), because a
   nonce is often shared by all directives;
3. `''`.

Document that a script nonce may not match `style-src`; the fallback is
best-effort and only applies when no style/link nonce exists.

### 3. Re-evaluate on re-insert

The current remove-then-append is required: a blocked inline style is not
un-blocked by setting the attribute in place. Keep it, but only for elements
that were actually queued (not every style on every flush). After a nonce is
found, future styles get it directly and never touch the queue.

### 4. Do not watch before there is work

Start the observer lazily on the first queued style (already the case), and
disconnect as soon as the queue empties on success or timeout. Never observe
`document`; `document.documentElement` is enough and slightly cheaper.

## Tests

The test harness has no DOM, so keep the policy pure and testable:

- `nonceFrom(elements: { nonce?: string; attr?: string }[])` or an equivalent
  pure helper: prefers style/link, falls back to the first element with a
  nonce, returns `''` for none. Test with `loadSrc`.
- If the queue is extracted, expose `NONCE_WAIT_MS` and assert it is finite and
  positive; do not sleep in tests.
- `app-ua`-style unit tests are not a substitute for a CSP page. The real check
  is on the Cobalt build.

## Verification

- `npm test`, `npm run lint`, `npm run type-check`, `npm run build`.
- On the Cobalt build:
  - first start: YT-X panel, badge, popup and time-remaining all styled;
  - toggle time remaining on before the first nonce exists (cold start on a
    watch URL) and confirm the label appears without a reload;
  - DevTools Performance/Memory: no long-lived `MutationObserver` on
    `document` after 5 s;
  - navigate between videos and confirm no duplicate style elements.
- On the webOS build: no `style[nonce]`; after 5 s the observer is gone and the
  page is unchanged.

## Risks

- Disconnecting after 5 s means a page that produces its nonce late stays
  unstyled. That is safer than an unbounded observer; record the timeout as a
  known limitation and revisit if a device shows a later nonce.
- A read-only `nonce` property may throw in old engines; keep the
  `getAttribute` fallback and a `try` around the whole lookup.
- Re-appending styles moves them to the end of `<head>`; that is already true
  of the rework and is needed for CSP, but it can change cascade order. Keep
  the queue order stable.

## Acceptance criteria

- [ ] The `insert-style` observer disconnects on success and after
      `NONCE_WAIT_MS`.
- [ ] `time-remaining` retries the nonce and is styled on the Cobalt build
      even when created early.
- [ ] `pageNonce()` has a documented style/link-first fallback.
- [ ] No permanent document-wide observer remains.
- [ ] Pure nonce-selection tests pass.

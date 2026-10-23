// The page's CSP can carry `style-src 'nonce-...'` (the Cobalt build does; the
// LG build has no style-src), which blocks any <style> we inject without it.

/** How long to wait for YouTube to put a nonce in the DOM before giving up. */
export const NONCE_WAIT_MS = 5000;

export interface NonceCandidate {
  tagName: string;
  nonce?: string;
  attr?: string;
}

/** A nonce value from either the IDL property or the (possibly hidden) attribute. */
function candidateNonce(candidate: NonceCandidate): string {
  return candidate.nonce || candidate.attr || '';
}

/**
 * Picks a nonce from the page. A style/link nonce is the only one that is
 * guaranteed to satisfy `style-src`; the any-element fallback is best-effort
 * because a script nonce may be under a different directive.
 */
export function selectNonce(
  candidates: readonly NonceCandidate[]
): string {
  for (const candidate of candidates) {
    if (candidate.tagName !== 'style' && candidate.tagName !== 'link') continue;
    const nonce = candidateNonce(candidate);
    if (nonce) return nonce;
  }
  for (const candidate of candidates) {
    const nonce = candidateNonce(candidate);
    if (nonce) return nonce;
  }
  return '';
}

/** The page nonce, style/link first; '' when none is in the DOM yet. */
export function pageNonce(): string {
  try {
    const candidates: NonceCandidate[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('[nonce]')) {
      candidates.push({
        tagName: el.tagName.toLowerCase(),
        // Browsers hide the attribute value after parsing; the IDL property
        // keeps it on style/link/script elements.
        nonce: (el as HTMLElement & { nonce?: string }).nonce,
        attr: el.getAttribute('nonce') || ''
      });
    }
    return selectNonce(candidates);
  } catch {
    return '';
  }
}

const pending: HTMLStyleElement[] = [];
let observer: MutationObserver | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Re-stamps and re-inserts a queued style so the CSP is evaluated again. */
function stamp(el: HTMLStyleElement, nonce: string): void {
  el.setAttribute('nonce', nonce);
  if (!el.isConnected) return;
  el.remove();
  (document.head || document.documentElement).appendChild(el);
}

function flush(): boolean {
  const nonce = pageNonce();
  if (!nonce) return false;
  for (const el of pending.splice(0)) stamp(el, nonce);
  return true;
}

function stop(): void {
  observer?.disconnect();
  observer = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending.length = 0;
}

function watch(): void {
  if (observer) return;
  const root = document.documentElement;
  if (!root) return;

  observer = new MutationObserver(() => {
    if (flush()) stop();
  });
  observer.observe(root, { childList: true, subtree: true });
  timer = setTimeout(stop, NONCE_WAIT_MS);
}

/**
 * Sets the nonce now, or queues the element for the first nonce that appears.
 * Call before appending; the helper owns the observer, timeout and queue.
 */
export function nonceStyle(el: HTMLStyleElement): void {
  if (el.nonce) return;
  const nonce = pageNonce();
  if (nonce) {
    el.setAttribute('nonce', nonce);
    return;
  }
  if (!pending.includes(el)) pending.push(el);
  watch();
}

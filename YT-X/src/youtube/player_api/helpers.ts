import { raceWithSignal } from '../../core/async';
import { waitForChildAdd } from '../../core/utils';

import type { YTPlayer } from './yt-api';

const PLAYER_WAIT_MS = 30_000;

/** document.querySelector, but waits for the element to be added if absent. */
async function requireElement<E extends typeof Element>(
  cssSelectors: string,
  expected: E,
  signal?: AbortSignal
): Promise<InstanceType<E>> {
  const alreadyPresent = document.querySelector(cssSelectors);
  if (alreadyPresent) {
    if (!(alreadyPresent instanceof expected)) throw new Error();

    // Cast required due to narrowing limitations: https://github.com/microsoft/TypeScript/issues/55241
    return alreadyPresent as InstanceType<E>;
  }

  const result = await waitForChildAdd(
    document.documentElement,
    (node): node is Element =>
      node instanceof Element && node.matches(cssSelectors),
    true,
    signal
  );

  if (!(result instanceof expected)) throw new Error();
  return result as InstanceType<E>;
}

let player: YTPlayer | null = null;
let pending: Promise<YTPlayer> | null = null;

/**
 * The page's player, waiting for it to mount; rejects after PLAYER_WAIT_MS. Concurrent callers share one wait; a failed wait can be retried. The first caller owns the wait: its `signal` aborting cancels it (and disconnects the observer). Later callers' signals cancel only their own await.
 */
export function getPlayer(signal?: AbortSignal): Promise<YTPlayer> {
  if (player) return Promise.resolve(player);
  if (pending) return signal ? raceWithSignal(pending, signal) : pending;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('Timed out waiting for the player')),
    PLAYER_WAIT_MS
  );
  const onOuterAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onOuterAbort();
  else signal?.addEventListener('abort', onOuterAbort, { once: true });

  const attempt = requireElement(
    '.html5-video-player',
    HTMLElement,
    controller.signal
  )
    .then((el) => (player = el as YTPlayer))
    .finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
      pending = null;
    });
  pending = attempt;
  return attempt;
}

/**
 * Settle with `promise`, or reject with `signal.reason` as soon as `signal` aborts. Aborting drops only this caller's interest: `promise` keeps running for anyone else holding it.
 */
export function raceWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (reason: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(reason);
      }
    );
  });
}

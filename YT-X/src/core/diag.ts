// Failures swallowed on purpose (a response filter must never break YouTube's own
// JSON.parse) are kept here instead of being lost: `window.__ytxFails`, for the
// debug port. Separate from the preload's `__ytxErrs`, which the page's own
// script errors can fill.
const MAX_FAILS = 40;

/** Remembers a swallowed failure with where it happened; the first `MAX_FAILS` only. */
export function recordFailure(where: string, error: unknown): void {
  const holder = globalThis as typeof globalThis & { __ytxFails?: string[] };
  const log = (holder.__ytxFails ??= []);
  if (log.length >= MAX_FAILS) return;
  const text =
    error instanceof Error
      ? `${error.message} ${(error.stack ?? '').slice(0, 200)}`
      : String(error);
  log.push(`${where}: ${text}`.slice(0, 300));
}

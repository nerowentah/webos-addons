// One deadline covers the body as well as the headers: clearing the timer once
// headers arrived left res.json() with no deadline, so a mid-body stall hung forever.

/** `data` is the parsed body for a 2xx answer, else `null`; callers validate it. */
export interface FetchJsonResult {
  ok: boolean;
  status: number;
  data: unknown;
}

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Resolves with `{ ok, status, data }` (parsed body for 2xx, else `data: null`);
 * rejects with Error('timeout') past `timeoutMs` or an AbortError on `opts.signal`.
 *
 * @param opts.signal caller's signal, to cancel early
 */
export function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number,
  opts?: { signal?: AbortSignal }
): Promise<FetchJsonResult> {
  const outer = opts?.signal ?? null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let onOuterAbort: (() => void) | null = null;

  const cutoff = new Promise<never>((_, reject) => {
    // Reject before aborting: the request's own AbortError would otherwise win the race.
    timer = setTimeout(() => {
      timer = null;
      reject(new Error('timeout'));
      controller.abort();
    }, timeoutMs);

    if (outer) {
      const abortNow = () => {
        reject(abortError());
        controller.abort();
      };
      onOuterAbort = abortNow;
      if (outer.aborted) abortNow();
      else outer.addEventListener('abort', abortNow);
    }
  });

  const request: Promise<FetchJsonResult> = fetch(url, {
    signal: controller.signal
  }).then((response) =>
    response.ok
      ? response.json().then((data: unknown) => ({
          ok: true,
          status: response.status,
          data
        }))
      : { ok: false, status: response.status, data: null }
  );
  // The losing side of the race must not surface as an unhandled rejection.
  request.catch(() => {});

  const cleanup = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (outer && onOuterAbort) outer.removeEventListener('abort', onOuterAbort);
  };

  return Promise.race([request, cutoff]).then(
    (result) => {
      cleanup();
      return result;
    },
    (error: unknown) => {
      cleanup();
      throw error;
    }
  );
}

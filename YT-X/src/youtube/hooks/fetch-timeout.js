// One deadline covers the body as well as the headers: clearing the timer once
// headers arrived left res.json() with no deadline, so a mid-body stall hung forever.

function abortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Resolves with `{ ok, status, data }` (parsed body for 2xx, else `data: null`);
 * rejects with Error('timeout') past `timeoutMs` or an AbortError on `opts.signal`.
 *
 * @param {string} url
 * @param {number} timeoutMs
 * @param {{ signal?: AbortSignal }} [opts] caller's signal, to cancel early
 */
export function fetchJsonWithTimeout(url, timeoutMs, opts) {
  const outer = opts && opts.signal ? opts.signal : null;
  const controller = new AbortController();
  let timer = null;
  let onOuterAbort = null;

  const cutoff = new Promise((_, reject) => {
    // Reject before aborting: the request's own AbortError would otherwise win the race.
    timer = setTimeout(() => {
      timer = null;
      reject(new Error('timeout'));
      controller.abort();
    }, timeoutMs);

    if (outer) {
      onOuterAbort = () => {
        reject(abortError());
        controller.abort();
      };
      if (outer.aborted) onOuterAbort();
      else outer.addEventListener('abort', onOuterAbort);
    }
  });

  const request = fetch(url, { signal: controller.signal }).then((response) =>
    response.ok
      ? response
          .json()
          .then((data) => ({ ok: true, status: response.status, data }))
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
    (error) => {
      cleanup();
      throw error;
    }
  );
}

import { CustomEventTarget, TypedCustomEvent } from '../custom-event-target';

interface StringConvertible {
  toString(): string;
}

type FetchTarget = Request | StringConvertible;

let registry: FetchRegistry | null = null;

interface RequestInfo {
  url: URL;
  resource: FetchTarget;
  init?: RequestInit | undefined;
}

interface ResponseInfo extends RequestInfo {
  response: Response;
}

interface EventMap {
  request: CustomEvent<RequestInfo>;
  // Listeners may replace evt.detail.response to substitute the response the
  // caller receives, or preventDefault() to cancel the fetch entirely.
  response: CustomEvent<ResponseInfo>;
}

export class FetchRegistry extends CustomEventTarget<EventMap> {
  #originalFetch: typeof fetch;
  #fetchCount = 0;

  private constructor() {
    super();

    this.#originalFetch = window.fetch.bind(window);
    window.fetch = this.#customFetch;
  }

  static async #dumpBody(resource: Request | Response) {
    if (
      !resource?.constructor?.name ||
      !['Request', 'Response'].includes(resource.constructor.name)
    )
      return null;

    try {
      const blob = await resource.clone().blob();
      if (!blob.size) return null;

      const fr = new FileReader();

      const res = new Promise((resolve, reject) => {
        fr.addEventListener('load', () => {
          resolve(fr.result);
        });
        fr.addEventListener('error', () => {
          reject(new Error('FileReader error while reading blob'));
        });
        fr.addEventListener('abort', () => {
          reject(new Error('FileReader aborted while reading blob'));
        });
      });

      fr.readAsDataURL(blob);

      return await res;
    } catch (err) {
      if (window.__ytaf_debug__) {
        console.warn('[FetchRegistry] Failed to dump body:', err);
      }
      return null;
    }
  }

  #customFetch = async (resource: FetchTarget, init?: RequestInit) => {
    if (window.__ytaf_debug__) {
      console.debug(`Request ${this.#fetchCount}:`, resource);
      if (init) console.debug(`Options  ${this.#fetchCount}:`, init);

      if (resource instanceof Request) {
        const reqBody = await FetchRegistry.#dumpBody(resource);
        if (reqBody)
          console.debug(`Request Body ${this.#fetchCount}:`, reqBody);
      }
    }

    const url = new URL(
      resource instanceof Request ? resource.url : resource.toString(),
      document.location.href
    );
    const reqAllowed = this.dispatchEvent(
      new TypedCustomEvent('request', {
        detail: { url, resource, init },
        cancelable: true
      })
    );
    if (!reqAllowed) {
      console.info(
        `Fetch request ${this.#fetchCount} was cancelled by listener.`,
        resource,
        init
      );
      throw new TypeError('Failed to fetch');
    }

    // @ts-expect-error FetchTarget (StringConvertible) is wider than fetch's input signature.
    const res = await this.#originalFetch(resource, init);

    if (window.__ytaf_debug__) {
      console.debug(`Response ${this.#fetchCount}:`, res);

      const resBody = await FetchRegistry.#dumpBody(res);
      if (resBody) console.debug(`Response Body ${this.#fetchCount}:`, resBody);
    }

    const resEvent = new TypedCustomEvent('response', {
      detail: { url, resource, init, response: res },
      cancelable: true
    });
    const resAllowed = this.dispatchEvent(resEvent);

    if (!resAllowed) {
      console.info(
        `Fetch response ${this.#fetchCount} was cancelled by listener.`,
        res
      );
      throw new TypeError('Failed to fetch');
    }

    this.#fetchCount++;

    return resEvent.detail.response;
  };

  static getInstance() {
    if (!registry) {
      registry = new FetchRegistry();
    }
    return registry;
  }
}

registry = FetchRegistry.getInstance();

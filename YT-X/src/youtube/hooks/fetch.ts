import {
  CustomEventTarget,
  TypedCustomEvent
} from '../../core/custom-event-target';

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
  // Listeners may replace evt.detail.response, or preventDefault() to cancel the fetch.
  response: CustomEvent<ResponseInfo>;
}

export class FetchRegistry extends CustomEventTarget<EventMap> {
  #originalFetch: typeof fetch;

  private constructor() {
    super();

    this.#originalFetch = window.fetch.bind(window);
    window.fetch = this.#customFetch;
  }

  #customFetch = async (resource: FetchTarget, init?: RequestInit) => {
    const url = new URL(
      resource instanceof Request ? resource.url : resource.toString(),
      document.location.href
    );

    // Media segments dominate fetch traffic and no listener acts on them; skip the events so buffer refills pay nothing extra.
    if (
      url.hostname.endsWith('.googlevideo.com') ||
      url.pathname === '/videoplayback'
    ) {
      // @ts-expect-error FetchTarget (StringConvertible) is wider than fetch's input signature.
      return this.#originalFetch(resource, init);
    }

    const reqAllowed = this.dispatchEvent(
      new TypedCustomEvent('request', {
        detail: { url, resource, init },
        cancelable: true
      })
    );
    if (!reqAllowed) {
      throw new TypeError('Failed to fetch');
    }

    // @ts-expect-error FetchTarget (StringConvertible) is wider than fetch's input signature.
    const res = await this.#originalFetch(resource, init);

    const resEvent = new TypedCustomEvent('response', {
      detail: { url, resource, init, response: res },
      cancelable: true
    });
    const resAllowed = this.dispatchEvent(resEvent);

    if (!resAllowed) {
      throw new TypeError('Failed to fetch');
    }

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

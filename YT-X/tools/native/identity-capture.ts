// Pieces of the identity capture tool that need no device: the in-page recorder
// source and the redaction every recorded request goes through. Nothing that
// looks like a credential may reach the output, so redaction is an allowlist
// for values and a pattern block for names.

export interface RawRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | null;
}

export interface RedactedRequest {
  method: string;
  host: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

const REDACTED = '<redacted>';

/** Header values that are safe to keep. Every other header keeps its name only. */
const HEADER_VALUE_ALLOWLIST = new Set([
  'content-type',
  'x-youtube-client-name',
  'x-youtube-client-version',
  'x-youtube-utc-offset',
  'accept',
  'accept-language'
]);

/** Query and body fields that describe the device, not the user. */
const IDENTITY_FIELDS = new Set([
  'devicemake',
  'devicemodel',
  'platform',
  'osname',
  'osversion',
  'clientname',
  'clientversion',
  'useragent',
  'chipset',
  'firmwareversion',
  'browsername',
  'browserversion',
  'platformdetail',
  'deviceyear',
  'jsenginestring',
  'systemintegrator',
  'releasevehicle',
  'appquality',
  'cobaltstarboardversion',
  'watchpageversion',
  'clientformfactor',
  'hl',
  'gl',
  'ns',
  'el',
  'c',
  'cver',
  'cplatform',
  'cos',
  'cosver',
  'cmodel',
  'cbr',
  'cbrver',
  'device',
  'device_model',
  'device_name',
  'model',
  'model_name',
  'scope',
  'client_name'
]);

const SECRET_NAME =
  /token|secret|code|auth|cookie|visitor|key|sig|password|gaia|session|nonce|credential|sapisid|cpn|sid$/i;

const MAX_STRING = 80;

function redactValue(name: string, value: unknown): unknown {
  const lower = name.toLowerCase();
  if (SECRET_NAME.test(lower) && !IDENTITY_FIELDS.has(lower)) return REDACTED;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number')
    return IDENTITY_FIELDS.has(lower) ? value : '<number>';
  if (typeof value === 'string') {
    if (IDENTITY_FIELDS.has(lower) && value.length <= 400) return value;
    return value.length > MAX_STRING ? `<${value.length} chars>` : REDACTED;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => redactValue(name, item));
  }
  if (typeof value === 'object')
    return redactObject(value as Record<string, unknown>);
  return REDACTED;
}

function redactObject(
  object: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    const lower = key.toLowerCase();
    // Containers keep their shape so the field layout is still visible.
    if (value !== null && typeof value === 'object') {
      out[key] =
        SECRET_NAME.test(lower) && !IDENTITY_FIELDS.has(lower)
          ? REDACTED
          : redactValue(key, value);
    } else {
      out[key] = redactValue(key, value);
    }
  }
  return out;
}

function redactQuery(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of params) {
    const lower = name.toLowerCase();
    out[name] =
      IDENTITY_FIELDS.has(lower) &&
      !SECRET_NAME.test(lower) &&
      value.length <= 120
        ? value
        : REDACTED;
  }
  return out;
}

function redactBody(body: string | null | undefined): unknown {
  if (body === null || body === undefined || body === '') return null;
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return typeof parsed === 'object' && parsed !== null
        ? redactValue('body', parsed)
        : REDACTED;
    } catch {
      return `<${body.length} chars, unparsed>`;
    }
  }
  if (/^[^=&\s]+=[^&]*(?:&[^=&\s]+=[^&]*)*$/.test(trimmed)) {
    return redactQuery(new URLSearchParams(trimmed));
  }
  return `<${body.length} chars>`;
}

export function redactRequest(request: RawRequest): RedactedRequest {
  let host = '';
  let path: string;
  let query: Record<string, string> = {};
  try {
    const url = new URL(request.url, 'https://www.youtube.com');
    host = url.host;
    path = url.pathname;
    query = redactQuery(url.searchParams);
  } catch {
    path = '<unparsed url>';
  }

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    headers[name] = HEADER_VALUE_ALLOWLIST.has(name.toLowerCase())
      ? value
      : REDACTED;
  }

  return {
    method: request.method,
    host,
    path,
    query,
    headers,
    body: redactBody(request.body)
  };
}

/** Which requests are worth recording: sign-in, pairing and account traffic. */
const INTERESTING_URL =
  '/o/oauth2|accounts\\.google|get_pairing|/device|youtubei/v1/(account|att|get_pairing|browse\\?.*sign)|/signin|identity|/pair';

/** Page script that keeps matching requests in `window.__ytxCapture`, headers included. */
export function recorderSource(pattern: string = INTERESTING_URL): string {
  return `(() => {
  if (window.__ytxCaptureInstalled) return;
  window.__ytxCaptureInstalled = true;
  window.__ytxCapture = [];
  const wanted = new RegExp(${JSON.stringify(pattern)}, 'i');
  const X = XMLHttpRequest.prototype;
  const open = X.open, send = X.send, setHeader = X.setRequestHeader;
  X.open = function (method, url) {
    this.__cap = { method: String(method), url: String(url), headers: {} };
    return open.apply(this, arguments);
  };
  X.setRequestHeader = function (name, value) {
    if (this.__cap) this.__cap.headers[name] = String(value);
    return setHeader.apply(this, arguments);
  };
  X.send = function (body) {
    const cap = this.__cap;
    if (cap && wanted.test(cap.url)) {
      cap.body = typeof body === 'string' ? body : body == null ? null : '[non-text body]';
      window.__ytxCapture.push(cap);
    }
    return send.apply(this, arguments);
  };
  if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (wanted.test(url)) {
          const headers = {};
          const source = (init && init.headers) || {};
          if (typeof source.forEach === 'function') source.forEach((v, k) => { headers[k] = String(v); });
          else for (const k in source) headers[k] = String(source[k]);
          window.__ytxCapture.push({
            method: (init && init.method) || 'GET',
            url: String(url),
            headers,
            body: init && typeof init.body === 'string' ? init.body : null
          });
        }
      } catch (e) {}
      return nativeFetch.apply(this, arguments);
    };
  }
})()`;
}

/** Page expression that returns the identity-bearing parts of the page as JSON. */
export const IDENTITY_DUMP = `(() => {
  const client = (((window.ytcfg && (window.ytcfg.data_ || {})).INNERTUBE_CONTEXT) || {}).client || {};
  return JSON.stringify({
    userAgent: navigator.userAgent,
    client
  });
})()`;

/** Redacts a plain object such as the InnerTube client context. */
export function redactIdentity(
  object: Record<string, unknown>
): Record<string, unknown> {
  return redactObject(object);
}

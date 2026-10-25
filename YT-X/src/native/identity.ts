// Native Cobalt reports the short model ("QNED86") while the official webOS app
// reports the full SKU ("65QNED86ASA.ATSFLJD"); Google files the sign-in under
// "Television" for the latter. Only the device-code request's `device_model`
// is rewritten, and only when the setup tool injected a full model.

/* eslint-disable @typescript-eslint/unbound-method -- the originals are always invoked with .call/.apply */
import { claimHook } from '../core/hook-once';
import { rewriteDeviceCodeBody, rewriteLoungeUrl } from './device-model';

interface XhrWithUrl extends XMLHttpRequest {
  __ytxUrl?: string;
}

/** Keeps the deviceInfo of each lounge request the hook saw, to check from the debug port. */
function logLounge(via: string, url: string): void {
  const match = /[?&]deviceInfo=([^&#]*)/.exec(url);
  if (!match) return;
  const holder = globalThis as { __ytxLounge?: string[] };
  const log = (holder.__ytxLounge ??= []);
  log.push(`${via} ${decodeURIComponent(match[1] ?? '')}`);
  if (log.length > 6) log.shift();
}

function installDeviceModelHook(fullModel: string): void {
  if (!fullModel || !claimHook('device-model')) return;

  const proto = XMLHttpRequest.prototype;
  const nativeOpen = proto.open;
  const nativeSend = proto.send;
  proto.open = function open(
    this: XhrWithUrl,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    this.__ytxUrl = rewriteLoungeUrl(String(url), fullModel);
    logLounge('xhr', this.__ytxUrl);
    return (nativeOpen as (...args: unknown[]) => void).call(
      this,
      method,
      this.__ytxUrl,
      ...rest
    );
  } as typeof proto.open;
  proto.send = function send(this: XhrWithUrl, body?: never) {
    const next = rewriteDeviceCodeBody(this.__ytxUrl ?? '', body, fullModel);
    return nativeSend.call(this, next as never);
  };

  if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch;
    window.fetch = function fetchPatched(input, init) {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (init && typeof init.body === 'string') {
        init = {
          ...init,
          body: rewriteDeviceCodeBody(url, init.body, fullModel) as string
        };
      }
      let target: RequestInfo | URL = input;
      if (typeof input === 'string') {
        target = rewriteLoungeUrl(input, fullModel);
      } else if (typeof (input as Request).url === 'string') {
        const rewritten = rewriteLoungeUrl((input as Request).url, fullModel);
        if (rewritten !== (input as Request).url) {
          target = new Request(rewritten, input as Request);
        }
      }
      logLounge(
        'fetch',
        typeof target === 'string' ? target : (target as Request).url
      );
      return nativeFetch.call(this, target, init);
    };
  }
}

const injected = (globalThis as { __ytxFullModel?: unknown }).__ytxFullModel;
if (typeof injected === 'string') installDeviceModelHook(injected);

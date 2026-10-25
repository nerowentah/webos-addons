// Pure helpers for the sign-in device model rewrite; no DOM, no imports, so
// the tests can load them directly.

const DEVICE_CODE_URL = '/o/oauth2/device/code';

/** Keeps the "ytlr:<make>:" prefix and swaps the model part. */
export function withFullModel(deviceModel: string, fullModel: string): string {
  const parts = deviceModel.split(':');
  if (parts.length < 3) return deviceModel;
  return `${parts.slice(0, 2).join(':')}:${fullModel.toLowerCase()}`;
}

/** Returns the rewritten body, or the input when it is not a device-code body. */
export function rewriteDeviceCodeBody(
  url: string,
  body: unknown,
  fullModel: string
): unknown {
  if (!fullModel || typeof body !== 'string') return body;
  if (!url.includes(DEVICE_CODE_URL)) return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed['device_model'] !== 'string') return body;
    parsed['device_model'] = withFullModel(parsed['device_model'], fullModel);
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

const LOUNGE_URL = '/api/lounge/bc/';
/** The phone prints brand then model, so the app's prefix goes in the brand. */
const LOUNGE_BRAND = '[YT-X]';

/** "65QNED86ASA.ATSFLJD" -> "webOS TV QNED86ASA", the name the TV's Cast receiver uses. */
export function castModelName(fullModel: string): string {
  const base = fullModel.split('.')[0] ?? fullModel;
  return `webOS TV ${base.replace(/^\d+/, '')}`;
}

/**
 * The lounge bind/test URLs carry a JSON `deviceInfo` whose brand and model
 * the phone shows as the TV's name. Only `model` is replaced.
 */
export function rewriteLoungeUrl(url: string, fullModel: string): string {
  if (!fullModel || !url.includes(LOUNGE_URL)) return url;
  // Plain string work: Cobalt's URL has no searchParams.
  const match = /([?&]deviceInfo=)([^&#]*)/.exec(url);
  if (!match) return url;
  try {
    const info = JSON.parse(
      decodeURIComponent((match[2] ?? '').replace(/\+/g, ' '))
    ) as Record<string, unknown>;
    if (typeof info['model'] !== 'string') return url;
    info['brand'] = LOUNGE_BRAND;
    info['model'] = castModelName(fullModel);
    return url.replace(
      match[0],
      `${match[1] ?? ''}${encodeURIComponent(JSON.stringify(info))}`
    );
  } catch {
    return url;
  }
}

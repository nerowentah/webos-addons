function isPrimitive(
  value: unknown
): value is string | number | boolean | null | undefined | symbol | bigint {
  return Object(value) !== value;
}

const originalStringify: JSON['stringify'] = JSON.stringify;

type FunctionReplacer = (this: unknown, key: string, value: unknown) => unknown;
type WhitelistReplacer = (string | number)[] | null;

function stringify(
  value: unknown,
  replacer?: FunctionReplacer | WhitelistReplacer,
  space?: string | number
): string {
  let processedValue = value;
  if (!isPrimitive(processedValue)) {
    try {
      processedValue = structuredClone(processedValue);

      const processed = processedValue as Record<string, unknown>;
      const ctx = (processed?.playbackContext as Record<string, unknown>)
        ?.contentPlaybackContext as unknown;
      if (!isPrimitive(ctx)) {
        (ctx as Record<string, unknown>).isInlinePlaybackNoAd = true;
        console.info('[JSON.stringify] Set isInlinePlaybackNoAd');
      }
    } catch (err) {
      console.warn('[JSON.stringify] structuredClone failed:', err);
      processedValue = value;
    }
  }

  if (typeof replacer === 'function') {
    return originalStringify(processedValue, replacer, space);
  }
  return originalStringify(processedValue, replacer, space);
}

JSON.stringify = stringify;

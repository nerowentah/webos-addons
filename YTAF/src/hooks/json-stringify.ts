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
  if (!isPrimitive(value)) {
    value = structuredClone(value);

    // @ts-expect-error TS doesn't allow optional chaining on `unknown`. See: https://github.com/microsoft/TypeScript/issues/37700
    const ctx = value?.playbackContext?.contentPlaybackContext as unknown;
    if (!isPrimitive(ctx)) {
      (ctx as Record<string, unknown>).isInlinePlaybackNoAd = true;
      console.info('[JSON.stringify] Set isInlinePlaybackNoAd');
    }
  }

  if (typeof replacer === 'function') {
    return originalStringify(value, replacer, space);
  }
  return originalStringify(value, replacer, space);
}

JSON.stringify = stringify;

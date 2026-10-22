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
  if (!isPrimitive(value)) {
    // Copy only the path being edited: this runs on every stringify, and a full structuredClone of a large player/log payload stalls the main thread.
    const playbackContext = (value as Record<string, unknown>)[
      'playbackContext'
    ];
    if (!isPrimitive(playbackContext)) {
      const pc = playbackContext as Record<string, unknown>;
      const ctx = pc['contentPlaybackContext'];
      if (!isPrimitive(ctx)) {
        processedValue = {
          ...(value as Record<string, unknown>),
          playbackContext: {
            ...pc,
            contentPlaybackContext: {
              ...(ctx as Record<string, unknown>),
              isInlinePlaybackNoAd: true
            }
          }
        };
      }
    }
  }

  return originalStringify(processedValue, replacer as never, space);
}

JSON.stringify = stringify;

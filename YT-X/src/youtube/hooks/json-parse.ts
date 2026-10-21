type ParseProcessor = (parsed: object, text: unknown) => void;

const processors: ParseProcessor[] = [];

const originalParse = JSON.parse;

/**
 * One JSON.parse wrapper shared by the response filters: the payload is parsed once and each processor mutates it in place, in registration order. Processors run only for object results and read their own config flag.
 */
export function registerParseProcessor(processor: ParseProcessor) {
  processors.push(processor);
}

JSON.parse = function (
  this: unknown,
  text: string,
  reviver?: Parameters<typeof JSON.parse>[1]
) {
  const parsed = originalParse.call(this, text, reviver) as unknown;
  if (parsed !== null && typeof parsed === 'object') {
    for (const processor of processors) {
      processor(parsed, text);
    }
  }
  return parsed;
};

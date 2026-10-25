import { recordFailure } from '../../core/diag';
import { claimHook } from '../../core/hook-once';

type ParseProcessor = (parsed: object, text: unknown) => void;

// Shared across bundles on the page, so processors registered by a later bundle still run in the wrapper an earlier one installed.
const hub = globalThis as typeof globalThis & {
  __ytxParseProcessors?: ParseProcessor[];
};
const processors: ParseProcessor[] = (hub.__ytxParseProcessors ??= []);

const originalParse = JSON.parse;

/**
 * One JSON.parse wrapper shared by the response filters: the payload is parsed once and each processor mutates it in place, in registration order. Processors run only for object results and read their own config flag.
 */
export function registerParseProcessor(processor: ParseProcessor) {
  processors.push(processor);
}

if (claimHook('json-parse')) {
  JSON.parse = function (
    this: unknown,
    text: string,
    reviver?: Parameters<typeof JSON.parse>[1]
  ) {
    const parsed = originalParse.call(this, text, reviver) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      // One failing filter must cost only itself: a throw here would reach YouTube's own parse and leave its UI on skeletons.
      for (const processor of processors) {
        try {
          processor(parsed, text);
        } catch (error) {
          recordFailure('parse-processor', error);
        }
      }
    }
    return parsed;
  };
}

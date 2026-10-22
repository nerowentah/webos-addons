// Guards for walking YouTube's untyped JSON payloads: every value is `unknown` until checked.

export type JsonObject = Record<string, unknown>;

/** A plain (non-array) object. */
export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An array of unknown elements (`Array.isArray` alone narrows to `any[]`). */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** An object or an array: anything a payload walk may descend into. */
export function isContainer(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** Follows `parts` through nested objects; `undefined` as soon as a step is not an object. */
export function getByPath(obj: unknown, parts: readonly string[]): unknown {
  let current = obj;
  for (const part of parts) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

/** The text of a `{ simpleText }` / `{ runs: [{ text }] }` node, or '' when it has none. */
export function readText(text: unknown): string {
  if (!isRecord(text)) return '';
  const simple = text['simpleText'];
  if (typeof simple === 'string') return simple;
  const runs = text['runs'];
  if (!isArray(runs)) return '';
  return runs
    .map((run) => {
      const part = isRecord(run) ? run['text'] : undefined;
      return typeof part === 'string' ? part : '';
    })
    .join('');
}

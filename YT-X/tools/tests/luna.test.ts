// Unit tests for the Luna helper (src/platform/luna.ts) and the calls built on it. Run with
// `npm test` (node --test). The module path is built at runtime so this file does not
// statically import from src/.

import test from 'node:test';
import assert from 'node:assert/strict';

interface LunaModule {
  hasPalmBridge(): boolean;
  lunaCall(
    uri: string,
    params: Record<string, unknown>,
    onResponse?: (res: Record<string, unknown> | null) => void
  ): unknown;
}

const href = new URL('../../src/platform/luna.ts', import.meta.url).href;
const load = async () => (await import(href)) as LunaModule;

const globals = globalThis as { window?: unknown };

/** A bridge that records its calls and answers with `reply`, when given. */
function stubBridge(calls: Array<[string, string]>, reply?: string) {
  return class {
    onservicecallback: ((message: string) => void) | null = null;
    call(uri: string, payload: string): void {
      calls.push([uri, payload]);
      if (reply !== undefined) this.onservicecallback?.(reply);
    }
  };
}

test('lunaCall returns null and hasPalmBridge is false without a bridge', async () => {
  globals.window = {};
  const { lunaCall, hasPalmBridge } = await load();
  assert.equal(hasPalmBridge(), false);
  assert.equal(lunaCall('luna://x/y', {}), null);
});

test('lunaCall sends the URI and JSON payload', async () => {
  const calls: Array<[string, string]> = [];
  globals.window = { PalmServiceBridge: stubBridge(calls) };
  const { lunaCall, hasPalmBridge } = await load();
  assert.equal(hasPalmBridge(), true);
  assert.notEqual(lunaCall('luna://svc/close', { id: 'app' }), null);
  assert.deepEqual(calls, [['luna://svc/close', '{"id":"app"}']]);
});

test('lunaCall parses the answer and tolerates non-JSON', async () => {
  const seen: unknown[] = [];
  globals.window = {
    PalmServiceBridge: stubBridge([], '{"returnValue":true}')
  };
  const { lunaCall } = await load();
  lunaCall('luna://a/b', {}, (res) => seen.push(res));
  globals.window = { PalmServiceBridge: stubBridge([], 'not json') };
  lunaCall('luna://a/b', {}, (res) => seen.push(res));
  assert.deepEqual(seen, [{ returnValue: true }, null]);
});

test('lunaCall returns null when the bridge throws', async () => {
  globals.window = {
    PalmServiceBridge: class {
      onservicecallback = null;
      call(): void {
        throw new Error('refused');
      }
    }
  };
  const { lunaCall } = await load();
  assert.equal(lunaCall('luna://a/b', {}), null);
});

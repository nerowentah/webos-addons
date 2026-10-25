// Unit tests for raceWithSignal (src/core/async.ts). Run with `npm test`
// (node --test), which strips the TypeScript types natively. The module path is
// built at runtime so this file does not statically import from src/.

import test from 'node:test';
import assert from 'node:assert/strict';

/** The parts of src/core/async.ts these tests use. */
interface AsyncModule {
  raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T>;
}

const href = new URL('../../src/core/async.ts', import.meta.url).href;

const load = async () => (await import(href)) as AsyncModule;

test('raceWithSignal forwards a resolved value', async () => {
  const { raceWithSignal } = await load();
  const controller = new AbortController();
  assert.equal(await raceWithSignal(Promise.resolve(7), controller.signal), 7);
});

test('raceWithSignal forwards a rejection', async () => {
  const { raceWithSignal } = await load();
  const controller = new AbortController();
  const boom = new Error('boom');
  await assert.rejects(
    raceWithSignal(Promise.reject(boom), controller.signal),
    boom
  );
});

test('abort rejects with the reason; later settlement is harmless', async () => {
  const { raceWithSignal } = await load();
  const controller = new AbortController();
  let settle!: (value: number) => void;
  const shared = new Promise<number>((resolve) => {
    settle = resolve;
  });
  const raced = raceWithSignal(shared, controller.signal);
  const reason = new Error('cancelled');
  controller.abort(reason);
  await assert.rejects(raced, reason);

  settle(1);
  assert.equal(await shared, 1);
});

test('an already-aborted signal rejects immediately', async () => {
  const { raceWithSignal } = await load();
  const reason = new Error('early');
  const signal = AbortSignal.abort(reason);
  await assert.rejects(
    raceWithSignal(new Promise<number>(() => {}), signal),
    reason
  );
});

test('aborting after resolution does nothing', async () => {
  const { raceWithSignal } = await load();
  const controller = new AbortController();
  const value = await raceWithSignal(Promise.resolve('ok'), controller.signal);
  controller.abort(new Error('late'));
  assert.equal(value, 'ok');
});

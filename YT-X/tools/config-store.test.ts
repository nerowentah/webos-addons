// Tests for the persisted option store (src/config/config-store.ts) with an in-memory storage.

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from './load-src.ts';

interface Defaults {
  flag: boolean;
  mode: string;
  count: number;
}

interface Store {
  read<K extends keyof Defaults>(key: K): Defaults[K];
  write<K extends keyof Defaults>(key: K, value: Defaults[K]): void;
  addChangeListener(
    key: keyof Defaults,
    callback: (
      evt: CustomEvent<{ newValue: unknown; oldValue: unknown }>
    ) => void
  ): void;
  removeChangeListener(
    key: keyof Defaults,
    callback: (
      evt: CustomEvent<{ newValue: unknown; oldValue: unknown }>
    ) => void
  ): void;
}

interface StoreModule {
  createConfigStore(opts: {
    defaults: Defaults;
    enumValues: Partial<Record<keyof Defaults, readonly string[]>>;
    storageKey: string;
    storage: {
      getItem(key: string): string | null;
      setItem(key: string, value: string): void;
    };
    migrate(raw: unknown): Partial<Defaults> | null;
  }): Store;
}

const { createConfigStore } = await loadSrc<StoreModule>(
  'config/config-store.ts'
);

const defaults: Defaults = { flag: false, mode: 'a', count: 1 };

function makeStore(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('k', initial);
  const store = createConfigStore({
    defaults,
    enumValues: { mode: ['a', 'b'] },
    storageKey: 'k',
    storage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value)
    },
    migrate: (raw) =>
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? { ...raw }
        : null
  });
  return { store, data };
}

test('read falls back to defaults when nothing is stored', () => {
  const { store } = makeStore();
  assert.deepEqual(
    [store.read('flag'), store.read('mode'), store.read('count')],
    [false, 'a', 1]
  );
});

test('stored values override defaults', () => {
  const { store } = makeStore('{"flag":true,"mode":"b"}');
  assert.equal(store.read('flag'), true);
  assert.equal(store.read('mode'), 'b');
  assert.equal(store.read('count'), 1);
});

test('wrong-typed and out-of-enum stored values fall back to defaults', () => {
  const { store } = makeStore('{"flag":"yes","mode":"zzz","count":5}');
  assert.equal(store.read('flag'), false);
  assert.equal(store.read('mode'), 'a');
  assert.equal(store.read('count'), 5);
});

test('unparseable or rejected storage is ignored', () => {
  assert.equal(makeStore('not json').store.read('count'), 1);
  assert.equal(makeStore('[1,2]').store.read('count'), 1);
});

test('write persists and read returns the new value', () => {
  const { store, data } = makeStore();
  store.write('count', 7);
  assert.equal(store.read('count'), 7);
  assert.equal(
    (JSON.parse(data.get('k') ?? '{}') as Partial<Defaults>).count,
    7
  );
});

test('write does not mutate the shared defaults', () => {
  const { store } = makeStore();
  store.write('count', 9);
  assert.equal(defaults.count, 1);
});

test('listeners get old and new values; removal stops delivery', () => {
  const { store } = makeStore();
  const seen: unknown[][] = [];
  const listener = (
    evt: CustomEvent<{ newValue: unknown; oldValue: unknown }>
  ) => seen.push([evt.detail.oldValue, evt.detail.newValue]);

  store.addChangeListener('count', listener);
  store.write('count', 2);
  store.removeChangeListener('count', listener);
  store.write('count', 3);

  assert.deepEqual(seen, [[1, 2]]);
});

test('unknown keys throw', () => {
  const { store } = makeStore();
  assert.throws(() => (store.read as (k: string) => unknown)('nope'));
  assert.throws(() =>
    (store.write as (k: string, v: unknown) => void)('nope', 1)
  );
});

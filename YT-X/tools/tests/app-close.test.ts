// Tests for the one-shot app close chain (src/platform/app-close.ts) and the
// window.close accessor (src/platform/close-on-exit.ts). Each test imports a
// fresh copy of app-close (query suffix) because it keeps module state.

import test from 'node:test';
import assert from 'node:assert/strict';

type Res = Record<string, unknown> | null;
interface Deps {
  call: (
    uri: string,
    params: Record<string, unknown>,
    onResponse: (res: Res) => void
  ) => unknown;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
}
interface AppClose {
  closeAppFully(rawClose: () => void, deps?: Deps): void;
  isClosing(): boolean;
}
interface CloseOnExit {
  forceClose(): void;
  setPageCloseHandler(handler: () => void): void;
}

let n = 0;
const fresh = <T>(path: string): Promise<T> =>
  import(
    `${new URL(`../../src/${path}`, import.meta.url).href}?t=${n++}`
  ) as Promise<T>;

/** Fake timers: fire() runs every pending timer in order. */
function fakeTimers() {
  const pending = new Map<number, () => void>();
  let id = 0;
  return {
    setTimer: (fn: () => void): unknown => {
      pending.set(++id, fn);
      return id;
    },
    clearTimer: (t: unknown): void => {
      pending.delete(t as number);
    },
    fire: (): void => {
      for (const [key, fn] of [...pending]) {
        pending.delete(key);
        fn();
      }
    },
    count: (): number => pending.size
  };
}

test('runs closeByAppId, close, then the page close, in order', async () => {
  const { closeAppFully } = await fresh<AppClose>('platform/app-close.ts');
  const timers = fakeTimers();
  const log: string[] = [];
  const answers: Array<(res: Res) => void> = [];
  closeAppFully(() => log.push('raw'), {
    ...timers,
    call: (uri, params, cb) => {
      log.push(`${uri} ${JSON.stringify(params)}`);
      answers.push(cb);
      return {};
    }
  });
  answers[0]?.({ returnValue: false });
  answers[1]?.({ returnValue: false });
  assert.deepEqual(log, [
    'luna://com.webos.service.applicationmanager/closeByAppId {"id":"youtube.leanback.v4"}',
    'luna://com.webos.service.applicationmanager/close {"id":"youtube.leanback.v4"}',
    'raw'
  ]);
});

test('a successful closeByAppId goes straight to the page close', async () => {
  const { closeAppFully } = await fresh<AppClose>('platform/app-close.ts');
  const timers = fakeTimers();
  const log: string[] = [];
  closeAppFully(() => log.push('raw'), {
    ...timers,
    call: (uri, _params, cb) => {
      log.push(uri.split('/').pop() ?? '');
      cb({ returnValue: true });
      return {};
    }
  });
  assert.deepEqual(log, ['closeByAppId', 'raw']);
});

test('a bridge that never answers is skipped by the deadlines', async () => {
  const { closeAppFully } = await fresh<AppClose>('platform/app-close.ts');
  const timers = fakeTimers();
  let raw = 0;
  closeAppFully(() => raw++, { ...timers, call: () => ({}) });
  assert.equal(raw, 0);
  timers.fire();
  timers.fire();
  timers.fire();
  assert.equal(raw, 1);
});

test('without a bridge the page close runs at once, exactly once', async () => {
  const { closeAppFully, isClosing } = await fresh<AppClose>(
    'platform/app-close.ts'
  );
  const timers = fakeTimers();
  let raw = 0;
  const deps = { ...timers, call: () => null };
  closeAppFully(() => raw++, deps);
  assert.equal(raw, 1);
  assert.equal(isClosing(), true);
  closeAppFully(() => raw++, deps);
  assert.equal(raw, 1);
  assert.equal(timers.count(), 0);
});

test('close-on-exit routes the page close to the handler; default is force-close', async () => {
  const closes: string[] = [];
  const win = { close: () => closes.push('original') } as {
    close: () => void;
    PalmServiceBridge?: unknown;
  };
  (globalThis as { window?: unknown }).window = win;
  const mod = await fresh<CloseOnExit>('platform/close-on-exit.ts');

  // The page assigns its own close after the module ran.
  win.close = () => closes.push('page');

  // Replaced handler: page closes become dialog requests, not closes.
  const asked: string[] = [];
  mod.setPageCloseHandler(() => asked.push('dialog'));
  win.close();
  assert.deepEqual(asked, ['dialog']);
  assert.deepEqual(closes, []);

  // forceClose bypasses the handler and ends in the page's own close.
  mod.forceClose();
  assert.deepEqual(closes, ['page']);
  assert.deepEqual(asked, ['dialog']);
});

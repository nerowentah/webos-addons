// The native scripts run in every web module RF1705's runtime starts; they must
// do their work only in the YouTube page.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { buildMain, buildPreload } from './native-preload.ts';

interface Sandbox {
  window: Record<string, unknown> & {
    addEventListener(type: string, listener: unknown): void;
  };
  location: { protocol: string; hostname: string; href: string };
  localStorage: {
    setItem(k: string, v: string): void;
    removeItem(k: string): void;
  };
  ran?: boolean;
}

function sandbox(href: string): Sandbox {
  const url = new URL(href);
  const window = {
    addEventListener() {}
  } as Sandbox['window'];
  return {
    window,
    location: { protocol: url.protocol, hostname: url.hostname, href },
    localStorage: { setItem() {}, removeItem() {} }
  };
}

const PUBLIC_PATH_THROW =
  'if(!e)throw new Error("Automatic publicPath is not supported in this browser")';

test('the early script marks and runs only on youtube.com', () => {
  const script = buildPreload('window.ranEarly=true;');
  const page = sandbox('https://www.youtube.com/tv');
  runInNewContext(script, { ...page, globalThis: page.window });
  assert.equal(page.window['__ytxNative'], true);

  for (const other of [
    'h5vcc-embedded://black_splash_screen.html',
    'file:///debug_remote/index.html',
    'https://www.youtube.com.evil.example/tv'
  ]) {
    const context = sandbox(other);
    runInNewContext(script, context);
    assert.equal(context.window['__ytxNative'], undefined, other);
  }
});

test('the full script runs only on youtube.com', () => {
  const bundle = `${PUBLIC_PATH_THROW};window.ranMain=true;`;
  const script = buildMain(bundle);

  const page = sandbox('https://www.youtube.com/tv');
  runInNewContext(`var e='x';${script}`, page);
  assert.equal(page.window['ranMain'], true);

  const splash = sandbox('h5vcc-cache://splash_screen/splash.html');
  runInNewContext(`var e='x';${script}`, splash);
  assert.equal(splash.window['ranMain'], undefined);
});

test('the error trap keeps where a script error came from', () => {
  const script = buildPreload('');
  assert.match(script, /e\.filename/);
  assert.match(script, /e\.lineno/);
});

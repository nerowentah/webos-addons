#!/usr/bin/env node
// Unit tests for launch-parameter handling (src/core/launch-url.ts). Run with
// `npm test` (node --test), which strips the TypeScript types natively. The
// module path is built at runtime so this file does not statically import from
// src/ (which would pull it into the tooling tsconfig project).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const href = pathToFileURL(
  path.join(__dirname, '..', 'src', 'core', 'launch-url.ts')
).href;

const load = () => import(href);

test('parseLaunchParams accepts JSON objects only', async () => {
  const { parseLaunchParams } = await load();
  assert.deepEqual(parseLaunchParams('{"target":"a=1"}'), { target: 'a=1' });
  for (const bad of [undefined, null, '', '{', 'null', '5', '[1]', '"x"', {}]) {
    assert.deepEqual(parseLaunchParams(bad), {});
  }
  assert.deepEqual(parseLaunchParams(`{"a":"${'x'.repeat(9000)}"}`), {});
});

test('contentTargetOf prefers contentTarget, falls back to target', async () => {
  const { contentTargetOf } = await load();
  assert.equal(contentTargetOf({ contentTarget: 'a', target: 'b' }), 'a');
  assert.equal(contentTargetOf({ target: 'b' }), 'b');
  assert.equal(contentTargetOf({ contentTarget: null, target: 'b' }), 'b');
  assert.equal(contentTargetOf(null), undefined);
  assert.equal(contentTargetOf('str'), undefined);
});

test('buildLaunchUrl returns null without a usable target', async () => {
  const { buildLaunchUrl } = await load();
  for (const params of [
    undefined,
    null,
    {},
    { contentTarget: '' },
    { contentTarget: 42 },
    { contentTarget: [] },
    { contentTarget: 'x'.repeat(2049) },
    { contentTarget: 'https://example.com/tv' },
    { contentTarget: 'java' + 'script://www.youtube.com/%0Aalert(1)' },
    { contentTarget: 'http://www.youtube.com/tv' },
    { contentTarget: 'java' + 'script:alert(1)' },
    { contentTarget: 'data:text/html,<b>x</b>' },
    { contentTarget: 'mailto:a@b.test' },
    { contentTarget: '//evil.test/tv' },
    { contentTarget: 'https://www.youtube.com.evil.test/tv' },
    { contentTarget: { intent: 'PlayContent' } },
    { contentTarget: { intent: 'PlayContent', intentParam: '   ' } },
    { contentTarget: { intent: 'x'.repeat(65), intentParam: 'cats' } }
  ]) {
    assert.equal(buildLaunchUrl(params), null, JSON.stringify(params));
  }
});

test('the bare-launch fallback keeps the env flags', async () => {
  const { BASE_LAUNCH_URL } = await load();
  const url = new URL(BASE_LAUNCH_URL);
  assert.equal(url.origin, 'https://www.youtube.com');
  assert.equal(url.pathname, '/tv');
  assert.equal(url.hash, '#/');
  for (const flag of [
    'env_forceFullAnimation',
    'env_enableWebSpeech',
    'env_enableVoice'
  ]) {
    assert.deepEqual(url.searchParams.getAll(flag), ['1'], flag);
  }
});

test('buildLaunchUrl folds a DIAL query string into the app URL', async () => {
  const { buildLaunchUrl } = await load();
  const url = new URL(
    buildLaunchUrl({ contentTarget: 'pairingCode=abc&dialLaunch=watch' })
  );
  assert.equal(url.origin, 'https://www.youtube.com');
  assert.equal(url.pathname, '/tv');
  assert.equal(url.hash, '#/');
  assert.equal(url.searchParams.get('pairingCode'), 'abc');
  assert.equal(url.searchParams.get('dialLaunch'), 'watch');
  assert.equal(url.searchParams.get('env_enableVoice'), '1');
});

test('buildLaunchUrl repairs the doubled v= prefix and honours target', async () => {
  const { buildLaunchUrl } = await load();
  const url = new URL(buildLaunchUrl({ target: 'v=v=abc123' }));
  assert.equal(url.searchParams.get('v'), 'abc123');
});

test('buildLaunchUrl keeps same-origin https URLs only', async () => {
  const { buildLaunchUrl } = await load();
  const direct = 'https://www.youtube.com/tv?v=abc#/watch';
  assert.equal(buildLaunchUrl({ contentTarget: direct }), direct);
});

test('buildLaunchUrl builds voice launches', async () => {
  const { buildLaunchUrl } = await load();
  const url = new URL(
    buildLaunchUrl({
      contentTarget: { intent: 'SearchContent', intentParam: 'cats & dogs' }
    })
  );
  assert.equal(url.searchParams.get('inApp'), 'true');
  assert.equal(url.searchParams.get('vs'), '9');
  assert.equal(url.searchParams.get('va'), 'search');
  assert.deepEqual(url.searchParams.getAll('launch'), ['voice', 'search']);
  assert.equal(url.searchParams.get('vq'), 'cats & dogs');

  const play = new URL(
    buildLaunchUrl({
      contentTarget: { intent: 'PlayContent', intentParam: 'x'.repeat(600) }
    })
  );
  assert.equal(play.searchParams.get('va'), 'play');
  assert.deepEqual(play.searchParams.getAll('launch'), ['voice']);
  assert.equal(play.searchParams.get('vq')?.length, 512);
});

test('buildLaunchUrl skips va for an unrecognised intent but still searches', async () => {
  const { buildLaunchUrl } = await load();
  const url = new URL(
    buildLaunchUrl({
      contentTarget: { intent: 'Weird&Intent', intentParam: 'q' }
    })
  );
  assert.equal(url.searchParams.has('va'), false);
  assert.equal(url.searchParams.get('vq'), 'q');
});

#!/usr/bin/env node
// Unit tests for the "Video paused. Continue watching?" text matchers
// (src/features/keep-playing/keep-playing-text.ts). Run with `npm test` (node --test). The module
// path is built at runtime so this file does not statically import from src/.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const textHref = pathToFileURL(
  path.join(
    __dirname,
    '..',
    'src',
    'features',
    'keep-playing',
    'keep-playing-text.ts'
  )
).href;

test('matchesContinueWatchingText recognises the inactivity prompt', async () => {
  const { matchesContinueWatchingText } = await import(textHref);
  assert.equal(
    matchesContinueWatchingText('Video paused. Continue watching?'),
    true
  );
  assert.equal(matchesContinueWatchingText('Are you still watching?'), true);
  assert.equal(matchesContinueWatchingText('STILL WATCHING'), true);
});

test('matchesContinueWatchingText ignores unrelated copy', async () => {
  const { matchesContinueWatchingText } = await import(textHref);
  assert.equal(matchesContinueWatchingText('Subscribe'), false);
  assert.equal(matchesContinueWatchingText(''), false);
  assert.equal(matchesContinueWatchingText(undefined), false);
});

test('isConfirmLabel recognises the affirmative control', async () => {
  const { isConfirmLabel } = await import(textHref);
  assert.equal(isConfirmLabel('Yes'), true);
  assert.equal(isConfirmLabel('  Continue watching  '), true);
  assert.equal(isConfirmLabel('OK'), true);
});

test('isConfirmLabel ignores non-affirmative controls', async () => {
  const { isConfirmLabel } = await import(textHref);
  assert.equal(isConfirmLabel('Bookmark'), false);
  assert.equal(isConfirmLabel('No'), false);
  assert.equal(isConfirmLabel(''), false);
});

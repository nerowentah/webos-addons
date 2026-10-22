// Unit tests for the "Video paused. Continue watching?" text matchers
// (src/features/keep-playing/keep-playing-text.ts). Run with `npm test` (node --test). The module
// path is built at runtime so this file does not statically import from src/.

import test from 'node:test';
import assert from 'node:assert/strict';

/** The parts of keep-playing-text.ts these tests use. */
interface KeepPlayingTextModule {
  matchesContinueWatchingText(text: unknown): boolean;
  isConfirmLabel(label: unknown): boolean;
}

const textHref = new URL(
  '../src/features/keep-playing/keep-playing-text.ts',
  import.meta.url
).href;

const load = async () => (await import(textHref)) as KeepPlayingTextModule;

test('matchesContinueWatchingText recognises the inactivity prompt', async () => {
  const { matchesContinueWatchingText } = await load();
  assert.equal(
    matchesContinueWatchingText('Video paused. Continue watching?'),
    true
  );
  assert.equal(matchesContinueWatchingText('Are you still watching?'), true);
  assert.equal(matchesContinueWatchingText('STILL WATCHING'), true);
});

test('matchesContinueWatchingText ignores unrelated copy', async () => {
  const { matchesContinueWatchingText } = await load();
  assert.equal(matchesContinueWatchingText('Subscribe'), false);
  assert.equal(matchesContinueWatchingText(''), false);
  assert.equal(matchesContinueWatchingText(undefined), false);
});

test('isConfirmLabel recognises the affirmative control', async () => {
  const { isConfirmLabel } = await load();
  assert.equal(isConfirmLabel('Yes'), true);
  assert.equal(isConfirmLabel('  Continue watching  '), true);
  assert.equal(isConfirmLabel('OK'), true);
});

test('isConfirmLabel ignores non-affirmative controls', async () => {
  const { isConfirmLabel } = await load();
  assert.equal(isConfirmLabel('Bookmark'), false);
  assert.equal(isConfirmLabel('No'), false);
  assert.equal(isConfirmLabel(''), false);
});

// Tests for the remote key table in src/core/keys.ts. The sendKey path needs a
// DOM and is not covered here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from './load-src.ts';

interface KeyDef {
  keyCode: number;
  key: string;
  code: string;
  alt?: readonly number[];
}

interface KeysModule {
  REMOTE_KEYS: Record<string, KeyDef>;
  COLOR_CODE_MAP: {
    has(keyCode: number): boolean;
    get(keyCode: number): string | undefined;
  };
  SYNTHETIC_KEY_FLAG: symbol;
  isSyntheticKey(evt: object): boolean;
  isOpenPanelKey(
    evt: { keyCode: number; repeat: boolean },
    ctx: { synthetic: boolean; panelVisible: boolean; editing: boolean }
  ): boolean;
}

const {
  COLOR_CODE_MAP,
  isOpenPanelKey,
  isSyntheticKey,
  REMOTE_KEYS,
  SYNTHETIC_KEY_FLAG
} = await loadSrc<KeysModule>('core/keys.ts');

test('numeric keys are keyCode 48 + n', () => {
  for (let n = 0; n <= 9; n++) {
    const key = REMOTE_KEYS[String(n)];
    assert.ok(key);
    assert.equal(key.keyCode, 48 + n);
    assert.equal(key.key, String(n));
    assert.equal(key.code, `Digit${n}`);
  }
});

test('REMOTE_KEYS entries are frozen', () => {
  assert.ok(Object.isFrozen(REMOTE_KEYS));
  assert.ok(Object.isFrozen(REMOTE_KEYS['RED']));
  assert.ok(Object.isFrozen(REMOTE_KEYS['BLUE']?.alt));
});

test('COLOR_CODE_MAP resolves primary and alternate codes', () => {
  assert.equal(COLOR_CODE_MAP.get(403), 'red');
  assert.equal(COLOR_CODE_MAP.get(166), 'red');
  assert.equal(COLOR_CODE_MAP.get(404), 'green');
  assert.equal(COLOR_CODE_MAP.get(405), 'yellow');
  assert.equal(COLOR_CODE_MAP.get(406), 'blue');
  assert.equal(COLOR_CODE_MAP.get(167), 'blue');
  assert.equal(COLOR_CODE_MAP.get(191), 'blue');
});

test('COLOR_CODE_MAP rejects non-colour codes', () => {
  assert.equal(COLOR_CODE_MAP.has(13), false);
  assert.equal(COLOR_CODE_MAP.get(13), undefined);
});

test('isSyntheticKey flags explicit untrusted events and our own', () => {
  const real = { isTrusted: true };
  assert.equal(isSyntheticKey(real), false);

  const untrusted = { isTrusted: false };
  assert.equal(isSyntheticKey(untrusted), true);

  const flagged = { isTrusted: true, [SYNTHETIC_KEY_FLAG]: true };
  assert.equal(isSyntheticKey(flagged), true);

  // The legacy Cobalt engine has no isTrusted: a real press reads undefined.
  assert.equal(isSyntheticKey({}), false);
  assert.equal(isSyntheticKey({ [SYNTHETIC_KEY_FLAG]: true }), true);
});

test('GREEN (including the 172 alternate) opens the panel, only when it should', () => {
  const free = { synthetic: false, panelVisible: false, editing: false };
  assert.equal(isOpenPanelKey({ keyCode: 404, repeat: false }, free), true);
  assert.equal(isOpenPanelKey({ keyCode: 172, repeat: false }, free), true);
  assert.equal(isOpenPanelKey({ keyCode: 403, repeat: false }, free), false);
  assert.equal(isOpenPanelKey({ keyCode: 404, repeat: true }, free), false);
  assert.equal(
    isOpenPanelKey(
      { keyCode: 404, repeat: false },
      { ...free, synthetic: true }
    ),
    false
  );
  assert.equal(
    isOpenPanelKey(
      { keyCode: 404, repeat: false },
      { ...free, panelVisible: true }
    ),
    false
  );
  assert.equal(
    isOpenPanelKey({ keyCode: 404, repeat: false }, { ...free, editing: true }),
    false
  );
});

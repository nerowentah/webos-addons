// Tests for the pure CSP nonce selection (src/core/csp-nonce.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from './load-src.ts';

interface NonceCandidate {
  tagName: string;
  nonce?: string;
  attr?: string;
}

interface CspNonceModule {
  NONCE_WAIT_MS: number;
  selectNonce(candidates: readonly NonceCandidate[]): string;
}

const { NONCE_WAIT_MS, selectNonce } =
  await loadSrc<CspNonceModule>('core/csp-nonce.ts');

test('selectNonce prefers a style/link nonce', () => {
  assert.equal(
    selectNonce([
      { tagName: 'script', nonce: 'script-nonce' },
      { tagName: 'style', nonce: 'style-nonce' }
    ]),
    'style-nonce'
  );
  assert.equal(
    selectNonce([
      { tagName: 'div', attr: 'other' },
      { tagName: 'link', attr: 'link-nonce' }
    ]),
    'link-nonce'
  );
});

test('selectNonce falls back to any element and then an empty string', () => {
  assert.equal(
    selectNonce([
      { tagName: 'script', nonce: 'script-nonce' },
      { tagName: 'style' }
    ]),
    'script-nonce'
  );
  assert.equal(
    selectNonce([{ tagName: 'style', attr: '' }, { tagName: 'script' }]),
    ''
  );
  assert.equal(selectNonce([]), '');
});

test('the nonce wait is bounded', () => {
  assert.ok(Number.isFinite(NONCE_WAIT_MS));
  assert.ok(NONCE_WAIT_MS > 0);
});

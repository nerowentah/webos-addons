// Tests for the device-code body rewrite (src/native/device-model.ts).

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSrc } from './load-src.ts';

interface IdentityModule {
  withFullModel(deviceModel: string, fullModel: string): string;
  rewriteDeviceCodeBody(url: string, body: unknown, full: string): unknown;
  castModelName(full: string): string;
  rewriteLoungeUrl(url: string, full: string): string;
}

const {
  withFullModel,
  rewriteDeviceCodeBody,
  castModelName,
  rewriteLoungeUrl
} = await loadSrc<IdentityModule>('native/device-model.ts');
const URL_CODE = 'https://www.youtube.com/o/oauth2/device/code';
const FULL = '65QNED86ASA.ATSFLJD';

test('withFullModel keeps the prefix and lowercases the model', () => {
  assert.equal(
    withFullModel('ytlr:lg:qned86', FULL),
    'ytlr:lg:65qned86asa.atsfljd'
  );
  assert.equal(withFullModel('odd', FULL), 'odd');
});

test('only the device-code body changes, and only device_model', () => {
  const body = JSON.stringify({
    client_id: 'c',
    device_model: 'ytlr:lg:qned86'
  });
  const out = JSON.parse(
    rewriteDeviceCodeBody(URL_CODE, body, FULL) as string
  ) as Record<string, string>;
  assert.equal(out['device_model'], 'ytlr:lg:65qned86asa.atsfljd');
  assert.equal(out['client_id'], 'c');
  assert.equal(
    rewriteDeviceCodeBody('https://www.youtube.com/o/oauth2/token', body, FULL),
    body
  );
  assert.equal(rewriteDeviceCodeBody(URL_CODE, 'not json', FULL), 'not json');
  assert.equal(rewriteDeviceCodeBody(URL_CODE, body, ''), body);
});

test('lounge deviceInfo model becomes the Cast receiver name', () => {
  assert.equal(castModelName(FULL), 'webOS TV QNED86ASA');
  const info = encodeURIComponent(
    JSON.stringify({ brand: 'LG', model: 'QNED86' })
  );
  const out = new URL(
    rewriteLoungeUrl(
      `https://www.youtube.com/api/lounge/bc/bind?name=x&deviceInfo=${info}`,
      FULL
    )
  );
  assert.deepEqual(JSON.parse(out.searchParams.get('deviceInfo') ?? ''), {
    brand: '[YT-X]',
    model: 'webOS TV QNED86ASA'
  });
  assert.equal(out.searchParams.get('name'), 'x');
  const other = 'https://www.youtube.com/api/other?deviceInfo=1';
  assert.equal(rewriteLoungeUrl(other, FULL), other);
});

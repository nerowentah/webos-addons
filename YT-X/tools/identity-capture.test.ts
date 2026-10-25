// Tests for the identity capture helpers: nothing credential-like may survive.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  recorderSource,
  redactIdentity,
  redactRequest
} from './identity-capture.ts';

const SECRET = 'ya29.a0AX07CmueSECRETSECRETSECRET';

test('headers keep names, and values only when allowlisted', () => {
  const out = redactRequest({
    method: 'POST',
    url: 'https://www.youtube.com/youtubei/v1/account/accounts_list?prettyPrint=false',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
      'X-Goog-Visitor-Id': 'CgtENWMtZXZLYTlUayjhiPDWBjIK',
      'X-YouTube-Client-Version': '7.20261021.13.00'
    }
  });
  assert.deepEqual(out.headers, {
    Authorization: '<redacted>',
    'Content-Type': 'application/json',
    'X-Goog-Visitor-Id': '<redacted>',
    'X-YouTube-Client-Version': '7.20261021.13.00'
  });
  assert.equal(JSON.stringify(out).includes(SECRET), false);
});

test('query values are redacted unless they describe the device', () => {
  const out = redactRequest({
    method: 'GET',
    url: `https://accounts.google.com/o/oauth2/device/code?access_token=${SECRET}&device_model=QNED86&cpn=abcdefghijk`,
    headers: {}
  });
  assert.equal(out.host, 'accounts.google.com');
  assert.equal(out.path, '/o/oauth2/device/code');
  assert.deepEqual(out.query, {
    access_token: '<redacted>',
    device_model: 'QNED86',
    cpn: '<redacted>'
  });
});

test('JSON bodies keep the device fields and drop everything else', () => {
  const out = redactRequest({
    method: 'POST',
    url: '/youtubei/v1/account/accounts_list',
    headers: {},
    body: JSON.stringify({
      context: {
        client: {
          deviceMake: 'LG',
          deviceModel: 'QNED86',
          visitorData: 'Cgt' + 'x'.repeat(200),
          userAgent: 'Mozilla/5.0 (Web0S; Linux) Cobalt/23',
          osName: 'webOS'
        }
      },
      refresh_token: SECRET
    })
  });
  const body = out.body as {
    context: { client: Record<string, string> };
    refresh_token: string;
  };
  assert.equal(body.context.client['deviceMake'], 'LG');
  assert.equal(body.context.client['deviceModel'], 'QNED86');
  assert.equal(body.context.client['osName'], 'webOS');
  assert.equal(body.context.client['visitorData'], '<redacted>');
  assert.equal(body.refresh_token, '<redacted>');
  assert.equal(JSON.stringify(out).includes(SECRET), false);
});

test('form bodies are redacted like queries', () => {
  const out = redactRequest({
    method: 'POST',
    url: 'https://www.youtube.com/o/oauth2/device/code',
    headers: {},
    body: `client_id=861556708454&scope=https://www.googleapis.com/auth/youtube&device_model=QNED86&device_code=${SECRET}`
  });
  assert.deepEqual(out.body, {
    client_id: '<redacted>',
    scope: 'https://www.googleapis.com/auth/youtube',
    device_model: 'QNED86',
    device_code: '<redacted>'
  });
});

test('identity dumps redact visitor data but keep the device fields', () => {
  const out = redactIdentity({
    deviceMake: 'LG',
    deviceModel: 'QNED86',
    platform: 'TV',
    visitorData: 'CgtENWMtZXZLYTlUayjh',
    screenWidthPoints: 1920
  });
  assert.equal(out['deviceMake'], 'LG');
  assert.equal(out['visitorData'], '<redacted>');
  assert.equal(out['screenWidthPoints'], '<number>');
});

test('the recorder source is a self-contained expression', () => {
  const source = recorderSource('/o/oauth2');
  assert.match(source, /__ytxCapture/);
  // Compiles as a script (no execution): a syntax error would throw here.
  assert.doesNotThrow(() => new vm.Script(source));
});

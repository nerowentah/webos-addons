// Tests for the pinned-runtime resolver and the runtime contract check
// (tools/native/runtime.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TarEntry } from './native-ipk.ts';
import {
  RUNTIME_LOCK,
  cachePath,
  checkRuntimeContract,
  resolveRuntime,
  verifyRuntime,
  type RuntimeLock
} from './runtime.ts';

const APP_ID = 'youtube.leanback.v4';
const ROOT = `usr/palm/applications/${APP_ID}`;

const body = Buffer.from('a runtime package');
const lockFor = (data: Buffer, url = 'https://example.test/r.ipk') => ({
  version: '9.9.9',
  url,
  sha256: createHash('sha256').update(data).digest('hex'),
  size: data.length
});

function withCache(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'ytx-runtime-test-'));
  return run(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test('the committed lock is a full https pin', () => {
  assert.match(RUNTIME_LOCK.url, /^https:\/\//);
  assert.match(RUNTIME_LOCK.sha256, /^[0-9a-f]{64}$/);
  assert.ok(RUNTIME_LOCK.size > 0);
  assert.match(RUNTIME_LOCK.version, /^\d+\.\d+\.\d+$/);
});

test('verifyRuntime rejects a wrong size and a wrong hash', () => {
  const lock = lockFor(body);
  verifyRuntime(body, lock);
  assert.throws(() => verifyRuntime(Buffer.from('short'), lock), /size/);
  const sameLength = Buffer.from(body);
  sameLength.writeUInt8(sameLength.readUInt8(0) ^ 1, 0);
  assert.throws(() => verifyRuntime(sameLength, lock), /sha256/);
});

test('an explicit runtime bypasses the lock, and must exist', () =>
  withCache(async (dir) => {
    const file = join(dir, 'mine.ipk');
    writeFileSync(file, 'anything');
    const download = () => Promise.reject(new Error('must not download'));
    assert.equal(await resolveRuntime(file, { download }), file);
    await assert.rejects(
      resolveRuntime(join(dir, 'missing.ipk'), { download }),
      /not found/
    );
  }));

test('the locked runtime is downloaded once, then served from the cache', () =>
  withCache(async (cacheDir) => {
    const lock = lockFor(body);
    let downloads = 0;
    const download = (url: string) => {
      downloads++;
      assert.equal(url, lock.url);
      return Promise.resolve(body);
    };
    const first = await resolveRuntime(undefined, { lock, cacheDir, download });
    assert.equal(first, cachePath(lock, cacheDir));
    assert.deepEqual(readFileSync(first), body);
    const second = await resolveRuntime(undefined, {
      lock,
      cacheDir,
      download
    });
    assert.equal(second, first);
    assert.equal(downloads, 1);
  }));

test('a corrupted cache entry is dropped and fetched again', () =>
  withCache(async (cacheDir) => {
    const lock = lockFor(body);
    let downloads = 0;
    const download = () => {
      downloads++;
      return Promise.resolve(body);
    };
    const file = await resolveRuntime(undefined, { lock, cacheDir, download });
    writeFileSync(file, 'tampered');
    await resolveRuntime(undefined, { lock, cacheDir, download });
    assert.equal(downloads, 2);
    assert.deepEqual(readFileSync(file), body);
  }));

test('a download that does not match the lock is not cached', () =>
  withCache(async (cacheDir) => {
    const lock = lockFor(body);
    const download = () => Promise.resolve(Buffer.from('something else!!!'));
    await assert.rejects(
      resolveRuntime(undefined, { lock, cacheDir, download }),
      /sha256/
    );
    assert.equal(existsSync(cachePath(lock, cacheDir)), false);
  }));

test('a non-https lock URL is refused before any download', () =>
  withCache(async (cacheDir) => {
    const lock: RuntimeLock = lockFor(body, 'http://example.test/r.ipk');
    const download = () => Promise.reject(new Error('must not download'));
    await assert.rejects(
      resolveRuntime(undefined, { lock, cacheDir, download }),
      /must be https/
    );
  }));

const file = (name: string, data: Buffer | string): TarEntry => ({
  name: `${ROOT}/${name}`,
  mode: 0o644,
  uid: 0,
  gid: 0,
  mtime: 1700000000,
  type: '0',
  linkname: '',
  data: Buffer.isBuffer(data) ? data : Buffer.from(data)
});

const ELF = Buffer.concat([
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  Buffer.from(
    '\0/web/adblock/adblockPreload.js\0file:///adblock/adblockMain.js\0',
    'latin1'
  )
]);

function runtimeEntries(): TarEntry[] {
  return [
    file(
      'appinfo.json',
      JSON.stringify({ id: APP_ID, type: 'native', main: 'cobalt' })
    ),
    file('cobalt', ELF),
    file('content/web/adblock/adblockPreload.js', 'p'),
    file('content/web/adblock/adblockMain.js', 'm'),
    file('content/web/adblock/adblockMain.css', 'c')
  ];
}

const without = (name: string): TarEntry[] =>
  runtimeEntries().filter((entry) => entry.name !== `${ROOT}/${name}`);

const replaced = (name: string, data: Buffer | string): TarEntry[] => [
  ...without(name),
  file(name, data)
];

test('the contract check accepts a runtime with every injection point', () => {
  checkRuntimeContract(runtimeEntries(), APP_ID);
});

test('the contract check names each missing piece', () => {
  const cases: Array<[TarEntry[], RegExp]> = [
    [without('cobalt'), /no .*cobalt binary/],
    [replaced('cobalt', '#!/bin/sh\n'), /not an ELF/],
    [
      replaced('cobalt', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0])),
      /adblockPreload\.js" injection hook/
    ],
    [
      without('content/web/adblock/adblockMain.js'),
      /adblockMain\.js to replace/
    ],
    [without('appinfo.json'), /no .*appinfo\.json/],
    [
      replaced('appinfo.json', JSON.stringify({ id: APP_ID, type: 'web' })),
      /type is not native/
    ],
    [replaced('appinfo.json', '{'), /not valid JSON/]
  ];
  for (const [entries, message] of cases) {
    assert.throws(() => checkRuntimeContract(entries, APP_ID), message);
  }
});

test('the contract check reports every problem in one error', () => {
  assert.throws(
    () => checkRuntimeContract([], APP_ID),
    (error: Error) =>
      error.message.includes('appinfo.json') &&
      error.message.includes('cobalt binary') &&
      error.message.includes('adblockMain.css')
  );
});

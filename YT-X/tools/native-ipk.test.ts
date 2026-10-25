// Tests for the IPK reader/writer used to build the native Cobalt package.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  patchBytes,
  patchCString,
  readAr,
  readTarGz,
  setFile,
  writeAr,
  writeTarGz,
  type TarEntry
} from './native-ipk.ts';

const entry = (over: Partial<TarEntry>): TarEntry => ({
  name: 'a',
  mode: 0o644,
  uid: 0,
  gid: 5000,
  mtime: 1700000000,
  type: '0',
  linkname: '',
  data: Buffer.alloc(0),
  ...over
});

test('ar round-trips members, including odd sizes', () => {
  const members = [
    { name: 'debian-binary', data: Buffer.from('2.0\n') },
    { name: 'data.tar.gz', data: Buffer.from('abc') }
  ];
  const read = readAr(writeAr(members));
  assert.deepEqual(
    read.map((m) => [m.name, m.data.toString()]),
    [
      ['debian-binary', '2.0\n'],
      ['data.tar.gz', 'abc']
    ]
  );
});

test('tar round-trips metadata, directories and long paths', () => {
  const long = `usr/palm/applications/youtube.leanback.v4/content/web/adblock/${'x'.repeat(40)}.js`;
  const entries = [
    entry({ name: 'usr', type: '5', mode: 0o775 }),
    entry({ name: 'usr/cobalt', mode: 0o755, data: Buffer.from('ELF') }),
    entry({ name: long, data: Buffer.alloc(700, 7) })
  ];
  const read = readTarGz(writeTarGz(entries));
  assert.deepEqual(
    read.map((e) => [e.name, e.mode, e.uid, e.gid, e.type, e.data.length]),
    [
      ['usr', 0o775, 0, 5000, '5', 0],
      ['usr/cobalt', 0o755, 0, 5000, '0', 3],
      [long, 0o644, 0, 5000, '0', 700]
    ]
  );
  assert.equal(read[2]?.data[699], 7);
});

test('setFile replaces data in place or copies a template', () => {
  const entries = [entry({ name: 'x', mode: 0o600, data: Buffer.from('1') })];
  setFile(entries, 'x', Buffer.from('2'));
  assert.equal(entries[0]?.data.toString(), '2');
  assert.equal(entries[0]?.mode, 0o600);

  setFile(entries, 'y', Buffer.from('3'), 'x');
  assert.equal(entries[1]?.name, 'y');
  assert.equal(entries[1]?.mode, 0o600);
  assert.throws(() => setFile(entries, 'z', Buffer.from('4'), 'missing'));
});

test('patchCString pads in place and demands one unique match', () => {
  const bin = Buffer.from('\0AA\0\0DESKTOP\0\0');
  const out = patchCString(bin, 'DESKTOP', 'TV');
  assert.equal(out.length, bin.length);
  assert.equal(out.toString('latin1'), '\0AA\0\0TV' + '\0'.repeat(7));
  assert.throws(() => patchCString(bin, 'DESKTOP', 'TOO LONG NAME'));
  assert.throws(() => patchCString(bin, 'MISSING', 'X'));
  assert.throws(() =>
    patchCString(Buffer.from('\0DESKTOP\0\0DESKTOP\0'), 'DESKTOP', 'TV')
  );
});

test('patchBytes swaps equal-length runs and demands one match', () => {
  const bin = Buffer.from('\x1b2022\0Name\0 tail');
  const out = patchBytes(
    bin,
    Buffer.from('2022\0Name\0'),
    Buffer.from('2025\0Name\0')
  );
  assert.equal(out.toString('latin1'), '\x1b2025\0Name\0 tail');
  assert.throws(() => patchBytes(bin, Buffer.from('2022'), Buffer.from('25')));
  assert.throws(() =>
    patchBytes(bin, Buffer.from('nope'), Buffer.from('yes!'))
  );
});

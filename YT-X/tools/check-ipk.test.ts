import test from 'node:test';
import assert from 'node:assert/strict';
import { checkIpk } from './check-ipk.ts';
import { writeAr, writeTarGz, type TarEntry } from './native-ipk.ts';
import { normalizeModes } from './package.ts';

const entry = (over: Partial<TarEntry>): TarEntry => ({
  name: 'a',
  mode: 0o644,
  uid: 0,
  gid: 0,
  mtime: 1700000000,
  type: '0',
  linkname: '',
  data: Buffer.alloc(0),
  ...over
});

const info = Buffer.from(JSON.stringify({ id: 'x.y', version: '1.2.3' }));
const ipk = (entries: TarEntry[]): Buffer =>
  writeAr([
    { name: 'debian-binary', data: Buffer.from('2.0\n') },
    { name: 'data.tar.gz', data: writeTarGz(entries) }
  ]);
const good = [
  entry({ name: 'usr/app', type: '5', mode: 0o755 }),
  entry({ name: 'usr/app/appinfo.json', data: info })
];

test('a clean package passes', () => {
  assert.deepEqual(checkIpk(ipk(good), 'x.y_1.2.3_all.ipk'), []);
});

test('writable, executable, stray and misnamed entries are reported', () => {
  const bad = [
    ...good,
    entry({ name: 'usr/app/a.js', mode: 0o666 }),
    entry({ name: 'usr/app/run', mode: 0o755 }),
    entry({ name: 'usr/app/main.js.map' })
  ];
  const problems = checkIpk(ipk(bad), 'x.y_9.9.9_all.ipk').join('\n');
  assert.match(problems, /file name/);
  assert.match(problems, /a\.js: group\/other-writable/);
  assert.match(problems, /run: regular file is executable/);
  assert.match(problems, /main\.js\.map: stray/);
});

test('normalizeModes makes a 777/666 archive pass', () => {
  const loose = [
    entry({ name: 'usr/app', type: '5', mode: 0o777 }),
    entry({ name: 'usr/app/appinfo.json', data: info, mode: 0o666 })
  ];
  assert.notDeepEqual(checkIpk(ipk(loose), 'x.y_1.2.3_all.ipk'), []);
  assert.deepEqual(
    checkIpk(normalizeModes(ipk(loose)), 'x.y_1.2.3_all.ipk'),
    []
  );
});

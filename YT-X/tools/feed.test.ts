import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeed, buildPackage, releaseIpkUrl } from './feed.ts';

const pkg = buildPackage({
  appinfo: { id: 'a.b', type: 'web', title: 'T' },
  version: '1.2.3',
  ipkUrl: releaseIpkUrl('https://x.test/dl/v1/', 'a.b_1.2.3_all.ipk'),
  meta: { sha256: 'ff', size: 10 },
  owner: 'o',
  repo: 'r'
});

test('package entry carries absolute url, hash, size and icon', () => {
  assert.equal(pkg.ipkUrl, 'https://x.test/dl/v1/a.b_1.2.3_all.ipk');
  assert.deepEqual(pkg.ipkHash, { sha256: 'ff' });
  assert.equal(pkg.ipkSize, 10);
  assert.match(pkg.iconUri, /^https:\/\/raw\.githubusercontent\.com\/o\/r\//);
});

test('feed wraps packages; non-https base URL is rejected', () => {
  assert.deepEqual(buildFeed([pkg]).packages, [pkg]);
  assert.throws(() => releaseIpkUrl('http://x', 'f.ipk'), /https/);
});

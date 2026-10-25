// Writes the Homebrew Channel repository feed for the release IPK.
// Usage: node tools/gen-repo.ts --base-url <release-download-url> [--out repo.json]
// Run from YT-X/ after `npm run package:fhd`; the IPK must be in the cwd.
// A beta entry would share the app id and so replace stable on the TV unless it
// gets its own id (and manifest.type/id must match the app: never publish a native
// package under the web app's entry).

import fs from 'node:fs';
import path from 'node:path';
import appinfo from '../assets/appinfo.json' with { type: 'json' };
import { buildFeed, buildPackage, ipkMeta, releaseIpkUrl } from './feed.ts';
import { getRepository, getVersion } from './version.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const baseUrl = flag('--base-url');
if (!baseUrl) throw new Error('gen-repo: --base-url is required');
const out = flag('--out') ?? 'repo.json';
if (path.isAbsolute(out) || path.normalize(out).startsWith('..')) {
  throw new Error('gen-repo: --out must be a relative path inside the cwd');
}

const repository = getRepository();
if (!repository) throw new Error('gen-repo: repository not parseable');

const version = getVersion();
const ipkFile = `${appinfo.id}_${version}_all.ipk`;
if (!fs.existsSync(ipkFile)) {
  throw new Error(`gen-repo: ${ipkFile} not found (run the package step)`);
}

const feed = buildFeed([
  buildPackage({
    appinfo,
    version,
    ipkUrl: releaseIpkUrl(baseUrl, ipkFile),
    meta: ipkMeta(ipkFile),
    owner: repository.owner,
    repo: repository.repo
  })
]);
fs.writeFileSync(out, `${JSON.stringify(feed, null, 2)}\n`);
console.log(`gen-repo: wrote ${out} for ${ipkFile}`);

// Usage: node tools/gen-manifest.ts <outfile>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import appinfo from '../assets/appinfo.json' with { type: 'json' };
import { getVersion, getRepository } from './version.ts';

const requested = process.argv[2];
if (!requested) throw new Error('Usage: gen-manifest <outfile>');

// The output path is caller-supplied, so confine it to the working tree: an
// absolute or escaping path could write anywhere a dev runs the tool.
if (path.isAbsolute(requested)) {
  throw new Error('gen-manifest: <outfile> must be a relative path');
}
const outfile = path.resolve(requested);
const repoRoot = path.resolve(process.cwd());
if (!outfile.startsWith(`${repoRoot}${path.sep}`)) {
  throw new Error(`gen-manifest: <outfile> must stay within ${repoRoot}`);
}

const ipkfile = `${appinfo.id}_${getVersion()}_all.ipk`;
const ipkhash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(ipkfile))
  .digest('hex');

// Derive owner/repo from package.json repository (track forks).
const repository = getRepository();
if (!repository) {
  throw new Error('gen-manifest: package.json repository not parseable');
}
const { owner, repo } = repository;
const repoUrl = `https://github.com/${owner}/${repo}`;
const assetBase = `https://raw.githubusercontent.com/${owner}/${repo}/main/YT-X/assets`;

fs.writeFileSync(
  outfile,
  JSON.stringify({
    id: appinfo.id,
    version: getVersion(),
    type: appinfo.type,
    title: appinfo.title,
    iconUri: `${assetBase}/extraLargeIcon.png`,
    sourceUrl: repoUrl,
    rootRequired: false,
    ipkUrl: ipkfile,
    ipkHash: {
      sha256: ipkhash
    }
  })
);

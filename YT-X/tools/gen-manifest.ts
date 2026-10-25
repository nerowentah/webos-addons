// Usage: node tools/gen-manifest.ts <outfile> [--ipk-url <absolute-url>]
import fs from 'node:fs';
import path from 'node:path';
import appinfo from '../assets/appinfo.json' with { type: 'json' };
import { buildPackage, ipkMeta } from './feed.ts';
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

const urlFlag = process.argv.indexOf('--ipk-url');
const ipkUrl = urlFlag === -1 ? ipkfile : (process.argv[urlFlag + 1] ?? '');
if (urlFlag !== -1 && !ipkUrl.startsWith('https://')) {
  throw new Error('gen-manifest: --ipk-url must be an absolute https URL');
}

// Derive owner/repo from package.json repository (track forks).
const repository = getRepository();
if (!repository) {
  throw new Error('gen-manifest: package.json repository not parseable');
}

fs.writeFileSync(
  outfile,
  JSON.stringify(
    buildPackage({
      appinfo,
      version: getVersion(),
      ipkUrl,
      meta: ipkMeta(ipkfile),
      owner: repository.owner,
      repo: repository.repo
    })
  )
);

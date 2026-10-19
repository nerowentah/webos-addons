#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let outfile = process.argv[2];
if (!outfile) throw new Error('Usage: gen-manifest <outfile>');

// The output path is caller-supplied, so confine it to the working tree: an
// absolute or escaping path could write anywhere a dev runs the tool.
if (path.isAbsolute(outfile)) {
  throw new Error('gen-manifest: <outfile> must be a relative path');
}
outfile = path.resolve(outfile);
const repoRoot = path.resolve(process.cwd());
if (!outfile.startsWith(`${repoRoot}${path.sep}`)) {
  throw new Error(`gen-manifest: <outfile> must stay within ${repoRoot}`);
}

const appinfo = require('../assets/appinfo.json');
const { getVersion, getRepository } = require('./version.cjs');
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

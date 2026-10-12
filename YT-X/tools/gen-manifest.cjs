#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');

const outfile = process.argv[2];
if (!outfile) throw new Error('Usage: gen-manifest <outfile>');

const appinfo = require('../assets/appinfo.json');
const { getVersion, getRepository } = require('./version.cjs');
const ipkfile = `${appinfo.id}_${getVersion()}_all.ipk`;
const ipkhash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(ipkfile))
  .digest('hex');

// Owner and repo name come from package.json's repository field so the manifest
// URLs track the fork instead of naming it twice.
const repository = getRepository();
if (!repository) {
  throw new Error(
    'gen-manifest: package.json repository is not a parseable GitHub reference'
  );
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
    // appDescription: appinfo.appDescription,
    iconUri: `${assetBase}/extraLargeIcon.png`,
    sourceUrl: repoUrl,
    rootRequired: false,
    ipkUrl: ipkfile,
    ipkHash: {
      sha256: ipkhash
    }
  })
);

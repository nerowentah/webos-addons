#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');

const outfile = process.argv[2];
if (!outfile) throw new Error('Usage: gen-manifest <outfile>');

const appinfo = require('../assets/appinfo.json');
const { getVersion } = require('./version.cjs');
const ipkfile = `${appinfo.id}_${getVersion()}_all.ipk`;
const ipkhash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(ipkfile))
  .digest('hex');

fs.writeFileSync(
  outfile,
  JSON.stringify({
    id: appinfo.id,
    version: getVersion(),
    type: appinfo.type,
    title: appinfo.title,
    // appDescription: appinfo.appDescription,
    iconUri:
      'https://raw.githubusercontent.com/nerowentah/scripts/main/Cross-Platform/webOS/YTAF/assets/extraLargeIcon.png',
    sourceUrl: 'https://github.com/nerowentah/scripts',
    rootRequired: false,
    ipkUrl: ipkfile,
    ipkHash: {
      sha256: ipkhash
    }
  })
);

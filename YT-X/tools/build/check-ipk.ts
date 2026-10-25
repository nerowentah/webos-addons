// Checks a packaged web-app .ipk before it is published: the archive is
// sideloaded, so a packaging regression (writable files, stray build junk,
// a version that disagrees with the file name) would reach every user.
// Usage: node tools/build/check-ipk.ts <file.ipk>...

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readAr, readTarGz } from '../native/native-ipk.ts';

/** Entries that must never ship in the app directory. */
const STRAY =
  /(?:^|\/)(?:Thumbs\.db|\.DS_Store|node_modules)(?:\/|$)|\.(?:map|test\.[jt]s)$/;

/** Problems found in `ipk`; `fileName` is checked against the appinfo id and version. */
export function checkIpk(ipk: Buffer, fileName: string): string[] {
  const problems: string[] = [];
  const data = readAr(ipk).find((m) => m.name.startsWith('data.tar'));
  if (!data) return ['no data.tar member'];

  const entries = readTarGz(data.data);
  const info = entries.find((e) => /(?:^|\/)appinfo\.json$/.test(e.name));
  if (!info) {
    problems.push('appinfo.json is missing');
  } else {
    const parsed = JSON.parse(info.data.toString('utf8')) as {
      id?: string;
      version?: string;
    };
    const expected = `${parsed.id}_${parsed.version}_all.ipk`;
    if (basename(fileName) !== expected) {
      problems.push(`file name ${basename(fileName)} != ${expected}`);
    }
  }

  for (const e of entries) {
    if (e.mode & 0o022) {
      problems.push(`${e.name}: group/other-writable (${e.mode.toString(8)})`);
    }
    if (e.type === '0' && e.mode & 0o111) {
      problems.push(`${e.name}: regular file is executable`);
    }
    if (STRAY.test(e.name)) problems.push(`${e.name}: stray entry`);
  }
  return problems;
}

if (import.meta.main) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: node tools/build/check-ipk.ts <file.ipk>...');
    process.exit(1);
  }
  let failed = false;
  for (const file of files) {
    const problems = checkIpk(readFileSync(file), file);
    for (const p of problems) console.error(`${file}: ${p}`);
    if (problems.length > 0) failed = true;
    else console.log(`${file}: ok`);
  }
  process.exit(failed ? 1 : 0);
}

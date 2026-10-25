// Packages dist/ into the web-app .ipk and fixes what ares-package gets wrong.
//
// ares-package copies the build host's modes: on Windows every entry comes out
// 0777/0666, on Linux it follows the umask. The modes are rewritten inside the
// archive (directories 0755, files 0644) so every host publishes the same
// bytes of metadata, then tools/build/check-ipk.ts must pass. Ownership is left
// alone on purpose: a web app writes nothing into its own directory (its state
// is localStorage), so the gid 5000 the Cobalt runtime needs buys nothing here.
//
// Usage: node tools/build/package.ts

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { normalize } from 'node:path';
import appinfo from '../../assets/appinfo.json' with { type: 'json' };
import { checkIpk } from './check-ipk.ts';
import {
  readAr,
  readTarGz,
  writeAr,
  writeTarGz
} from '../native/native-ipk.ts';
import { getVersion } from './version.ts';

/** The archive with directories 0755 and everything else 0644. */
export function normalizeModes(ipk: Buffer): Buffer {
  const members = readAr(ipk).map((member) => {
    if (!member.name.startsWith('data.tar')) return member;
    const entries = readTarGz(member.data).map((e) => ({
      ...e,
      mode: e.type === '5' ? 0o755 : 0o644
    }));
    return { name: member.name, data: writeTarGz(entries) };
  });
  return writeAr(members);
}

if (import.meta.main) {
  if (!existsSync('dist/appinfo.json')) {
    console.error('package: dist/appinfo.json is missing; run a build first');
    process.exit(1);
  }
  const entry = normalize(
    './node_modules/@webos-tools/cli/bin/ares-package.js'
  );
  const result = spawnSync(process.execPath, [entry, '-n', 'dist'], {
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status ?? 1);

  const file = `${appinfo.id}_${getVersion()}_all.ipk`;
  writeFileSync(file, normalizeModes(readFileSync(file)));
  const problems = checkIpk(readFileSync(file), file);
  for (const p of problems) console.error(`package: ${file}: ${p}`);
  if (problems.length > 0) process.exit(1);
  console.log(`package: ${file} ok`);
}

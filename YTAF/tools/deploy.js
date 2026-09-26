import { spawnSync } from 'node:child_process';
import { normalize } from 'node:path';
import { getVersion } from './version.cjs';

process.exit(
  spawnSync(
    normalize('./node_modules/.bin/ares-install'),
    [normalize(`./youtube.leanback.v4_${getVersion()}_all.ipk`)],
    { stdio: 'inherit', shell: true }
  ).status ?? 0
);

import { spawnSync } from 'node:child_process';
import { normalize } from 'node:path';
import { createRequire } from 'node:module';
import { getVersion } from './version.cjs';

const require = createRequire(import.meta.url);
const appinfo = require('../assets/appinfo.json');

/** Build, package, install and launch in one go. webOS canvas: 1920x1080 (default) or 1280x720 (opt-in). */
const APP_RESOLUTIONS = ['1920x1080', '1280x720'];
const DEFAULT_RESOLUTION = '1920x1080';

/** Parse `--resolution <value>` or `--resolution=<value>`. */
/** @param {string[]} argv */
function parseResolution(argv) {
  for (const [i, arg] of argv.entries()) {
    if (arg === '--resolution') return argv[i + 1];
    if (arg.startsWith('--resolution=')) {
      return arg.slice('--resolution='.length);
    }
  }
  return undefined;
}

const argv = process.argv.slice(2);
const resolution =
  parseResolution(argv) ?? process.env.YTX_RESOLUTION ?? DEFAULT_RESOLUTION;

if (!APP_RESOLUTIONS.includes(resolution)) {
  console.error(
    `deploy: resolution must be one of ${APP_RESOLUTIONS.join(', ')}; got ${resolution}`
  );
  process.exit(1);
}

/** Map CLI tools to node entrypoints (skip .cmd shims on Windows). */
const TOOL_ENTRIES = {
  webpack: './node_modules/webpack/bin/webpack.js',
  'ares-package': './node_modules/@webos-tools/cli/bin/ares-package.js',
  'ares-install': './node_modules/@webos-tools/cli/bin/ares-install.js',
  'ares-launch': './node_modules/@webos-tools/cli/bin/ares-launch.js'
};

/** Run a CLI step via node entrypoint. */
/** @param {string} step @param {keyof typeof TOOL_ENTRIES} tool @param {string[]} args */
function run(step, tool, args) {
  const entry = TOOL_ENTRIES[tool];
  if (!entry) {
    throw new Error(`deploy: no entrypoint mapped for "${tool}"`);
  }
  console.log(`\n[deploy] ${step}`);
  const result = spawnSync(process.execPath, [normalize(entry), ...args], {
    stdio: 'inherit'
  });

  if (result.error) {
    console.error(`[deploy] ${step} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[deploy] ${step} exited with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const ipk = `./${appinfo.id}_${getVersion()}_all.ipk`;

run('build', 'webpack', [
  '--mode=production',
  '--env',
  `resolution=${resolution}`
]);
run('package', 'ares-package', ['-n', 'dist']);
run('install', 'ares-install', [normalize(ipk)]);
run('launch', 'ares-launch', [appinfo.id]);

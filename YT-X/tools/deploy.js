import { spawnSync } from 'node:child_process';
import { normalize } from 'node:path';
import { createRequire } from 'node:module';
import { getVersion } from './version.cjs';

const require = createRequire(import.meta.url);
const appinfo = require('../assets/appinfo.json');

/**
 * Build, package, install and launch in one go.
 *
 * The order matters and so does the resolution: webOS accepts only 1920x1080
 * and 1280x720 for a web app's graphics canvas, and 1080p is the default here.
 * The 720p canvas exists to cut graphics memory or to pixel-match a 720p set,
 * so it is opt-in - `--resolution 1280x720` or YTX_RESOLUTION - rather than
 * something the tool guesses at.
 */
const APP_RESOLUTIONS = ['1920x1080', '1280x720'];
const DEFAULT_RESOLUTION = '1920x1080';

/**
 * Read `--resolution <value>` / `--resolution=<value>`, so the flag works the
 * same through npm (`npm run deploy -- --resolution ...`) and directly.
 *
 * @param {readonly string[]} argv
 * @returns {string | undefined}
 */
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

// Development inlines source maps into the bundle, which is what makes the TV
// debuggable; production is the shipped artifact. Production is the default.
const mode = argv.includes('--dev') ? 'development' : 'production';

/** Resolve an npm-installed CLI shim (adds .cmd on Windows via the shell).
 * @param {string} name */
const bin = (name) => normalize(`./node_modules/.bin/${name}`);

/**
 * @param {string} step
 * @param {string} command
 * @param {readonly string[]} args
 */
function run(step, command, args) {
  console.log(`\n[deploy] ${step}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });

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

run('build', bin('webpack'), [
  `--mode=${mode}`,
  '--env',
  `resolution=${resolution}`
]);
run('package', bin('ares-package'), ['-n', 'dist']);
run('install', bin('ares-install'), [normalize(ipk)]);
run('launch', bin('ares-launch'), [appinfo.id]);

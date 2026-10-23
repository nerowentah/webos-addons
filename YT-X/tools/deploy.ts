import { spawnSync } from 'node:child_process';
import { normalize } from 'node:path';
import appinfo from '../assets/appinfo.json' with { type: 'json' };
import { resolveUaMode } from './app-ua.ts';
import { getVersion } from './version.ts';

/** Build, package, install and launch in one go. webOS canvas: 1920x1080 (default) or 1280x720 (opt-in). */
const APP_RESOLUTIONS = ['1920x1080', '1280x720'];
const DEFAULT_RESOLUTION = '1920x1080';

/** The value after a bare flag; a missing one is an error rather than a silent default. */
function flagValue(argv: string[], i: number, flag: string): string {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(`deploy: ${flag} needs a value`);
    process.exit(1);
  }
  return value;
}

/** Parse `--resolution <value>` or `--resolution=<value>`. */
function parseResolution(argv: string[]): string | undefined {
  for (const [i, arg] of argv.entries()) {
    if (arg === '--resolution') return flagValue(argv, i, arg);
    if (arg.startsWith('--resolution=')) {
      return arg.slice('--resolution='.length);
    }
  }
  return undefined;
}

/** Parse `--ua <mode>` or `--ua=<mode>`. */
function parseUa(argv: string[]): string | undefined {
  for (const [i, arg] of argv.entries()) {
    if (arg === '--ua') return flagValue(argv, i, arg);
    if (arg.startsWith('--ua=')) return arg.slice('--ua='.length);
  }
  return undefined;
}

const argv = process.argv.slice(2);
const resolution =
  parseResolution(argv) ?? process.env['YTX_RESOLUTION'] ?? DEFAULT_RESOLUTION;

let ua: string;
try {
  ua = resolveUaMode(parseUa(argv) ?? process.env['YTX_UA']);
} catch (error) {
  console.error(`deploy: ${(error as Error).message}`);
  process.exit(1);
}

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
function run(
  step: string,
  tool: keyof typeof TOOL_ENTRIES,
  args: string[]
): void {
  const entry = TOOL_ENTRIES[tool];
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
  `resolution=${resolution}`,
  '--env',
  `ua=${ua}`
]);
run('package', 'ares-package', ['-n', 'dist']);
run('install', 'ares-install', [normalize(ipk)]);
run('launch', 'ares-launch', [appinfo.id]);

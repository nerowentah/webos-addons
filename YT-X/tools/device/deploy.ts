// Build, package, install and launch in one go. Defaults to the 1920x1080
// canvas; `--resolution` takes `fhd`/`hd` or the pixel values.

import { spawnSync } from 'node:child_process';
import { normalize } from 'node:path';
import appinfo from '../../assets/appinfo.json' with { type: 'json' };
import { resolveAppResolution } from '../build/app-resolution.ts';
import { resolveUaMode } from '../build/app-ua.ts';
import { getVersion } from '../build/version.ts';

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

let resolution: string;
let ua: string;
try {
  resolution = resolveAppResolution(
    parseResolution(argv) ?? process.env['YTX_RESOLUTION']
  );
  ua = resolveUaMode(parseUa(argv) ?? process.env['YTX_UA']);
} catch (error) {
  console.error(`deploy: ${(error as Error).message}`);
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

/** The TV's model and firmware (`ares-device -i`), which a sideloaded app's UA variables do not carry. */
function readDeviceIdentity(): string[] {
  const result = spawnSync(
    process.execPath,
    [normalize('./node_modules/@webos-tools/cli/bin/ares-device.js'), '-i'],
    { encoding: 'utf8' }
  );
  const field = (name: string) =>
    new RegExp('^' + name + String.raw`\s*:\s*(\S+)`, 'm').exec(
      result.stdout
    )?.[1];
  const model = field('modelName');
  const firmware = field('firmwareVersion');
  if (!model || !firmware) {
    console.warn(
      '[deploy] device info unavailable; the UA keeps its variables'
    );
    return [];
  }
  return ['--env', `model=${model}`, '--env', `firmware=${firmware}`];
}

run('build', 'webpack', [
  '--mode=production',
  '--env',
  `resolution=${resolution}`,
  '--env',
  `ua=${ua}`,
  ...(ua === 'cobalt' ? readDeviceIdentity() : [])
]);
run('package', 'ares-package', ['-n', 'dist']);
run('install', 'ares-install', [normalize(ipk)]);
run('launch', 'ares-launch', [appinfo.id]);

// Build, package, install and launch in one go. Defaults to the 1920x1080
// canvas; `--resolution` takes `fhd`/`hd` or the pixel values.
//
//   node tools/device/deploy.ts [--resolution fhd|hd] [--ua cobalt|webos]
//        [-d|--device <name>] [--dry-run]
//
// `-d`/`--device` (or YTX_DEVICE) picks the ares device and is forwarded to
// `ares-device -i`, `ares-install` and `ares-launch`. `--dry-run` stops after
// packaging and prints the commands it would run.
//
// Every path is resolved against the app directory, so the tool works from any
// cwd (`node YT-X/tools/device/deploy.ts` from the repo root included). The
// package step is tools/build/package.ts, not raw ares-package: it rewrites the
// host's file modes and must pass check-ipk, so deploy installs the same
// artifact CI publishes.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import appinfo from '../../assets/appinfo.json' with { type: 'json' };
import { resolveAppResolution } from '../build/app-resolution.ts';
import { resolveUaMode } from '../build/app-ua.ts';
import { getVersion } from '../build/version.ts';
import { deviceArg, hasFlag, optionValue } from './args.ts';

const APP_DIR = fileURLToPath(new URL('../..', import.meta.url));

const WEBPACK = 'node_modules/webpack/bin/webpack.js';
const PACKAGE = 'tools/build/package.ts';
/** ares entrypoints; node runs the .js directly, which avoids the .cmd shims. */
const ares = (tool: string) => `node_modules/@webos-tools/cli/bin/${tool}.js`;

interface Options {
  resolution: string;
  ua: string;
  device: string | undefined;
  dryRun: boolean;
}

function parse(): Options {
  const argv = process.argv.slice(2);
  try {
    return {
      resolution: resolveAppResolution(
        optionValue(argv, ['--resolution']) ?? process.env['YTX_RESOLUTION']
      ),
      ua: resolveUaMode(optionValue(argv, ['--ua']) ?? process.env['YTX_UA']),
      device: deviceArg(argv),
      dryRun: hasFlag(argv, '--dry-run')
    };
  } catch (error) {
    console.error(`deploy: ${(error as Error).message}`);
    process.exit(1);
  }
}

/** Run a script with the app directory as cwd. */
function run(step: string, script: string, args: readonly string[]): void {
  console.log(`\n[deploy] ${step}`);
  const result = spawnSync(process.execPath, [join(APP_DIR, script), ...args], {
    cwd: APP_DIR,
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

const deviceFlags = (device: string | undefined): string[] =>
  device === undefined ? [] : ['-d', device];

/**
 * The TV's model and firmware (`ares-device -i`). A sideloaded app's UA
 * variables come back generic ("webOS.TV", firmware 00.00.01), so the Cobalt UA
 * gets the real values baked in at build time.
 */
function readDeviceIdentity(device: string | undefined): string[] {
  const result = spawnSync(
    process.execPath,
    [join(APP_DIR, ares('ares-device')), '-i', ...deviceFlags(device)],
    { cwd: APP_DIR, encoding: 'utf8' }
  );
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const field = (name: string) =>
    new RegExp('^' + name + String.raw`\s*:\s*(\S+)`, 'm').exec(out)?.[1];
  const model = field('modelName');
  const firmware = field('firmwareVersion');
  if (!model || !firmware) {
    console.warn(
      `[deploy] device info unavailable; the UA keeps its variables\n${out.trim()}`
    );
    return [];
  }
  return ['--env', `model=${model}`, '--env', `firmware=${firmware}`];
}

const { resolution, ua, device, dryRun } = parse();
const ipk = join(APP_DIR, `${appinfo.id}_${getVersion()}_all.ipk`);

run('build', WEBPACK, [
  '--mode=production',
  '--env',
  `resolution=${resolution}`,
  '--env',
  `ua=${ua}`,
  ...(ua === 'cobalt' ? readDeviceIdentity(device) : [])
]);
run('package', PACKAGE, []);

if (dryRun) {
  console.log('\n[deploy] dry run; would run:');
  console.log(`  ares-install ${[...deviceFlags(device), ipk].join(' ')}`);
  console.log(
    `  ares-launch ${[...deviceFlags(device), appinfo.id].join(' ')}`
  );
  process.exit(0);
}

run('install', ares('ares-install'), [...deviceFlags(device), ipk]);
run('launch', ares('ares-launch'), [...deviceFlags(device), appinfo.id]);

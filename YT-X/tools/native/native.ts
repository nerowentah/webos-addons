// Native Cobalt build: package, clean and install on a dev-mode TV.
//
//   node tools/native/native.ts package --runtime <RF1705.ipk> [--out dir]
//        [--model-full 65QNED86ASA.ATSFLJD]  (sign-in device_model, via the preload)
//        [--device-strings [--model QNED86] [--firmware 33.31.75] [--year 2025]]
//   node tools/native/native.ts clean   [--device tv]
//   node tools/native/native.ts setup   --runtime <RF1705.ipk>      (clean, install, launch)
//   node tools/native/native.ts update  [--runtime <ipk> [--device-strings ...]]
//        (swap the two scripts in place; with --runtime also the binary)
//        --model-full defaults to the selected device's `ares-device -i` modelName.
//
// The runtime IPK is RF1705's prebuilt Cobalt package and is never committed.
// Run `npm run build:fhd:cobalt` first: the scripts come from dist/.
//
// Rules this tool encodes (measured on the TV, and RF1705 issue #74):
// - `cobalt` stays the stock ELF. A shell wrapper loses the Luna (LS2)
//   permissions that webOS binds to that exact path, which breaks hardware
//   video and the settings screen.
// - Every setup first removes what earlier sessions left behind, so two
//   generations of the app never share a device.
// - `update` keeps the stored session; `setup` reinstalls and drops it.
// - The stock app id `youtube.leanback.v4` is required: another id plays until
//   Cobalt registers its media luna service, then aborts (LSRegisterPubPriv FAILED).
// - Close plus relaunch within seconds aborts Cobalt at startup; wait for a full
//   exit (about 25 s or more) before relaunching.
// - After a TV reboot the app directory is 775 root and Cobalt dies (SIGILL) when
//   its storage save fails; a fresh install (`ares-install -r`, then install)
//   recreates it writable. A reinstall also drops stored sessions.
// - The IPK needs `cobalt` at mode 755 inside the tar; chmod is not possible as
//   the ssh user, so the package writer sets it.
// - Device strings are patched in the stock ELF in place (same length, exactly
//   one match), never through a wrapper.
// - Native-only code: src/native-early.ts (hooks before the document),
//   src/native-main.ts (feature modules, one by one), src/native/ (identity),
//   src/platform/cobalt-polyfills.ts. `window.__ytxNative` marks the build.
//
// Remote commands need an SSH key: `--key <file>`, YTX_SSH_KEY, or the key the
// ares device record already points at. ares stores the key's passphrase too, so
// an encrypted key is decrypted into a temporary copy for the run and deleted
// after: ssh cannot ask for the passphrase when it has no terminal, and the
// failure otherwise shows up as a bare exit 255.
//
// Remote commands also need `HostKeyAlgorithms=+ssh-rsa`: the TV's OpenSSH 6.1
// offers only ssh-rsa host keys, which OpenSSH 9 disables by default.

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { homedir, tmpdir, devNull } from 'node:os';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  patchDeviceStrings,
  untestedRuntimeNote,
  type DeviceStrings
} from './native-device.ts';
import { buildMain, buildPreload } from './native-preload.ts';
import {
  readAr,
  readTarGz,
  setFile,
  writeAr,
  writeTarGz,
  type ArMember
} from './native-ipk.ts';

const APP_ID = 'youtube.leanback.v4';
const APP_DIR = `/media/developer/apps/usr/palm/applications/${APP_ID}`;
const SCRIPT_DIR = `${APP_DIR}/content/web/adblock`;
const DATA_ROOT = `usr/palm/applications/${APP_ID}`;
const STUB_CSS = '/* YT-X injects its own styles from adblockMain.js */\n';

/** Files and folders earlier sessions left on the device; removed on every setup. */
const STALE_REMOTE_PATHS = [
  `${APP_DIR}/start.sh`,
  `${APP_DIR}/content/adblock`,
  '/media/developer/temp/ytx-native',
  '/media/developer/temp/ytx-native-run',
  '/media/developer/temp/ytx-native.log',
  '/media/developer/temp/ytx-native.log.old',
  '/tmp/adblockPreload.js',
  '/tmp/adblockMain.js',
  '/tmp/start.sh'
];
/** Packages from earlier spikes; the stock id is the only supported one. */
const STALE_PACKAGES = ['com.ytx.native'];

/** Exit gap between closing the app and launching it again; shorter ones abort Cobalt at start. */
const RELAUNCH_GAP_MS = 25_000;

const repoPath = (relative: string): string =>
  fileURLToPath(new URL(`../../${relative}`, import.meta.url));

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} needs a value`);
  }
  return value;
}

function ares(tool: string, args: readonly string[], quiet = false): string {
  const entry = normalize(
    repoPath(`node_modules/@webos-tools/cli/bin/${tool}.js`)
  );
  const result = spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8'
  });
  const out = `${result.stdout}${result.stderr}`;
  if (!quiet) process.stdout.write(out);
  if (result.status !== 0) throw new Error(`${tool} failed:\n${out}`);
  return out;
}

interface Device {
  host: string;
  port: string;
  user: string;
  name: string;
  /** ares's key file name under ~/.ssh and its stored passphrase, when set. */
  privatekey: string | undefined;
  passphrase: string | undefined;
}

function resolveDevice(name: string): Device {
  const raw = ares('ares-setup-device', ['-F', name], true);
  const list = JSON.parse(raw.slice(raw.indexOf('['))) as Array<{
    name: string;
    deviceinfo: { ip: string; port: string; user: string };
    details?: { privatekey?: string; passphrase?: string };
  }>;
  const found = list[0];
  if (!found) throw new Error(`no ares device named ${name}`);
  const { ip, port, user } = found.deviceinfo;
  return {
    name,
    host: ip,
    port,
    user,
    privatekey: found.details?.privatekey,
    passphrase: found.details?.passphrase
  };
}

/**
 * Decrypt the ares device key into a temporary copy. ssh has no terminal here,
 * so an encrypted key fails as exit 255 with no message; the passphrase that
 * ares already stores makes the run non-interactive.
 */
function aresKey(
  device: Device
): { key: string; cleanup: () => void } | undefined {
  const { privatekey, passphrase } = device;
  if (!privatekey) return undefined;
  const source = join(homedir(), '.ssh', privatekey);
  if (!existsSync(source)) return undefined;
  if (!passphrase) return { key: source, cleanup: () => {} };

  const dir = mkdtempSync(join(tmpdir(), 'ytx-key-'));
  const key = join(dir, privatekey);
  copyFileSync(source, key);
  const result = spawnSync(
    'ssh-keygen',
    ['-p', '-P', passphrase, '-N', '', '-f', key],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    console.warn(
      `native: could not decrypt ${source}; pass --key <unencrypted key>\n` +
        `${result.stderr ?? result.stdout ?? ''}`.trimEnd()
    );
    return undefined;
  }
  return { key, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** The selected TV's full SKU, which the sign-in identity sends as device_model. */
function readModelFull(deviceName: string): string | undefined {
  try {
    const out = ares('ares-device', ['-d', deviceName, '-i'], true);
    return /^modelName\s*:\s*(\S+)/m.exec(out)?.[1];
  } catch {
    return undefined;
  }
}

function sshArgs(device: Device, key: string): string[] {
  return [
    '-q',
    '-i',
    key,
    '-p',
    device.port,
    '-o',
    'HostKeyAlgorithms=+ssh-rsa',
    '-o',
    'PubkeyAcceptedAlgorithms=+ssh-rsa',
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    `UserKnownHostsFile=${devNull}`,
    '-o',
    'ConnectTimeout=10',
    `${device.user}@${device.host}`
  ];
}

function remote(device: Device, key: string, script: string): string {
  const result = spawnSync('ssh', [...sshArgs(device, key), script], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`ssh failed (${result.status}): ${result.stderr}`);
  }
  return result.stdout;
}

function push(device: Device, key: string, local: string, to: string): void {
  const args = sshArgs(device, key);
  // scp wants -P for the port and does not take the user@host as a trailing argument.
  const result = spawnSync(
    'scp',
    [
      '-q',
      '-i',
      key,
      '-P',
      device.port,
      '-o',
      'HostKeyAlgorithms=+ssh-rsa',
      '-o',
      'PubkeyAcceptedAlgorithms=+ssh-rsa',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      `UserKnownHostsFile=${devNull}`,
      local,
      `${args[args.length - 1]}:${to}`
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`scp failed: ${result.stderr}`);
}

function isRunning(device: string): boolean {
  return ares('ares-launch', ['-d', device, '-r'], true).includes(APP_ID);
}

/** Closes the app and waits until it has really exited. */
async function closeApp(device: string): Promise<void> {
  if (!isRunning(device)) return;
  try {
    ares('ares-launch', ['-d', device, '-c', APP_ID], true);
  } catch {
    // Already gone.
  }
  /* eslint-disable no-await-in-loop -- poll until the process is gone */
  for (let i = 0; i < 40 && isRunning(device); i++) await sleep(1500);
  /* eslint-enable no-await-in-loop */
}

/** The scripts the native package carries, from the current dist/ build. */
function nativeScripts(modelFull: string): { preload: string; main: string } {
  const early = readFileSync(repoPath('dist/native/nativeEarly.js'), 'utf8');
  const full = readFileSync(repoPath('dist/native/nativeMain.js'), 'utf8');
  return { preload: buildPreload(early, modelFull), main: buildMain(full) };
}

interface PackageOptions {
  runtime: string;
  out: string;
  /** Same-length replacements for the stock platform strings; see patchDeviceStrings(). */
  deviceStrings: DeviceStrings | undefined;
  /** Sign-in device_model; empty leaves the stock value. */
  modelFull: string;
}

function buildPackage(options: PackageOptions): string {
  const members = readAr(readFileSync(options.runtime));
  const data = members.find((m) => m.name === 'data.tar.gz');
  const control = members.find((m) => m.name === 'control.tar.gz');
  const marker = members.find((m) => m.name === 'debian-binary');
  if (!data || !control || !marker) {
    throw new Error('runtime IPK is missing ar members');
  }

  const entries = readTarGz(data.data);
  const info = entries.find((e) => e.name === `${DATA_ROOT}/appinfo.json`);
  let runtimeVersion: string | undefined;
  try {
    runtimeVersion = (
      JSON.parse(info?.data.toString('utf8') ?? '{}') as { version?: string }
    ).version;
  } catch {
    runtimeVersion = undefined;
  }
  const note = untestedRuntimeNote(runtimeVersion);
  if (note) console.warn(`native: warning: ${note}`);
  const scripts = nativeScripts(options.modelFull);
  const adblock = `${DATA_ROOT}/content/web/adblock`;
  setFile(
    entries,
    `${adblock}/adblockPreload.js`,
    Buffer.from(scripts.preload)
  );
  setFile(entries, `${adblock}/adblockMain.js`, Buffer.from(scripts.main));
  setFile(entries, `${adblock}/adblockMain.css`, Buffer.from(STUB_CSS));

  if (options.deviceStrings !== undefined) {
    const elf = entries.find((e) => e.name === `${DATA_ROOT}/cobalt`);
    if (!elf) throw new Error('runtime IPK has no cobalt binary');
    elf.data = patchDeviceStrings(elf.data, options.deviceStrings);
  }

  const out: ArMember[] = [
    marker,
    control,
    { name: 'data.tar.gz', data: writeTarGz(entries) }
  ];
  mkdirSync(options.out, { recursive: true });
  const file = join(options.out, `${APP_ID}_native_arm.ipk`);
  writeFileSync(file, writeAr(out));
  console.log(`native: wrote ${file}`);
  return file;
}

async function clean(device: Device, key: string): Promise<void> {
  console.log('native: closing the running app');
  await closeApp(device.name);

  const installed = ares('ares-install', ['-d', device.name, '--list'], true);
  for (const pkg of STALE_PACKAGES) {
    if (!installed.includes(pkg)) continue;
    console.log(`native: removing stale package ${pkg}`);
    ares('ares-install', ['-d', device.name, '-r', pkg], true);
  }

  console.log('native: removing launcher scripts and stale files');
  const rm = STALE_REMOTE_PATHS.map((p) => `rm -rf '${p}'`).join('; ');
  // A wrapper script at `cobalt` is replaced by the ELF it moved aside.
  const script = [
    `if [ -e '${APP_DIR}/cobalt.real' ]; then mv -f '${APP_DIR}/cobalt.real' '${APP_DIR}/cobalt'; fi`,
    rm,
    `rm -f '${APP_DIR}'/core.* 2>/dev/null`,
    `if [ -e '${APP_DIR}/cobalt' ] && [ "$(head -c 4 '${APP_DIR}/cobalt' | od -An -c | tr -d ' ')" != '177ELF' ]; then echo NOT_ELF; fi`
  ].join('; ');
  const output = remote(device, key, script);
  if (output.includes('NOT_ELF')) {
    console.warn(
      'native: cobalt is not an ELF; reinstall the package (setup does)'
    );
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const deviceName = flag(rest, '--device') ?? 'tv';
  const keyFlag = flag(rest, '--key') ?? process.env['YTX_SSH_KEY'];
  const modelFullFlag = flag(rest, '--model-full');
  const runtime = flag(rest, '--runtime') ?? process.env['YTX_NATIVE_RUNTIME'];
  const out = flag(rest, '--out') ?? repoPath('dist-native');
  const deviceStrings: DeviceStrings | undefined = rest.includes(
    '--device-strings'
  )
    ? {
        model: flag(rest, '--model') ?? 'webOS TV',
        firmware: flag(rest, '--firmware') ?? '1.0',
        year: flag(rest, '--year') ?? '2025'
      }
    : undefined;

  let key: string | undefined;
  let cleanupKey: (() => void) | undefined;
  process.on('exit', () => cleanupKey?.());

  const needRuntime = (): string => {
    if (!runtime) throw new Error('--runtime <RF1705.ipk> is required');
    return runtime;
  };
  const needKey = (device: Device): string => {
    if (key !== undefined) return key;
    if (keyFlag !== undefined) {
      key = keyFlag;
      return key;
    }
    const derived = aresKey(device);
    if (!derived) {
      throw new Error(
        'no SSH key: pass --key <file>, set YTX_SSH_KEY, or store the passphrase on the ares device'
      );
    }
    cleanupKey = derived.cleanup;
    key = derived.key;
    return key;
  };
  /** `--model-full`, else the selected TV's SKU; `''` when neither is available. */
  const modelFull = (device: Device): string =>
    modelFullFlag ?? readModelFull(device.name) ?? '';

  switch (command) {
    case 'package':
      buildPackage({
        runtime: needRuntime(),
        out,
        deviceStrings,
        // A release package must not carry this machine's TV identity.
        modelFull: modelFullFlag ?? ''
      });
      return;
    case 'clean': {
      const device = resolveDevice(deviceName);
      await clean(device, needKey(device));
      return;
    }
    case 'setup': {
      const device = resolveDevice(deviceName);
      const file = buildPackage({
        runtime: needRuntime(),
        out,
        deviceStrings,
        modelFull: modelFull(device)
      });
      await clean(device, needKey(device));
      // The stock id is also the userscript app's id: reinstalling replaces it.
      try {
        ares('ares-install', ['-d', device.name, '-r', APP_ID], true);
      } catch {
        // Not installed yet.
      }
      ares('ares-install', ['-d', device.name, file]);
      console.log(`native: waiting ${RELAUNCH_GAP_MS / 1000}s before launch`);
      await sleep(RELAUNCH_GAP_MS);
      ares('ares-launch', ['-d', device.name, APP_ID]);
      return;
    }
    case 'update': {
      const device = resolveDevice(deviceName);
      const scripts = nativeScripts(modelFull(device));
      if (runtime) {
        // A new patched binary goes in beside the old one and is renamed over it, so the stored session stays.
        const entries = readTarGz(
          readAr(readFileSync(runtime)).find((m) => m.name === 'data.tar.gz')
            ?.data ?? Buffer.alloc(0)
        );
        const elf = entries.find((e) => e.name === `${DATA_ROOT}/cobalt`);
        if (!elf) throw new Error('runtime IPK has no cobalt binary');
        const body = deviceStrings
          ? patchDeviceStrings(elf.data, deviceStrings)
          : elf.data;
        const tmp = join(process.env['TEMP'] ?? '.', 'ytx-native-update');
        mkdirSync(tmp, { recursive: true });
        const local = join(tmp, 'cobalt');
        writeFileSync(local, body);
        await closeApp(device.name);
        push(device, needKey(device), local, `${APP_DIR}/cobalt.new`);
        remote(
          device,
          needKey(device),
          `chmod 755 '${APP_DIR}/cobalt.new' && mv -f '${APP_DIR}/cobalt.new' '${APP_DIR}/cobalt'`
        );
      }
      const dir = join(process.env['TEMP'] ?? '.', 'ytx-native-update');
      mkdirSync(dir, { recursive: true });
      await closeApp(device.name);
      for (const [name, body] of [
        ['adblockPreload.js', scripts.preload],
        ['adblockMain.js', scripts.main]
      ] as const) {
        const local = join(dir, name);
        writeFileSync(local, body);
        // The shipped files belong to root (644), but the folder is group-writable: write beside it and rename over it.
        push(device, needKey(device), local, `${SCRIPT_DIR}/${name}.new`);
        remote(
          device,
          needKey(device),
          `mv -f '${SCRIPT_DIR}/${name}.new' '${SCRIPT_DIR}/${name}'`
        );
      }
      console.log(`native: waiting ${RELAUNCH_GAP_MS / 1000}s before launch`);
      await sleep(RELAUNCH_GAP_MS);
      ares('ares-launch', ['-d', device.name, APP_ID]);
      return;
    }
    default:
      throw new Error(
        'usage: node tools/native/native.ts <package|clean|setup|update> [options]'
      );
  }
}

main().catch((error: unknown) => {
  console.error(`native: ${(error as Error).message}`);
  process.exit(1);
});

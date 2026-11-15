// The pinned Cobalt runtime: which IPK the native build is made from, how it is
// fetched and verified, and what YT-X needs to find inside it.
//
// runtime.lock.json names one exact file (URL, sha256, size) and the sources it
// was built from. `resolveRuntime()` returns a local path to it, downloading it
// once into node_modules/.cache/ytx-runtime; an explicit `--runtime <file>` or
// YTX_NATIVE_RUNTIME bypasses the lock. `checkRuntimeContract()` then checks the
// injection points themselves, so a runtime built elsewhere (or a newer one)
// fails with a clear message instead of producing a package that does nothing.

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pinned from './runtime.lock.json' with { type: 'json' };
import type { TarEntry } from './native-ipk.ts';

export interface RuntimeLock {
  version: string;
  url: string;
  sha256: string;
  size: number;
}

export const RUNTIME_LOCK: RuntimeLock = pinned;

const DEFAULT_CACHE_DIR = fileURLToPath(
  new URL('../../node_modules/.cache/ytx-runtime', import.meta.url)
);

const sha256 = (data: Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/** Throws unless `data` is exactly the file the lock names. */
export function verifyRuntime(data: Buffer, lock: RuntimeLock): void {
  if (data.length !== lock.size) {
    throw new Error(
      `runtime ${lock.version}: size ${data.length}, the lock expects ${lock.size}`
    );
  }
  const actual = sha256(data);
  if (actual !== lock.sha256) {
    throw new Error(
      `runtime ${lock.version}: sha256 ${actual}, the lock expects ${lock.sha256}`
    );
  }
}

export function cachePath(
  lock: RuntimeLock,
  cacheDir = DEFAULT_CACHE_DIR
): string {
  return join(cacheDir, `${lock.sha256}.ipk`);
}

export type Download = (url: string) => Promise<Buffer>;

async function downloadHttps(url: string): Promise<Buffer> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`runtime download failed: HTTP ${response.status} ${url}`);
  }
  if (!response.url.startsWith('https://')) {
    throw new Error(`runtime download left https: ${response.url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export interface ResolveOptions {
  lock?: RuntimeLock;
  cacheDir?: string;
  download?: Download;
}

/**
 * A local path to the runtime IPK. `explicit` (a file the caller chose) is
 * returned as is; otherwise the locked file comes from the cache, or is
 * downloaded, verified and cached. A cached file that no longer matches the
 * lock is dropped and fetched again.
 */
export async function resolveRuntime(
  explicit: string | undefined,
  options: ResolveOptions = {}
): Promise<string> {
  if (explicit !== undefined) {
    if (!existsSync(explicit)) {
      throw new Error(`runtime IPK not found: ${explicit}`);
    }
    return explicit;
  }

  const lock = options.lock ?? RUNTIME_LOCK;
  const file = cachePath(lock, options.cacheDir);
  if (existsSync(file)) {
    try {
      verifyRuntime(readFileSync(file), lock);
      return file;
    } catch (error) {
      console.warn(
        `native: cached runtime rejected (${(error as Error).message}); fetching it again`
      );
      rmSync(file, { force: true });
    }
  }

  if (!lock.url.startsWith('https://')) {
    throw new Error(`runtime lock URL must be https: ${lock.url}`);
  }
  console.log(`native: fetching runtime ${lock.version} from ${lock.url}`);
  const data = await (options.download ?? downloadHttps)(lock.url);
  verifyRuntime(data, lock);

  // Written beside the target and renamed, so an interrupted run leaves no half file under the final name.
  mkdirSync(dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.part`;
  writeFileSync(partial, data);
  renameSync(partial, file);
  console.log(
    `native: runtime ${lock.version} verified (sha256 ${lock.sha256})`
  );
  return file;
}

/** Strings the Cobalt binary must contain: the paths its two injection hooks read. */
const INJECTION_LITERALS = [
  '/web/adblock/adblockPreload.js',
  'file:///adblock/adblockMain.js'
] as const;

const INJECTED_FILES = [
  'adblockPreload.js',
  'adblockMain.js',
  'adblockMain.css'
] as const;

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

/**
 * Checks that a runtime package has what YT-X injects into, and throws one
 * error listing everything that is missing. The device-string anchors are not
 * checked here: patchDeviceStrings() already demands exactly one match each.
 */
export function checkRuntimeContract(
  entries: readonly TarEntry[],
  appId: string
): void {
  const root = `usr/palm/applications/${appId}`;
  const find = (path: string): TarEntry | undefined =>
    entries.find((entry) => entry.name === `${root}/${path}`);
  const problems: string[] = [];

  const info = find('appinfo.json');
  if (info) {
    let parsed: { id?: string; type?: string; main?: string } = {};
    try {
      parsed = JSON.parse(info.data.toString('utf8')) as typeof parsed;
    } catch {
      problems.push('appinfo.json is not valid JSON');
    }
    if (parsed.id !== appId) problems.push(`appinfo.json id is not ${appId}`);
    if (parsed.type !== 'native')
      problems.push('appinfo.json type is not native');
    if (parsed.main !== 'cobalt')
      problems.push('appinfo.json main is not cobalt');
  } else {
    problems.push(`no ${root}/appinfo.json`);
  }

  const elf = find('cobalt');
  if (!elf) {
    problems.push(`no ${root}/cobalt binary`);
  } else if (!elf.data.subarray(0, 4).equals(ELF_MAGIC)) {
    problems.push('cobalt is not an ELF binary');
  } else {
    for (const literal of INJECTION_LITERALS) {
      if (!elf.data.includes(Buffer.from(literal, 'latin1'))) {
        problems.push(`cobalt has no "${literal}" injection hook`);
      }
    }
  }

  for (const name of INJECTED_FILES) {
    if (!find(`content/web/adblock/${name}`)) {
      problems.push(`no content/web/adblock/${name} to replace`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `the runtime IPK does not match what YT-X injects into:\n  - ${problems.join('\n  - ')}`
    );
  }
}

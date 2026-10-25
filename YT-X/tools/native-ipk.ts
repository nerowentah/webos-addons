// Reading and rewriting the native Cobalt IPK without external tools: an IPK is
// an `ar` archive of debian-binary, control.tar.gz and data.tar.gz, and the two
// tarballs are plain ustar. Pure functions, so they run under `node --test`.

import { gunzipSync, gzipSync } from 'node:zlib';

export interface ArMember {
  name: string;
  data: Buffer;
}

export interface TarEntry {
  /** Path as stored, without a leading "./". */
  name: string;
  mode: number;
  uid: number;
  gid: number;
  mtime: number;
  /** ustar type flag: '0' file, '5' directory, '2' symlink. */
  type: string;
  linkname: string;
  data: Buffer;
}

const AR_MAGIC = '!<arch>\n';
const BLOCK = 512;

const text = (buf: Buffer, start: number, length: number): string => {
  const raw = buf.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
};

const octal = (buf: Buffer, start: number, length: number): number => {
  const value = text(buf, start, length).trim();
  return value === '' ? 0 : parseInt(value, 8);
};

export function readAr(archive: Buffer): ArMember[] {
  if (archive.subarray(0, AR_MAGIC.length).toString('latin1') !== AR_MAGIC) {
    throw new Error('not an ar archive');
  }
  const members: ArMember[] = [];
  let pos = AR_MAGIC.length;
  while (pos + 60 <= archive.length) {
    const name = archive
      .subarray(pos, pos + 16)
      .toString('latin1')
      .trim()
      .replace(/\/$/, '');
    const size = parseInt(
      archive
        .subarray(pos + 48, pos + 58)
        .toString('latin1')
        .trim(),
      10
    );
    if (Number.isNaN(size)) throw new Error(`bad ar header at ${pos}`);
    const start = pos + 60;
    members.push({ name, data: archive.subarray(start, start + size) });
    pos = start + size + (size & 1);
  }
  return members;
}

export function writeAr(members: readonly ArMember[]): Buffer {
  const parts: Buffer[] = [Buffer.from(AR_MAGIC, 'latin1')];
  const now = Math.floor(Date.now() / 1000);
  for (const { name, data } of members) {
    if (name.length > 15) throw new Error(`ar member name too long: ${name}`);
    const header =
      `${name}/`.padEnd(16) +
      String(now).padEnd(12) +
      '0'.padEnd(6) +
      '0'.padEnd(6) +
      '100644'.padEnd(8) +
      String(data.length).padEnd(10) +
      '`\n';
    parts.push(Buffer.from(header, 'latin1'), data);
    if (data.length & 1) parts.push(Buffer.from('\n', 'latin1'));
  }
  return Buffer.concat(parts);
}

export function readTarGz(archive: Buffer): TarEntry[] {
  const tar = gunzipSync(archive);
  const entries: TarEntry[] = [];
  let longName: string | undefined;
  let pos = 0;
  while (pos + BLOCK <= tar.length) {
    const header = tar.subarray(pos, pos + BLOCK);
    if (header.every((byte) => byte === 0)) break;

    const size = octal(header, 124, 12);
    const type = text(header, 156, 1) || '0';
    const body = tar.subarray(pos + BLOCK, pos + BLOCK + size);
    pos += BLOCK + Math.ceil(size / BLOCK) * BLOCK;

    if (type === 'L') {
      longName = text(body, 0, body.length);
      continue;
    }

    const prefix = text(header, 345, 155);
    const base = longName ?? text(header, 0, 100);
    longName = undefined;
    const joined = prefix === '' ? base : `${prefix}/${base}`;
    entries.push({
      name: joined.replace(/^\.\//, '').replace(/\/$/, ''),
      mode: octal(header, 100, 8),
      uid: octal(header, 108, 8),
      gid: octal(header, 116, 8),
      mtime: octal(header, 136, 12),
      type,
      linkname: text(header, 157, 100),
      data: Buffer.from(body)
    });
  }
  return entries;
}

const putOctal = (
  header: Buffer,
  start: number,
  length: number,
  value: number
): void => {
  header.write(value.toString(8).padStart(length - 1, '0'), start, 'latin1');
};

/** Splits a path over the ustar name and prefix fields, or throws when it cannot. */
function splitPath(path: string): { name: string; prefix: string } {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
  const slash = path.lastIndexOf('/', 100 + 155);
  const name = path.slice(slash + 1);
  const prefix = path.slice(0, slash);
  if (
    slash === -1 ||
    Buffer.byteLength(name) > 100 ||
    Buffer.byteLength(prefix) > 155
  ) {
    throw new Error(`path too long for ustar: ${path}`);
  }
  return { name, prefix };
}

export function writeTarGz(entries: readonly TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const isDir = entry.type === '5';
    const stored = isDir ? `${entry.name}/` : entry.name;
    const { name, prefix } = splitPath(stored);
    const header = Buffer.alloc(BLOCK);
    header.write(name, 0, 'utf8');
    putOctal(header, 100, 8, entry.mode);
    putOctal(header, 108, 8, entry.uid);
    putOctal(header, 116, 8, entry.gid);
    putOctal(header, 124, 12, isDir ? 0 : entry.data.length);
    putOctal(header, 136, 12, entry.mtime);
    header.write('        ', 148, 'latin1'); // checksum placeholder
    header.write(entry.type, 156, 'latin1');
    header.write(entry.linkname, 157, 'utf8');
    header.write('ustar\0', 257, 'latin1');
    header.write('00', 263, 'latin1');
    header.write(prefix, 345, 'utf8');

    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'latin1');

    parts.push(header);
    if (!isDir && entry.data.length > 0) {
      parts.push(entry.data);
      const pad = (BLOCK - (entry.data.length % BLOCK)) % BLOCK;
      if (pad > 0) parts.push(Buffer.alloc(pad));
    }
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

/** Replaces the file at `path` (keeping its metadata) or adds it as a copy of `like`. */
export function setFile(
  entries: TarEntry[],
  path: string,
  data: Buffer,
  like?: string
): void {
  const existing = entries.find((entry) => entry.name === path);
  if (existing) {
    existing.data = data;
    return;
  }
  const template = entries.find((entry) => entry.name === like);
  if (!template) throw new Error(`no entry ${path} and no template ${like}`);
  entries.push({ ...template, name: path, data });
}

/**
 * Replaces `from` with `to` in `binary`, NUL-padding the remainder, and
 * insists on exactly one match so a layout change in a new runtime fails the
 * build instead of corrupting it. `to` must not be longer than `from`.
 */
export function patchCString(binary: Buffer, from: string, to: string): Buffer {
  const needle = Buffer.from(`\0${from}\0`, 'latin1');
  const replacement = Buffer.alloc(needle.length);
  const value = Buffer.from(to, 'latin1');
  if (value.length > from.length) {
    throw new Error(`"${to}" does not fit in "${from}"`);
  }
  value.copy(replacement, 1);

  const first = binary.indexOf(needle);
  if (first === -1 || binary.indexOf(needle, first + 1) !== -1) {
    throw new Error(`expected exactly one "${from}" in the binary`);
  }
  const out = Buffer.from(binary);
  replacement.copy(out, first);
  return out;
}

/**
 * Replaces the byte run `from` with an equally long `to`, again demanding
 * exactly one match. For values whose neighbours are not NUL (a number glued to
 * the previous field), pinned by the string that follows them.
 */
export function patchBytes(binary: Buffer, from: Buffer, to: Buffer): Buffer {
  if (from.length !== to.length) {
    throw new Error('patchBytes needs equal lengths');
  }
  const first = binary.indexOf(from);
  if (first === -1 || binary.indexOf(from, first + 1) !== -1) {
    throw new Error(
      `expected exactly one match for ${from.toString('latin1')}`
    );
  }
  const out = Buffer.from(binary);
  to.copy(out, first);
  return out;
}

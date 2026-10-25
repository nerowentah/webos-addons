// Homebrew Channel metadata shared by gen-manifest.ts and gen-repo.ts: one
// package entry per IPK, so the single-app manifest and the repository feed
// cannot drift apart.

import crypto from 'node:crypto';
import fs from 'node:fs';

export interface IpkMeta {
  sha256: string;
  size: number;
}

export function ipkMeta(file: string): IpkMeta {
  const data = fs.readFileSync(file);
  return {
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    size: data.length
  };
}

export interface AppInfoLike {
  id: string;
  type: string;
  title: string;
}

export interface PackageEntry {
  id: string;
  version: string;
  type: string;
  title: string;
  iconUri: string;
  sourceUrl: string;
  rootRequired: false;
  ipkUrl: string;
  ipkHash: { sha256: string };
  ipkSize: number;
}

/** One package entry; `ipkUrl` is a bare file name for a manifest, absolute for a feed. */
export function buildPackage(args: {
  appinfo: AppInfoLike;
  version: string;
  ipkUrl: string;
  meta: IpkMeta;
  owner: string;
  repo: string;
}): PackageEntry {
  const { appinfo, version, ipkUrl, meta, owner, repo } = args;
  return {
    id: appinfo.id,
    version,
    type: appinfo.type,
    title: appinfo.title,
    iconUri: `https://raw.githubusercontent.com/${owner}/${repo}/main/YT-X/assets/extraLargeIcon.png`,
    sourceUrl: `https://github.com/${owner}/${repo}`,
    rootRequired: false,
    ipkUrl,
    ipkHash: { sha256: meta.sha256 },
    ipkSize: meta.size
  };
}

/** The `ipkUrl` for a release asset, from the release download base URL. */
export function releaseIpkUrl(baseUrl: string, ipkFile: string): string {
  if (!/^https:\/\//.test(baseUrl)) {
    throw new Error('base URL must be https');
  }
  return `${baseUrl.replace(/\/+$/, '')}/${ipkFile}`;
}

export function buildFeed(packages: readonly PackageEntry[]): {
  packages: readonly PackageEntry[];
} {
  return { packages };
}

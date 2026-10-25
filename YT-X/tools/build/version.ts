import { spawnSync } from 'node:child_process';
import path from 'node:path';
import pkgJson from '../../package.json' with { type: 'json' };

// Resolve from this module (cwd varies by caller).
const APP_DIR = path.resolve(import.meta.dirname, '..', '..');

// Cache git results per process (manifest reads version twice; HEAD stable).
let cachedBuild: number | null | undefined;
let cachedSha: string | null | undefined;
let cachedVersion: string | undefined;

/** Run git with cwd pinned to APP_DIR (repo may be parent). */
function runGit(args: string[]): string | null {
  const result = spawnSync('git', args, {
    cwd: APP_DIR,
    encoding: 'utf8'
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

/** Short SHA of HEAD. */
function getGitShortSha(): string | null {
  if (cachedSha !== undefined) return cachedSha;
  cachedSha = runGit(['rev-parse', '--short', 'HEAD']);
  return cachedSha;
}

/** Get repo-root-relative git pathspec for this app (`''` if app is root). */
function getAppPathspec(): string | null {
  const prefix = runGit(['rev-parse', '--show-prefix']);
  if (prefix === null) return null;
  if (prefix === '') return '';
  return `:(top)${prefix.replace(/\\/g, '/')}`;
}

/** Commits that touched this app (not whole repo). */
function getBuildNumber(): number | null {
  if (cachedBuild !== undefined) return cachedBuild;
  cachedBuild = null;
  const pathspec = getAppPathspec();
  if (pathspec === null) return cachedBuild;
  const args = ['rev-list', '--count', 'HEAD'];
  if (pathspec !== '') args.push('--', pathspec);
  const count = runGit(args);
  if (count === null) return cachedBuild;
  const parsed = Number.parseInt(count, 10);
  cachedBuild = Number.isFinite(parsed) ? parsed : null;
  return cachedBuild;
}

/** Parse numeric version component (default 0 if malformed). */
function toVersionPart(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Version: major.minor.patch (patch = max(build count, pkg patch). 3-part for webOS). */
export function getVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;
  const build = getBuildNumber();
  if (build === null) {
    cachedVersion = pkgJson.version;
    return cachedVersion;
  }
  const [major, minor, patch] = pkgJson.version.split('.');
  const floor = toVersionPart(patch);
  cachedVersion = `${toVersionPart(major)}.${toVersionPart(minor)}.${Math.max(build, floor)}`;
  return cachedVersion;
}

/** Extract repo URL from package.json repository (string or {url}). */
function repositoryUrl(repository: unknown): string | undefined {
  if (typeof repository === 'string') return repository;
  if (
    repository !== null &&
    typeof repository === 'object' &&
    'url' in repository &&
    typeof repository.url === 'string'
  ) {
    return repository.url;
  }
  return undefined;
}

/** Parse owner/repo from package.json repository (shorthand or URL). */
export function getRepository(): { owner: string; repo: string } | null {
  const value = repositoryUrl(pkgJson.repository);
  if (value === undefined || value === '') return null;

  const slug = value
    .replace(/^github:/, '')
    .replace(/^git\+/, '')
    .replace(/^https?:\/\/(?:www\.)?github\.com\//, '')
    .replace(/\.git$/, '');
  const [owner, repo] = slug.split('/');
  if (!owner || !repo) return null;
  return { owner, repo };
}

/** Get publishing owner (undefined if repo not parseable). */
function getOwner(): string | undefined {
  return getRepository()?.owner;
}

export function getVersionInfo(): {
  version: string;
  gitSha: string | null;
  owner: string | undefined;
} {
  return { version: getVersion(), gitSha: getGitShortSha(), owner: getOwner() };
}

if (import.meta.main) {
  process.stdout.write(`${JSON.stringify(getVersionInfo())}\n`);
}

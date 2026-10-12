#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const pkgJson = require('../package.json');

// Resolved from this module's own location rather than the process cwd, which
// varies by caller (webpack, deploy, and the manifest each start differently).
const APP_DIR = path.dirname(require.resolve('../package.json'));

// Resolved once per process: these shell out to git, and callers read them more
// than once (the manifest reads the version twice). Caching also guarantees a
// single build cannot observe two different answers if HEAD moves mid-run.
// `undefined` means "not computed yet", distinct from a cached `null` result.
/** @type {number | null | undefined} */
let cachedBuild;
/** @type {string | null | undefined} */
let cachedSha;
/** @type {string | undefined} */
let cachedVersion;

/**
 * Run a git command with the working directory pinned to this app. Git walks up
 * to the enclosing repository (this app is not its own git repo in this
 * checkout), so the cwd must be pinned rather than inherited: a pathspec is
 * resolved relative to the cwd, and an inherited cwd would make the same call
 * return different results depending on where the process was started.
 *
 * @param {readonly string[]} args
 * @returns {string | null}
 */
function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: APP_DIR,
    encoding: 'utf8'
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

/**
 * @returns {string | null} Short SHA of HEAD (e.g. "e4fd19f").
 */
function getGitShortSha() {
  if (cachedSha !== undefined) return cachedSha;
  cachedSha = runGit(['rev-parse', '--short', 'HEAD']);
  return cachedSha;
}

/**
 * Repo-root-relative path of this app, as a git pathspec. The `:(top)` magic
 * anchors the pathspec to the repository root, so the result is the same no
 * matter which directory git is invoked from. Resolved at runtime rather than
 * hardcoded so the app keeps working if it moves within the enclosing repo.
 *
 * @returns {string | null} The pathspec, `''` when this app is the repository
 *   root, or `null` when git is unavailable.
 */
function getAppPathspec() {
  const prefix = runGit(['rev-parse', '--show-prefix']);
  if (prefix === null) return null;
  if (prefix === '') return '';
  return `:(top)${prefix.replace(/\\/g, '/')}`;
}

/**
 * Commits that actually touched this app. Counting the whole enclosing repo
 * would bump the version for unrelated changes anywhere in the monorepo, so
 * the count is restricted to this app's paths.
 *
 * @returns {number | null}
 */
function getBuildNumber() {
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

/**
 * Parse one numeric version component, tolerating malformed package.json
 * versions rather than emitting "NaN" or silently dropping a component.
 *
 * @param {string | undefined} value
 * @returns {number}
 */
function toVersionPart(value) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Version used everywhere (appinfo.json, IPK filename, Homebrew manifest,
 * UI badge). ares-package and webOS require exactly three numeric parts
 * (major.minor.patch), so the package.json base contributes the major and
 * minor while the app's commit count fills the patch. This keeps every build
 * distinct and increasing. Falls back to the package.json version when git is
 * unavailable.
 *
 * The patch never drops below package.json's own patch. A rebase or history
 * squash can lower the commit count, and webOS compares versions, so shipping
 * a lower number would look like a downgrade. Raising the package.json patch
 * pins a floor for a release that must not be undercut.
 *
 * @returns {string}
 */
function getVersion() {
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

/**
 * Extract a clone URL from package.json's `repository`, which npm allows to be
 * either a shorthand string ("github:user/repo") or an object with a `url`.
 *
 * @param {unknown} repository
 * @returns {string | undefined}
 */
function repositoryUrl(repository) {
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

/**
 * The GitHub owner/repo pair this app is published under, parsed from
 * package.json's `repository`.
 *
 * package.json is the single source of truth: there is no owner field of its
 * own, and hardcoding the name in the UI badge and the Homebrew manifest meant
 * two extra places to edit if the fork moves. Both spellings npm allows are
 * handled - the shorthand "github:user/repo" and a full URL, with or without a
 * git+ prefix or .git suffix.
 *
 * @returns {{ owner: string, repo: string } | null}
 */
function getRepository() {
  const value = repositoryUrl(pkgJson.repository);
  if (value === undefined || value === '') return null;

  const path = value
    .replace(/^github:/, '')
    .replace(/^git\+/, '')
    .replace(/^https?:\/\/(?:www\.)?github\.com\//, '')
    .replace(/\.git$/, '');
  const [owner, repo] = path.split('/');
  if (!owner || !repo) return null;
  return { owner, repo };
}

/**
 * The publishing owner, for the UI version badge and the Homebrew manifest.
 * `undefined` when package.json does not name a parseable repository.
 *
 * @returns {string | undefined}
 */
function getOwner() {
  return getRepository()?.owner;
}

/**
 * @returns {{ version: string, gitSha: string | null, owner: string | undefined }}
 */
function getVersionInfo() {
  return { version: getVersion(), gitSha: getGitShortSha(), owner: getOwner() };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(getVersionInfo())}\n`);
}

module.exports = {
  getGitShortSha,
  getBuildNumber,
  getVersion,
  getVersionInfo,
  getRepository,
  getOwner
};

#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const pkgJson = require('../package.json');

// Resolve from this module (cwd varies by caller).
const APP_DIR = path.dirname(require.resolve('../package.json'));

// Cache git results per process (manifest reads version twice; HEAD stable).
/** @type {number | null | undefined} */
let cachedBuild;
/** @type {string | null | undefined} */
let cachedSha;
/** @type {string | undefined} */
let cachedVersion;

/** Run git with cwd pinned to APP_DIR (repo may be parent). */
/** @param {string[]} args */
function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: APP_DIR,
    encoding: 'utf8'
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

/** @returns {string | null} Short SHA of HEAD. */
function getGitShortSha() {
  if (cachedSha !== undefined) return cachedSha;
  cachedSha = runGit(['rev-parse', '--short', 'HEAD']);
  return cachedSha;
}

/** Get repo-root-relative git pathspec for this app (`''` if app is root). */
function getAppPathspec() {
  const prefix = runGit(['rev-parse', '--show-prefix']);
  if (prefix === null) return null;
  if (prefix === '') return '';
  return `:(top)${prefix.replace(/\\/g, '/')}`;
}

/** Commits that touched this app (not whole repo). */
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

/** Parse numeric version component (default 0 if malformed). */
/** @param {string | undefined} value */
function toVersionPart(value) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Version: major.minor.patch (patch = max(build count, pkg patch). 3-part for webOS). */
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

/** Extract repo URL from package.json repository (string or {url}). */
/** @param {unknown} repository */
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

/** Parse owner/repo from package.json repository (shorthand or URL). */
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

/** Get publishing owner (undefined if repo not parseable). */
function getOwner() {
  return getRepository()?.owner;
}

/** @returns {{ version: string, gitSha: string | null, owner: string | undefined }} */
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

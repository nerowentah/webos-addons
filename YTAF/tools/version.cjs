#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const pkgJson = require('../package.json');

/**
 * Run a git command from this directory. Git walks up to the enclosing
 * repository (this app is not its own git repo in this checkout), so the short
 * SHA and commit count describe the enclosing repo's HEAD, not this app's
 * history.
 *
 * @param {readonly string[]} args
 * @returns {string | null}
 */
function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

/**
 * @returns {string | null} Short SHA of HEAD (e.g. "e4fd19f").
 */
function getGitShortSha() {
  return runGit(['rev-parse', '--short', 'HEAD']);
}

/**
 * @returns {number | null} Total commit count of the enclosing repository.
 */
function getBuildNumber() {
  const count = runGit(['rev-list', '--count', 'HEAD']);
  if (count === null) return null;
  const parsed = Number.parseInt(count, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Version used everywhere (appinfo.json, IPK filename, Homebrew manifest,
 * UI badge). ares-package and webOS require exactly three numeric parts
 * (major.minor.patch), so the package.json base contributes the major and
 * minor while the repository commit count fills the patch. This keeps every
 * build distinct and increasing. Falls back to the package.json version
 * when git is unavailable.
 *
 * @returns {string}
 */
function getVersion() {
  const build = getBuildNumber();
  if (build === null) return pkgJson.version;
  const [major, minor] = pkgJson.version.split('.');
  return `${major ?? 0}.${minor ?? 0}.${build}`;
}

/**
 * @returns {{ version: string, gitSha: string | null }}
 */
function getVersionInfo() {
  return { version: getVersion(), gitSha: getGitShortSha() };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(getVersionInfo())}\n`);
}

module.exports = { getGitShortSha, getBuildNumber, getVersion, getVersionInfo };

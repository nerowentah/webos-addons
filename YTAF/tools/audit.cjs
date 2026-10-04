#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

delete process.env.npm_config_allow_scripts;
delete process.env.NPM_CONFIG_ALLOW_SCRIPTS;

// Advisories with no upstream fix, accepted until a patched release lands.
// Keyed on GHSA id rather than package name so an entry keeps working as the
// affected packages get version bumps.
const ACCEPTED = new Set([
  // braces <=3.0.3 stack-exhaustion DoS via deeply nested patterns. 3.0.3 is
  // the latest release, so there is nothing to upgrade to. Reached only
  // through devDependencies (es-check and @webos-tools/cli, via
  // shelljs -> fast-glob -> micromatch -> braces); none of it ships in the
  // packaged app.
  'GHSA-vfj7-8cjw-p6xm'
]);

const args = ['audit', '--json', ...process.argv.slice(2)];

// Node refuses to spawn a `.cmd` shim directly, so on Windows the npm shim is
// reached through cmd.exe. `/s` is deliberately omitted: it strips the outer
// quotes off the command line and mangles forwarded args. stdout is captured
// so the report can be filtered; stderr stays attached for warnings.
const isWindows = process.platform === 'win32';
const result = isWindows
  ? spawnSync(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/c', 'npm.cmd', ...args],
      { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }
    )
  : spawnSync('npm', args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8'
    });

if (result.error) {
  console.error(`audit: unable to run npm audit: ${result.error.message}`);
  process.exit(1);
}

// A null status means the child never reported one, which is a failure to
// audit rather than a clean bill of health.
if (result.status === null) {
  console.error('audit: npm audit exited without reporting a status');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout.replace(/^\ufeff/, ''));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`audit: could not parse npm audit output: ${message}`);
  process.exit(1);
}

// `npm audit --json` reports its own failures as a JSON error object on
// stdout, which would otherwise parse cleanly and look like an empty report.
if (report.error) {
  const { code, summary, detail } = report.error;
  console.error(`audit: npm audit failed${code ? ` (${code})` : ''}`);
  if (summary) {
    console.error(`  ${summary}`);
  }
  if (detail) {
    console.error(`  ${detail}`);
  }
  process.exit(1);
}

// `via` holds advisory objects for direct findings and plain package-name
// strings for dependency links. Only the former carry a real advisory, so the
// gate reports those and ignores the chains that merely lead to them.
const advisories = new Map();
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via === 'string' || !via.url) {
      continue;
    }
    advisories.set(via.url, {
      name,
      severity: via.severity ?? vuln.severity ?? 'unknown',
      title: via.title ?? 'Unknown advisory',
      url: via.url
    });
  }
}

const unaccepted = [...advisories.values()].filter(
  (advisory) => !ACCEPTED.has(advisory.url.split('/').pop())
);

if (unaccepted.length > 0) {
  console.error(
    `audit: ${unaccepted.length} unaccepted ${
      unaccepted.length === 1 ? 'advisory' : 'advisories'
    }:`
  );
  for (const advisory of unaccepted) {
    console.error(`  [${advisory.severity}] ${advisory.title}`);
    console.error(`    ${advisory.name} - ${advisory.url}`);
  }
  console.error('Run `npm audit` for the full report.');
  process.exit(1);
}

const accepted = advisories.size;
if (accepted > 0) {
  console.log(
    `audit: ok - ${accepted} accepted ${
      accepted === 1 ? 'advisory' : 'advisories'
    } with no upstream fix, no unaccepted advisories.`
  );
} else {
  console.log('audit: ok - no advisories.');
}

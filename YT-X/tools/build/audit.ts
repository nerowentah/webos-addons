import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

delete process.env['npm_config_allow_scripts'];
delete process.env['NPM_CONFIG_ALLOW_SCRIPTS'];

// Accepted advisories (no upstream fix; dev-only). Keyed on GHSA id so an
// entry keeps working as the affected packages get version bumps. Each has a
// REVIEW_BY date: once the clock passes it, the gate warns on every run until
// the entry is re-evaluated or dropped.
const REVIEW_BY = new Map([
  ['GHSA-vfj7-8cjw-p6xm', '2026-12-01'],
  ['GHSA-hp3w-g68c-fv3c', '2027-03-01'],
  ['GHSA-27r3-jxmh-p828', '2026-12-01']
]);

const ACCEPTED = new Set([
  'GHSA-vfj7-8cjw-p6xm', // braces: devDeps only, latest fixed missing.
  'GHSA-hp3w-g68c-fv3c', // sprintf-js: devDep only, no fix.
  'GHSA-27r3-jxmh-p828' // body-parser: only inside @webos-tools/cli (local ares tooling), no request-facing server; DoS only.
]);

/** The slice of `npm audit --json` this gate reads. */
interface AuditVia {
  url?: string;
  severity?: string;
  title?: string;
}

interface AuditVulnerability {
  severity?: string;
  via?: (string | AuditVia)[];
}

interface AuditReport {
  error?: { code?: string; summary?: string; detail?: string };
  vulnerabilities?: Record<string, AuditVulnerability>;
}

interface Advisory {
  name: string;
  severity: string;
  title: string;
  url: string;
}

// Only plain npm flags (e.g. --omit=dev) are forwarded; anything else could
// change npm's behaviour in unexpected ways.
const SAFE_ARG = /^--?[A-Z][\w-]*(?:=[\w.@-]+)?$/i;
const extra = process.argv.slice(2);
const unsafe = extra.filter((a) => !SAFE_ARG.test(a));
if (unsafe.length > 0) {
  console.error(`audit: refusing unsupported argument(s): ${unsafe.join(' ')}`);
  process.exit(2);
}
const args = ['audit', '--json', ...extra];

// Run npm's CLI entry under node directly so argv is never re-parsed by a
// shell: on Windows `npm` is a .cmd shim, so handing the args to cmd.exe would
// let shell metacharacters change the command. npm_execpath is set when this
// runs via `npm run audit`; otherwise look for the npm CLI next to node.
function resolveNpmCli(): string | undefined {
  const fromEnv = process.env['npm_execpath'];
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  const nodeDir = dirname(process.execPath);
  return [
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ].find((candidate) => existsSync(candidate));
}

const npmCliPath = resolveNpmCli();
if (!npmCliPath && process.platform === 'win32') {
  console.error(
    'audit: could not locate the npm CLI - run this via `npm run audit`.'
  );
  process.exit(1);
}

const result = npmCliPath
  ? spawnSync(process.execPath, [npmCliPath, ...args], {
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8'
    })
  : spawnSync('npm', args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8'
    });

if (result.error) {
  console.error(`audit: unable to run npm audit: ${result.error.message}`);
  process.exit(1);
}

// Null status means the child never reported exit status.
if (result.status === null) {
  console.error('audit: npm audit exited without reporting a status');
  process.exit(1);
}

let report: AuditReport;
try {
  report = JSON.parse(result.stdout.replace(/^\ufeff/, '')) as AuditReport;
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`audit: could not parse npm audit output: ${message}`);
  process.exit(1);
}

// npm audit --json returns error object on stdout.
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

// Only direct advisory objects (not chain strings) are reported.
const advisories = new Map<string, Advisory>();
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
  (advisory) => !ACCEPTED.has(advisory.url.split('/').pop() ?? '')
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

const expired = [...REVIEW_BY.entries()].filter(
  ([ghsa, until]) => ACCEPTED.has(ghsa) && Date.now() > Date.parse(until)
);
if (expired.length > 0) {
  console.error(
    `audit: ${
      expired.length === 1
        ? 'an accepted advisory is'
        : 'accepted advisories are'
    } past its review date - re-evaluate or bump REVIEW_BY:`
  );
  for (const [ghsa, until] of expired) {
    console.error(`  ${ghsa} (due ${until})`);
  }
}

if (accepted > 0) {
  console.log(
    `audit: ok - ${accepted} accepted ${
      accepted === 1 ? 'advisory' : 'advisories'
    } with no upstream fix, no unaccepted advisories.`
  );
} else {
  console.log('audit: ok - no advisories.');
}

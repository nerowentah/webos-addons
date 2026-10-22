import { spawnSync } from 'node:child_process';

delete process.env['npm_config_allow_scripts'];
delete process.env['NPM_CONFIG_ALLOW_SCRIPTS'];

// Accepted advisories (no upstream fix; dev-only). Keyed on GHSA id so an
// entry keeps working as the affected packages get version bumps. Each has a
// REVIEW_BY date: once the clock passes it, the gate warns on every run until
// the entry is re-evaluated or dropped.
const REVIEW_BY = new Map([
  ['GHSA-vfj7-8cjw-p6xm', '2026-12-01'],
  ['GHSA-hp3w-g68c-fv3c', '2027-03-01']
]);

const ACCEPTED = new Set([
  'GHSA-vfj7-8cjw-p6xm', // braces: devDeps only, latest fixed missing.
  'GHSA-hp3w-g68c-fv3c' // sprintf-js: devDep only, no fix.
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

const args = ['audit', '--json', ...process.argv.slice(2)];

// Prefer npm's own CLI JS under node: npm_execpath is set when this runs via
// `npm run audit`, so argv is never re-parsed by a shell on Windows. The
// cmd.exe path remains only for direct invocation without npm.
const isWindows = process.platform === 'win32';
const npmCliPath = process.env['npm_execpath'];
const result = npmCliPath
  ? spawnSync(process.execPath, [npmCliPath, ...args], {
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8'
    })
  : isWindows
    ? spawnSync(
        process.env['ComSpec'] ?? 'cmd.exe',
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

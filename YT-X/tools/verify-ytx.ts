/**
 * Read-only YT-X check of a running app over the inspector, for the web build
 * or the native Cobalt build. Opens the settings panel with GREEN (which also
 * exercises the shortcut), reads what the page reports, and writes a report.
 *
 *   node tools/verify-ytx.ts --suite web    [-d <device>]
 *   node tools/verify-ytx.ts --suite native [--port 19222]
 *
 * Native needs the debug port forwarded first, for example
 *   ssh -N -L 19222:[::1]:9222 <tv>
 * The report goes to dist/verify-<suite>.md. It holds no tokens: only module
 * statuses, attribute values and counts. Items it cannot judge (highlight
 * jump, marker alignment, cast phones, Magic Remote, screenshots) stay manual
 * and are listed at the end of the report.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect, connectToPort, HarnessError, runCli } from './inspect.ts';
import type { Session } from './inspect.ts';
import { press, sleep } from './drive.ts';

export type Suite = 'web' | 'native';

export interface Facts {
  native: boolean;
  modules: Record<string, string> | null;
  moduleErrors: string;
  cspViolations: string[];
  watchPage: boolean;
  panel: {
    role: string | null;
    modal: string | null;
    labelledByExists: boolean;
    tablist: boolean;
    tabs: number;
    selectedTabs: number;
    tabpanels: number;
    spinbuttons: number;
    spinbuttonsWithText: number;
    headings: number;
    groups: number;
    duplicateIds: number;
    sponsorBlockControls: number;
  } | null;
  styles: { textScale: boolean; timeRemaining: boolean };
}

export interface Check {
  label: string;
  result: 'PASS' | 'FAIL' | 'SKIP';
  note?: string;
}

/** The expression the page evaluates; plain data out, nothing secret read. */
export const PROBE = `(() => {
  const q = (s) => document.querySelector(s);
  const all = (s) => [...document.querySelectorAll(s)];
  const panel = q('.ytx-ui-container');
  const ids = all('[id]').map((e) => e.id);
  let modules = window.__ytxModules || null;
  try { modules = modules || JSON.parse(localStorage.getItem('ytx-modules') || 'null'); } catch (e) {}
  let err = '';
  try { err = localStorage.getItem('ytx-err') || ''; } catch (e) {}
  return {
    native: window.__ytxNative === true,
    modules,
    moduleErrors: err.slice(0, 400),
    cspViolations: (window.__ytxCsp || []).slice(0, 20),
    watchPage: document.body.classList.contains('WEB_PAGE_TYPE_WATCH'),
    panel: panel ? {
      role: panel.getAttribute('role'),
      modal: panel.getAttribute('aria-modal'),
      labelledByExists: !!document.getElementById(panel.getAttribute('aria-labelledby') || ''),
      tablist: !!panel.querySelector('[role=tablist]'),
      tabs: panel.querySelectorAll('[role=tab]').length,
      selectedTabs: panel.querySelectorAll('[role=tab][aria-selected=true]').length,
      tabpanels: panel.querySelectorAll('[role=tabpanel]').length,
      spinbuttons: panel.querySelectorAll('[role=spinbutton]').length,
      spinbuttonsWithText: panel.querySelectorAll('[role=spinbutton][aria-valuetext]').length,
      headings: panel.querySelectorAll('h2.section-title').length,
      groups: panel.querySelectorAll('[role=group][aria-labelledby]').length,
      duplicateIds: ids.length - new Set(ids).size,
      sponsorBlockControls: all('.ytx-ui-container label').filter((l) => /SponsorBlock|Skip /.test(l.textContent || '')).length
    } : null,
    styles: { textScale: !!q('#ytx-text-scale'), timeRemaining: !!q('#ytx-time-remaining') }
  };
})()`;

/** Installs the CSP-violation recorder; run once, then read it with PROBE later. */
export const INSTALL_CSP_RECORDER = `(() => {
  if (window.__ytxCspInstalled) return;
  window.__ytxCspInstalled = true;
  window.__ytxCsp = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__ytxCsp.push(e.violatedDirective + ' ' + String(e.blockedURI).split('?')[0]);
  });
})()`;

export function evaluateFacts(facts: Facts, suite: Suite): Check[] {
  const out: Check[] = [];
  const add = (label: string, ok: boolean, note?: string): void => {
    out.push({
      label,
      result: ok ? 'PASS' : 'FAIL',
      ...(note ? { note } : {})
    });
  };

  add(
    suite === 'native'
      ? 'native marker is set'
      : 'web build has no native marker',
    facts.native === (suite === 'native')
  );

  if (suite === 'native') {
    const bad = Object.entries(facts.modules ?? {}).filter(([, v]) =>
      v.startsWith('error')
    );
    add(
      'every feature module loaded',
      facts.modules !== null && bad.length === 0,
      bad.map(([k, v]) => `${k}: ${v}`).join('; ') || facts.moduleErrors
    );
  } else {
    out.push({ label: 'module status (native only)', result: 'SKIP' });
  }

  add(
    'no CSP violations while watching',
    facts.cspViolations.length === 0,
    facts.cspViolations.join('; ')
  );

  const p = facts.panel;
  if (!p) {
    add('settings panel opened with GREEN', false);
    return out;
  }
  add('panel is a modal dialog', p.role === 'dialog' && p.modal === 'true');
  add('dialog has a name', p.labelledByExists);
  add(
    'tabs: tablist, 5 tabs, exactly one selected',
    p.tablist && p.tabs === 5 && p.selectedTabs === 1
  );
  add('every built page is a tabpanel', p.tabpanels >= 1);
  add(
    'cycle rows are spinbuttons with a value text',
    p.spinbuttons > 0 && p.spinbuttons === p.spinbuttonsWithText
  );
  add(
    'every section has a heading and a labelled group',
    p.headings > 0 && p.headings === p.groups
  );
  add('no duplicate element ids', p.duplicateIds === 0);
  if (suite === 'native') {
    add(
      'no SponsorBlock controls in the native panel',
      p.sponsorBlockControls === 0
    );
  }
  return out;
}

const MANUAL = [
  'Highlight jump on first play, restart loop with Skip Once on/off',
  'Segment marker alignment at 720p and after a bar re-render (web build)',
  'Android and iOS cast destination matrix; stale "LG QNED86" phone entry',
  'Magic Remote pointer, wheel and colour/media keys',
  'Shorts metadata contrast and stats-panel overlap (screenshots)',
  'Show Time Remaining visible under the seek bar on a watch page',
  'Native: a live ad response has adPlacements/adSlots stripped',
  'Native: muted-segment audio is restored (web build with segments muted)',
  'Voice search, playback speed and subtitles on native (separate results)',
  'Settings persist over a cold boot and a second launch',
  'Native rollback: `node tools/native.ts clean`, reinstall the stock app',
  'Native release job run once with a real RF1705 runtime (draft pre-release)',
  'First tagged release installs through the Homebrew Channel (repo.json)',
  'More TVs: other webOS versions, OLED vs non-OLED, ARMv7 vs AArch64'
];

export function renderReport(
  suite: Suite,
  checks: readonly Check[],
  when: string
): string {
  const lines = [`# YT-X ${suite} verification`, '', `Run: ${when}`, ''];
  for (const c of checks) {
    lines.push(`- ${c.result} ${c.label}${c.note ? ` (${c.note})` : ''}`);
  }
  lines.push('', '## Manual', '', ...MANUAL.map((m) => `- [ ] ${m}`), '');
  return lines.join('\n');
}

async function run(session: Session, suite: Suite): Promise<Check[]> {
  await session.evaluate(INSTALL_CSP_RECORDER);
  await press(session, 'green');
  await sleep(1500);
  const watch = Number(process.env['YTX_VERIFY_WATCH_MS'] ?? 8000);
  await sleep(watch);
  const facts = (await session.evaluate(PROBE)) as Facts;
  await press(session, 'back');
  return evaluateFacts(facts, suite);
}

if (import.meta.main) {
  runCli(async () => {
    const argv = process.argv.slice(2);
    const flag = (name: string): string | undefined => {
      const i = argv.indexOf(name);
      return i === -1 ? undefined : argv[i + 1];
    };
    const suite = flag('--suite');
    if (suite !== 'web' && suite !== 'native') {
      throw new HarnessError('--suite must be web or native');
    }
    const session =
      suite === 'native'
        ? await connectToPort(Number(flag('--port') ?? 19222))
        : await connect({ device: flag('-d') });
    let checks: Check[];
    try {
      checks = await run(session, suite);
    } finally {
      session.close();
    }
    mkdirSync('dist', { recursive: true });
    const report = renderReport(suite, checks, new Date().toISOString());
    writeFileSync(`dist/verify-${suite}.md`, report);
    console.log(report);
    if (checks.some((c) => c.result === 'FAIL')) {
      throw new HarnessError('some checks failed');
    }
  });
}

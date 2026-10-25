import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFacts, renderReport, type Facts } from './verify-ytx.ts';

const good: Facts = {
  native: true,
  modules: { './ui/ui': 'ok', './features/adblock/adblock': 'ok' },
  moduleErrors: '',
  cspViolations: [],
  watchPage: true,
  panel: {
    role: 'dialog',
    modal: 'true',
    labelledByExists: true,
    tablist: true,
    tabs: 5,
    selectedTabs: 1,
    tabpanels: 2,
    spinbuttons: 3,
    spinbuttonsWithText: 3,
    headings: 4,
    groups: 4,
    duplicateIds: 0,
    sponsorBlockControls: 0
  },
  styles: { textScale: false, timeRemaining: true }
};

const panelWith = (
  over: Partial<NonNullable<Facts['panel']>>
): Facts['panel'] => (good.panel ? { ...good.panel, ...over } : null);

const fails = (facts: Facts, suite: 'web' | 'native'): string[] =>
  evaluateFacts(facts, suite)
    .filter((c) => c.result === 'FAIL')
    .map((c) => c.label);

test('a healthy native page passes every check', () => {
  assert.deepEqual(fails(good, 'native'), []);
});

test('a module error, a CSP violation and a SponsorBlock control are reported', () => {
  const bad: Facts = {
    ...good,
    modules: { './ui/ui': 'error: boom' },
    cspViolations: ['connect-src https://x'],
    panel: panelWith({ sponsorBlockControls: 2, selectedTabs: 2 })
  };
  const failed = fails(bad, 'native');
  assert.ok(failed.includes('every feature module loaded'));
  assert.ok(failed.includes('no CSP violations while watching'));
  assert.ok(failed.includes('no SponsorBlock controls in the native panel'));
  assert.ok(failed.includes('tabs: tablist, 5 tabs, exactly one selected'));
});

test('a closed panel fails, and the web suite skips module status', () => {
  assert.ok(
    fails({ ...good, native: false, panel: null }, 'web').includes(
      'settings panel opened with GREEN'
    )
  );
  const checks = evaluateFacts({ ...good, native: false }, 'web');
  assert.equal(
    checks.find((c) => c.label.startsWith('module status'))?.result,
    'SKIP'
  );
});

test('the report lists results and the manual items', () => {
  const report = renderReport('native', evaluateFacts(good, 'native'), 'now');
  assert.match(report, /- PASS panel is a modal dialog/);
  assert.match(report, /## Manual/);
  assert.doesNotMatch(report, /token|Bearer/i);
});

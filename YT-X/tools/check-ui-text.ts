// Fails the build when a user-visible string outgrows its cap.
//
// The strings live in src/config/ui-text.ts; this imports that module (it has no DOM
// or localStorage dependencies) and checks every static value, then runs each
// notification template with a documented worst-case input. Wired into
// `npm run verify`, so an over-long label can never reach a build.
//
// The import path is built at runtime rather than written as a literal so the
// browser tsconfig project stays the only one that owns src/config/ui-text.ts; a
// static import here would drag it into the tooling project too and trip
// TypeScript's composite-project file-ownership rule.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.join(import.meta.dirname, '..');
const failures: string[] = [];

/** The parts of src/config/ui-text.ts this gate reads. */
interface UiTextModule {
  MAX_UI_TEXT: number;
  MAX_LABEL_TEXT: number;
  UI_LABELS: unknown;
  PANEL: unknown;
  SPONSOR_POPUP: unknown;
  NOTIFICATIONS: {
    codecReload(mode: string): string;
    skipping(name: string): string;
    muted(name: string): string;
    sponsorNew(n: number): string;
    playingIn(label: string): string;
    selectedMax(selected: string, max: string): string;
    [key: string]: unknown;
  };
}

function check(value: unknown, cap: number, where: string): void {
  if (typeof value !== 'string') return;
  if (value.length > cap) {
    failures.push(
      `${where}: ${value.length} > ${cap} chars — ${JSON.stringify(value)}`
    );
  }
}

function walk(node: unknown, cap: number, where: string): void {
  if (typeof node === 'string') {
    check(node, cap, where);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item: unknown, index) => {
      walk(item, cap, `${where}[${index}]`);
    });
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      walk(value, cap, `${where}.${key}`);
    }
  }
}

async function main(): Promise<void> {
  const modulePath = path.join(ROOT, 'src', 'config', 'ui-text.ts');
  const mod = (await import(pathToFileURL(modulePath).href)) as UiTextModule;
  const {
    MAX_UI_TEXT,
    MAX_LABEL_TEXT,
    UI_LABELS,
    PANEL,
    SPONSOR_POPUP,
    NOTIFICATIONS
  } = mod;

  walk(UI_LABELS, MAX_LABEL_TEXT, 'UI_LABELS');
  walk(PANEL, MAX_UI_TEXT, 'PANEL');
  walk(SPONSOR_POPUP, MAX_UI_TEXT, 'SPONSOR_POPUP');

  for (const [key, value] of Object.entries(NOTIFICATIONS)) {
    if (typeof value === 'string') {
      check(value, MAX_UI_TEXT, `NOTIFICATIONS.${key}`);
    }
  }

  // Each template gets the longest input it can realistically see.
  const worstCase = [
    NOTIFICATIONS.codecReload('Avoid AV1'),
    NOTIFICATIONS.skipping('interaction reminder'),
    NOTIFICATIONS.muted('interaction reminder'),
    NOTIFICATIONS.sponsorNew(99),
    NOTIFICATIONS.playingIn('2160p60 HDR'),
    NOTIFICATIONS.selectedMax('2160p60 HDR', '2160p60 HDR')
  ];
  for (const text of worstCase) {
    check(text, MAX_UI_TEXT, 'NOTIFICATIONS template');
  }

  const html = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const title = /<title>([^<]*)<\/title>/i.exec(html);
  if (title) check(title[1], MAX_UI_TEXT, 'index.html <title>');

  if (failures.length > 0) {
    console.error('check-ui-text: strings over the limit:');
    for (const failure of failures) console.error('  ' + failure);
    process.exit(1);
  }
  console.log('check-ui-text: ok');
}

main().catch((error: unknown) => {
  console.error('check-ui-text:', error);
  process.exit(1);
});

#!/usr/bin/env node
// Fails the build when a user-visible string outgrows its cap.
//
// The strings live in src/config/ui-text.js; this imports that module (it has no DOM
// or localStorage dependencies) and checks every static value, then runs each
// notification template with a documented worst-case input. Wired into
// `npm run verify`, so an over-long label can never reach a build.
//
// The import path is built at runtime rather than written as a literal so the
// browser tsconfig project stays the only one that owns src/config/ui-text.js; a
// static import here would drag it into the tooling project too and trip
// TypeScript's composite-project file-ownership rule.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
/** @type {string[]} */
const failures = [];

/**
 * @param {unknown} value
 * @param {number} cap
 * @param {string} where
 */
function check(value, cap, where) {
  if (typeof value !== 'string') return;
  if (value.length > cap) {
    failures.push(
      `${where}: ${value.length} > ${cap} chars — ${JSON.stringify(value)}`
    );
  }
}

/**
 * @param {unknown} node
 * @param {number} cap
 * @param {string} where
 */
function walk(node, cap, where) {
  if (typeof node === 'string') {
    check(node, cap, where);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => {
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

async function main() {
  const modulePath = path.join(ROOT, 'src', 'config', 'ui-text.ts');
  const mod = await import(pathToFileURL(modulePath).href);
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
  /** @type {Array<[Function, unknown[]]>} */
  const worstCase = [
    [NOTIFICATIONS.codecReload, ['Avoid AV1']],
    [NOTIFICATIONS.skipping, ['interaction reminder']],
    [NOTIFICATIONS.muted, ['interaction reminder']],
    [NOTIFICATIONS.sponsorNew, [99]],
    [NOTIFICATIONS.playingIn, ['2160p60 HDR']],
    [NOTIFICATIONS.selectedMax, ['2160p60 HDR', '2160p60 HDR']]
  ];
  for (const [fn, args] of worstCase) {
    check(fn(...args), MAX_UI_TEXT, 'NOTIFICATIONS template');
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

main().catch((error) => {
  console.error('check-ui-text:', error);
  process.exit(1);
});

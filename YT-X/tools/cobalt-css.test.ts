// Guards the shared stylesheets against constructs that Cobalt (the native
// build's engine) drops or aborts on. Each rule below was measured on the TV or
// comes from Cobalt's supported-features list; a hit means the rule is silently
// lost on the native build (or, for keyframes, can close the app).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? cssFiles(path)
      : path.endsWith('.css')
        ? [path]
        : [];
  });
}

/** Source with comments removed, so explanations that name a construct do not trip the rules. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const RULES: ReadonlyArray<readonly [name: string, pattern: RegExp]> = [
  [
    'display: grid / grid-* (no CSS grid)',
    /display\s*:\s*(inline-)?grid|grid-[a-z-]+\s*:/
  ],
  [':checked', /:checked\b/],
  [':focus-within', /:focus-within\b/],
  [
    'structural pseudo-classes',
    /:(first|last|only|nth-[a-z-]+)-?(child|of-type)?\b\s*[,{(>+~ ]/
  ],
  [':has() / :is() / :where()', /:(has|is|where)\s*\(/],
  ['var() / custom properties', /var\(\s*--|(^|[;{\s])--[a-z0-9-]+\s*:/],
  ['8-digit hex colour', /#[0-9a-f]{8}\b/i],
  ['@layer / @container', /@(layer|container)\b/]
];

test('shared CSS avoids constructs Cobalt cannot render', () => {
  const hits: string[] = [];
  for (const file of cssFiles(SRC)) {
    const css = stripComments(readFileSync(file, 'utf8'));
    for (const [name, pattern] of RULES) {
      const match = pattern.exec(css);
      if (match)
        hits.push(`${relative(SRC, file)}: ${name} -> ${match[0].trim()}`);
    }
  }
  assert.deepEqual(hits, []);
});

test('keyframes do not animate transform (aborts Cobalt)', () => {
  const hits: string[] = [];
  for (const file of cssFiles(SRC)) {
    const css = stripComments(readFileSync(file, 'utf8'));
    for (const block of css.matchAll(
      /@keyframes\s+[\w-]+\s*\{([\s\S]*?\}\s*)\}/g
    )) {
      if (/transform\s*:/.test(block[1] ?? '')) {
        hits.push(`${relative(SRC, file)}: ${block[0].split('{')[0]?.trim()}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});

test('the rules catch the constructs they name', () => {
  const samples = [
    'a{display:grid}',
    'a{grid-template-columns:1fr}',
    'a:checked{x:y}',
    'a:focus-within{x:y}',
    'a:first-child{x:y}',
    'a > :last-child {x:y}',
    'li:nth-child(2){x:y}',
    'a:has(b){x:y}',
    'a{color:var(--c)}',
    ':root{--c:1}',
    'a{color:#ff000059}',
    '@layer base{a{x:y}}'
  ];
  for (const sample of samples) {
    assert.ok(
      RULES.some(([, pattern]) => pattern.test(sample)),
      sample
    );
  }
  for (const fine of [
    'a{color:#fff}',
    'a:focus{x:y}',
    'a::before{content:""}'
  ]) {
    assert.ok(!RULES.some(([, pattern]) => pattern.test(fine)), fine);
  }
});

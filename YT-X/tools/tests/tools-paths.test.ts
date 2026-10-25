// Every `tools/...ts` path a script, workflow or README names must exist, so
// moving a tool cannot silently break an npm script, a release step or a doc.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);

const SOURCES = [
  'package.json',
  'README.md',
  '../README.md',
  '../.github/workflows/ci.yml',
  '../.github/workflows/release.yml',
  '../.github/workflows/codeql.yml'
];

const TOOL_PATH = /\btools\/[a-z0-9/-]+(?:\.test)?\.ts\b/g;

test('every tools path named in scripts, workflows and docs exists', () => {
  const missing: string[] = [];
  for (const source of SOURCES) {
    const url = new URL(source, root);
    if (!existsSync(url)) continue;
    for (const match of readFileSync(url, 'utf8').matchAll(TOOL_PATH)) {
      if (!existsSync(new URL(match[0], root))) {
        missing.push(`${source}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('tools/ holds only category folders', () => {
  const loose = readdirSync(new URL('tools/', root), {
    withFileTypes: true
  }).filter((entry) => !entry.isDirectory());
  assert.deepEqual(
    loose.map((entry) => entry.name),
    []
  );
});

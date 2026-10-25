// Docs and plans must only name npm scripts that exist: package.json scripts
// were renamed once (build -> build:fhd, package -> package:dist) and the docs
// kept the old names.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json' with { type: 'json' };

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist') return [];
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return path.endsWith('.md') ? [path] : [];
  });
}

test('every `npm run <script>` in the docs exists in package.json', () => {
  const scripts = new Set(Object.keys(pkg.scripts));
  const missing: string[] = [];
  for (const file of [
    join(root, 'README.md'),
    ...markdownFiles(join(root, 'plans'))
  ]) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/npm run ([a-z][\w:-]*)/g)) {
      const name = match[1] ?? '';
      if (!scripts.has(name)) missing.push(`${file}: npm run ${name}`);
    }
  }
  assert.deepEqual(missing, []);
});

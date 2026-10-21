'use strict';
/**
 * Syntax-floor gate for the production bundle.
 *
 * es-check cannot express this: in browser mode it maps a browserslist target to
 * a single ES version, so it rejects private class fields (ES2022 syntax, but
 * native in Chrome 74+) and aborts valid Chrome 79 output. What actually breaks
 * old engines is syntax Babel has not transpiled, so check for exactly that.
 *
 *   node tools/check-syntax-floor.cjs [files...]
 *
 * Defaults to ./dist/**\/*.js. Exits 1 with file:line:col for every offender.
 */
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');
const acorn = require('acorn');

/** Syntax Chrome 79 (webOS 6) cannot parse. Everything else in the bundle is
 * either ES2019 or older, or natively supported (private fields, class fields). */
/** @type {Record<string, string>} */
const RULES = {
  ChainExpression: 'optional chaining (?.)',
  StaticBlock: 'class static block'
};

/** @param {string} dir @param {string[]} out */
function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) jsFiles(path, out);
    else if (name.endsWith('.js')) out.push(path);
  }
  return out;
}

/** @param {any} node @param {string} file @param {{file: string, line: number, col: number, what: string}[]} hits */
function walk(node, file, hits) {
  if (!node || typeof node.type !== 'string') return;
  const rule = RULES[node.type];
  if (rule) {
    hits.push({
      file,
      line: node.loc?.start.line ?? 0,
      col: node.loc?.start.column ?? 0,
      what: rule
    });
  }
  if (node.type === 'LogicalExpression' && node.operator === '??') {
    hits.push({
      file,
      line: node.loc.start.line,
      col: node.loc.start.column,
      what: 'nullish coalescing (??)'
    });
  }
  if (
    node.type === 'AssignmentExpression' &&
    (node.operator === '||=' ||
      node.operator === '&&=' ||
      node.operator === '??=')
  ) {
    hits.push({
      file,
      line: node.loc.start.line,
      col: node.loc.start.column,
      what: `logical assignment (${node.operator})`
    });
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walk(child, file, hits);
    } else if (value && typeof value === 'object') {
      walk(value, file, hits);
    }
  }
}

const argv = process.argv.slice(2);
const files = argv.length ? argv : jsFiles('./dist');
if (files.length === 0) {
  console.error('error: no JavaScript files to check (run the build first)');
  process.exit(1);
}

/** @type {{file: string, line: number, col: number, what: string}[]} */
const hits = [];
let parsed = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  try {
    const ast = acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true
    });
    walk(ast, file, hits);
    parsed++;
  } catch (err) {
    const e = /** @type {any} */ (err);
    hits.push({
      file,
      line: e.loc?.line ?? 0,
      col: e.loc?.column ?? 0,
      what: `unparseable: ${e.message}`
    });
  }
}

if (hits.length) {
  for (const hit of hits) {
    console.error(
      `${relative(process.cwd(), hit.file)}:${hit.line}:${hit.col}  ${hit.what}`
    );
  }
  console.error(
    `\nerror: ${hits.length} construct(s) above are not supported by Chrome 79 (webOS 6)`
  );
  console.error(
    'Babel target comes from .browserslistrc; check that the file is transpiled by the build.'
  );
  process.exit(1);
}

console.log(
  `syntax floor OK: ${parsed} file(s) parse and use no Chrome 79-unsupported syntax`
);

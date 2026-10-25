import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSrc } from '../lib/load-src.ts';

interface Scaled {
  selector: string;
  base: number;
  unit: string;
}
interface TextScale {
  SCALED_TEXT: readonly Scaled[];
  textScaleCss(mode: string): string;
}

const { SCALED_TEXT, textScaleCss } = await loadSrc<TextScale>(
  'ui/text-scale-css.ts'
);

const css = ['ui/ui.css', 'features/sponsorblock/sponsorblock-ui.css']
  .map((f) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8'))
  .join('\n');

const escapeRe = (s: string): string =>
  s.replace(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

test('every scaled selector keeps the font-size the table assumes', () => {
  for (const { selector, base, unit } of SCALED_TEXT) {
    const rule = new RegExp(
      `(?:^|\\n)${escapeRe(selector)}\\s*\\{[^}]*?font-size:\\s*${escapeRe(String(base))}${unit}`
    );
    assert.match(css, rule, `${selector} font-size ${base}${unit}`);
  }
});

test('normal leaves the page untouched; larger modes multiply each size', () => {
  assert.equal(textScaleCss('normal'), '');
  assert.equal(textScaleCss('bogus'), '');
  const maximum = textScaleCss('maximum');
  assert.match(maximum, /\.ytx-tab-btn\{font-size:4\.2vh !important;\}/);
  assert.match(maximum, /\.ytx-ui-badge\{font-size:1\.6rem !important;\}/);
});

test('the generated CSS uses no construct Cobalt lacks', () => {
  const generated = textScaleCss('huge');
  assert.doesNotMatch(generated, /var\(|calc\(|--[a-z]/);
});

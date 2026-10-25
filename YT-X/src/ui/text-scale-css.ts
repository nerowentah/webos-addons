// The CSS for Text Size, generated from a table. No custom properties or
// calc(): Cobalt supports neither var() nor reliable calc() mixing, so each
// rule carries an explicit, already-multiplied font-size. tools/tests/text-scale.test.ts
// checks every base size here against the stylesheet that defines it.

interface ScaledText {
  /** The selector exactly as it is written in the owning stylesheet. */
  selector: string;
  /** Its font-size there, in `unit`. */
  base: number;
  unit: 'vh' | 'rem';
}

export const SCALED_TEXT: readonly ScaledText[] = [
  { selector: '.ytx-ui-container', base: 4.44, unit: 'vh' },
  { selector: '.ytx-ui-container h1', base: 3.89, unit: 'vh' },
  { selector: '.ytx-close-btn', base: 2, unit: 'vh' },
  { selector: '.ytx-ui-container label', base: 2.5, unit: 'vh' },
  { selector: '.ytx-ui-container label .label-content', base: 2.1, unit: 'vh' },
  { selector: '.ytx-notification-container', base: 1.48, unit: 'vh' },
  { selector: '.ytx-tab-btn', base: 2.1, unit: 'vh' },
  { selector: '.ytx-cycle-row', base: 2.5, unit: 'vh' },
  { selector: '.ytx-cycle-label', base: 2.1, unit: 'vh' },
  { selector: '.ytx-cycle-value .arrow-btn', base: 2.22, unit: 'vh' },
  { selector: '.ytx-settings-section > .section-title', base: 2.6, unit: 'vh' },
  {
    selector: '.ytx-settings-section > .section-title .section-title-note',
    base: 1.48,
    unit: 'vh'
  },
  { selector: '.ytx-ui-badge', base: 0.8, unit: 'rem' },
  { selector: '.ytx-ui-version', base: 1.48, unit: 'vh' },
  { selector: '.sb-header-text', base: 2.4, unit: 'vh' },
  { selector: '.sb-header-subtitle', base: 1.4, unit: 'vh' },
  { selector: '.sb-segment-category', base: 1.9, unit: 'vh' },
  { selector: '.sb-segment-time', base: 1.9, unit: 'vh' }
];

export const TEXT_SCALE_FACTORS: Readonly<Record<string, number>> = {
  normal: 1,
  large: 1.25,
  huge: 1.5,
  maximum: 2
};

/** Rules for `mode`; '' for normal (or an unknown mode), so the page stays untouched. */
export function textScaleCss(mode: string): string {
  const factor = TEXT_SCALE_FACTORS[mode];
  if (factor === undefined || factor === 1) return '';
  return SCALED_TEXT.map(
    ({ selector, base, unit }) =>
      `${selector}{font-size:${Number((base * factor).toFixed(3))}${unit} !important;}`
  ).join('\n');
}

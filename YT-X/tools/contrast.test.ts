// WCAG contrast of the panel's tab colours, composited the way the browser does.

import test from 'node:test';
import assert from 'node:assert/strict';

type Rgb = readonly [number, number, number];

const luminance = ([r, g, b]: Rgb): number => {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const ratio = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb => [
  Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
  Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
  Math.round(fg[2] * alpha + bg[2] * (1 - alpha))
];

// Worst case from ui.css: a 0.95 dark plate over white video, then the tab menu's
// 0.2 black layer and the active tab's 0.15 red tint.
const panel: Rgb = over([0, 0, 0], 0.95, [255, 255, 255]);
const menu = over([0, 0, 0], 0.2, panel);
const activeTab = over([255, 0, 0], 0.15, menu);

test('active tab text is at least 4.5:1 (white)', () => {
  assert.ok(ratio([255, 255, 255], activeTab) >= 4.5);
});

test('the old red active text failed 4.5:1 on the tinted plate', () => {
  // The plate the review measured (about #343434).
  assert.ok(ratio([255, 68, 68], [52, 52, 52]) < 4.5);
});

test('the active underline is at least 3:1 against the tab plate', () => {
  assert.ok(ratio([255, 68, 68], activeTab) >= 3);
});

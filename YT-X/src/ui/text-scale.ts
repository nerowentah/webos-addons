// Applies Text Size: one <style> element, rewritten when the option changes.

import { configAddChangeListener, configRead } from '../config/config';
import { nonceStyle } from '../core/csp-nonce';
import { textScaleCss } from './text-scale-css';

let styleEl: HTMLStyleElement | null = null;

function apply(): void {
  const css = textScaleCss(configRead('uiTextScale'));
  if (!css) {
    if (styleEl) styleEl.textContent = '';
    return;
  }
  if (!styleEl || !styleEl.isConnected) {
    styleEl = document.createElement('style');
    styleEl.id = 'ytx-text-scale';
    nonceStyle(styleEl);
    (document.head || document.documentElement).appendChild(styleEl);
  }
  styleEl.textContent = css;
}

export function initTextScale(): void {
  configAddChangeListener('uiTextScale', apply);
  apply();
}

// Page-level toggles and the panel-care (burn-in / blooming) themes.

import {
  configAddChangeListener,
  configRead,
  type BoolKey,
  type PanelCareMode
} from '../config/config';
import {
  addTVSpecsChangeListener,
  resolvePanelCareMode
} from '../platform/tv-specs';
import { setNotificationPanelCare } from './notifications';
import { panelState } from './panel-state';

function initGlobalToggles(): void {
  // Toggles live on <html> because YouTube rewrites body.className on tab
  // navigation; not gated on .app-quality-root, which applyUIFixes() strips.
  // The rules they switch are in theme.css.
  const syncClass = (cls: string, key: BoolKey) =>
    document.documentElement.classList.toggle(cls, configRead(key));
  const CLASS_KEYS: Readonly<Record<string, BoolKey>> = {
    'ytx-hide-logo': 'hideLogo',
    'ytx-fix-titles': 'fixMultilineTitles',
    'ytx-no-animations': 'disableAnimations'
  };
  for (const [cls, key] of Object.entries(CLASS_KEYS)) {
    syncClass(cls, key);
    configAddChangeListener(key, () => syncClass(cls, key));
  }
}

/**
 * The care mode to apply, with 'auto' already resolved; everything downstream
 * reads this rather than configRead('panelCareMode'), so the surfaces cannot disagree.
 */
let resolvedPanelCareMode = resolvePanelCareMode(configRead('panelCareMode'));

export function applyPanelCareMode(mode: PanelCareMode): void {
  resolvedPanelCareMode = resolvePanelCareMode(mode);
  const isOled = resolvedPanelCareMode === 'oled';
  const isQned = resolvedPanelCareMode === 'qned';

  if (panelState.panel) {
    panelState.panel.classList.toggle('oled-care', isOled);
    panelState.panel.classList.toggle('qned-care', isQned);
  }
  setNotificationPanelCare(resolvedPanelCareMode);

  document.documentElement.classList.toggle('oled-theme-active', isOled);
  document.documentElement.classList.toggle('qned-theme-active', isQned);
}

/** Applies the toggles and the care mode now, and keeps them in sync. */
export function initPanelCare(): void {
  initGlobalToggles();

  applyPanelCareMode(configRead('panelCareMode'));
  configAddChangeListener('panelCareMode', (evt) =>
    applyPanelCareMode(evt.detail.newValue)
  );

  // 'auto' resolves against the UA model that tv-specs computes at startup, so
  // re-resolve whenever tv-specs updates.
  addTVSpecsChangeListener(() =>
    applyPanelCareMode(configRead('panelCareMode'))
  );
}

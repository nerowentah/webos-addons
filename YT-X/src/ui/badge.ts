// The on-screen entry point to the options panel, and its pointer-mode
// visibility.

import { configAddChangeListener, configRead } from '../config/config';
import { PANEL } from '../config/ui-text';
import { REMOTE_KEYS } from '../core/utils';

/** On-screen entry point for the options panel; tabindex = -1 keeps it out of the focus order so it can never steal a tile's hover focus. */
const configBadge = document.createElement('button');
configBadge.type = 'button';
configBadge.className = 'ytx-ui-badge';
configBadge.textContent = PANEL.badge;
configBadge.setAttribute('tabindex', '-1');
/** Hides the badge while the panel it opens is showing. */
export function setBadgeHidden(hidden: boolean): void {
  configBadge.classList.toggle('ytx-ui-badge-hidden', hidden);
}

/** Attaches the badge to the page; `onToggle` runs when it is activated. */
export function initBadge(onToggle: () => void): void {
  configBadge.addEventListener(
    'click',
    (evt) => {
      evt.stopPropagation();
      onToggle();
    },
    true
  );
  document.body.appendChild(configBadge);

  // With the Fixed Settings Panel Button off, the badge tracks pointer activity:
  // shown on a real move, fading seconds later, dismissed by
  // D-pad/pointer-hide/navigation. On, it stays put as a fixed entry point.
  const POINTER_BADGE_HIDE_MS = 4000;
  let pointerBadgeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPointerX = -1;
  let lastPointerY = -1;

  const hidePointerBadge = (): void => {
    if (pointerBadgeTimer) {
      clearTimeout(pointerBadgeTimer);
      pointerBadgeTimer = null;
    }
    configBadge.classList.remove('ytx-badge-visible');
  };

  const showPointerBadge = (): void => {
    if (configRead('pointerSettingsButton')) {
      return;
    }
    configBadge.classList.add('ytx-badge-visible');
    if (pointerBadgeTimer) clearTimeout(pointerBadgeTimer);
    pointerBadgeTimer = setTimeout(hidePointerBadge, POINTER_BADGE_HIDE_MS);
  };

  const syncBadgeVisibility = (): void => {
    const fixed = configRead('pointerSettingsButton');
    configBadge.classList.toggle('ytx-badge-pointer-mode', !fixed);
    // Any pointer-mode "visible" state (and its fade timer) is stale across a mode switch; drop it so the badge settles into the new resting visibility.
    hidePointerBadge();
  };
  syncBadgeVisibility();
  configAddChangeListener('pointerSettingsButton', syncBadgeVisibility);

  // A resting pointer emits synthetic mousemoves with unchanged coordinates as the page scrolls; only a real move counts.
  document.addEventListener(
    'mousemove',
    (evt) => {
      if (evt.clientX === lastPointerX && evt.clientY === lastPointerY) return;
      lastPointerX = evt.clientX;
      lastPointerY = evt.clientY;
      showPointerBadge();
    },
    true
  );
  // webOS reports the pointer appearing/disappearing (it hides on D-pad presses).
  document.addEventListener('cursorStateChange', (evt) => {
    if (evt.detail && evt.detail.visibility === false) hidePointerBadge();
  });
  const ARROW_KEY_CODE = new Set([
    REMOTE_KEYS.LEFT.keyCode,
    REMOTE_KEYS.UP.keyCode,
    REMOTE_KEYS.RIGHT.keyCode,
    REMOTE_KEYS.DOWN.keyCode
  ]);
  window.addEventListener(
    'keydown',
    (evt) => {
      if (ARROW_KEY_CODE.has(evt.keyCode)) hidePointerBadge();
    },
    true
  );
  // Picking a video with the pointer must not leave the button over it.
  window.addEventListener('ytx-page-update', (evt) => {
    if (evt.detail.isWatch || evt.detail.isShorts) hidePointerBadge();
  });
}

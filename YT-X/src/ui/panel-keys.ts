// Focus containment and D-pad / Magic Remote navigation for the open options
// panel.

import { REMOTE_KEYS, isSyntheticKey } from '../core/utils';
import { findSpatialNeighbor, type Direction } from './panel-nav';
import { showOptionsPanel } from './panel-controller';
import { panelState } from './panel-state';

// Magic Remote navigation: the panel overlay is invisible to the host's spatial
// focus engine, so this capture-phase handler (registered before YouTube's) drives D-pad focus itself; inert when the panel is closed.

const PANEL_FOCUSABLE_SELECTOR =
  '.ytx-tab-btn, .ytx-close-btn, .ytx-cycle-row, ' +
  'input[type="checkbox"]:not([disabled])';

// Visible focusable controls in DOM order; the two guards drop hidden pages and negative tabindex, so no page-aware query is needed.
function panelFocusables(): HTMLElement[] {
  if (!panelState.panel) return [];
  return Array.from(
    panelState.panel.querySelectorAll<HTMLElement>(PANEL_FOCUSABLE_SELECTOR)
  ).filter((el) => el.tabIndex >= 0 && el.offsetParent !== null);
}

const NAV_DIRECTIONS = new Map<number, Direction>([
  [REMOTE_KEYS.UP.keyCode, 'ArrowUp'],
  [REMOTE_KEYS.DOWN.keyCode, 'ArrowDown'],
  [REMOTE_KEYS.LEFT.keyCode, 'ArrowLeft'],
  [REMOTE_KEYS.RIGHT.keyCode, 'ArrowRight']
]);

const isHorizontal = (direction: Direction): boolean =>
  direction === 'ArrowLeft' || direction === 'ArrowRight';

const consume = (evt: Event): void => {
  evt.preventDefault();
  evt.stopImmediatePropagation();
};

function handlePanelNavKey(evt: KeyboardEvent): void {
  const panel = panelState.panel;
  if (!panelState.visible || !panel) return;
  // Synthetic events (sendKey) are not remote presses; real input only, same contract as keyboard-search.ts.
  if (isSyntheticKey(evt)) return;

  // Remote Back closes the panel from the capture phase, so it works even when
  // focus has escaped the panel, and it is consumed so YouTube's own back
  // handling cannot navigate the page out from under an open panel. webOS
  // reports the key as keyCode 461; `key` is not stable across engines.
  if (evt.keyCode === REMOTE_KEYS.BACK.keyCode) {
    consume(evt);
    showOptionsPanel(false);
    return;
  }

  const focused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const inPanel = focused !== null && panel.contains(focused);

  const direction = NAV_DIRECTIONS.get(evt.keyCode);
  if (direction) {
    // On a value row, Left/Right step the value itself and never move focus.
    if (
      focused &&
      inPanel &&
      isHorizontal(direction) &&
      focused.classList.contains('ytx-cycle-row')
    ) {
      const arrows = focused.querySelectorAll<HTMLElement>('.arrow-btn');
      const target =
        direction === 'ArrowLeft' ? arrows[0] : arrows[arrows.length - 1];
      if (target) {
        consume(evt);
        target.click();
      }
      return;
    }

    const list = panelFocusables();
    const first = list[0];
    if (!first) return;

    if (!focused || !inPanel || focused === panel) {
      consume(evt);
      first.focus();
      return;
    }

    const next = findSpatialNeighbor(focused, list, direction);
    consume(evt);
    if (next) next.focus();
    return;
  }

  // Space cycles a cycle row too; checkboxes already toggle on Space natively.
  if (
    evt.keyCode === 32 &&
    focused &&
    inPanel &&
    focused.classList.contains('ytx-cycle-row')
  ) {
    consume(evt);
    focused.click();
    return;
  }

  // Checkboxes do not toggle on Enter natively, so the click is issued here and the default suppressed to avoid a second activation.
  if (evt.keyCode === REMOTE_KEYS.ENTER.keyCode && focused && inPanel) {
    if (focused.matches(PANEL_FOCUSABLE_SELECTOR)) {
      consume(evt);
      focused.click();
    }
  }
}

/** Registers the capture-phase focus trap and key handler (before YouTube's). */
export function initPanelKeys(): void {
  // Trap focus inside options panel when visible
  document.addEventListener(
    'focus',
    (e) => {
      const panel = panelState.panel;
      if (!panelState.visible || !panel) return;
      const target = e.target;
      const isSafeFocus = target instanceof Node && panel.contains(target);
      if (isSafeFocus) {
        if (target instanceof HTMLElement) panelState.lastSafeFocus = target;
      } else {
        e.stopPropagation();
        e.preventDefault();
        if (panelState.lastSafeFocus && panelState.lastSafeFocus.isConnected)
          panelState.lastSafeFocus.focus();
        else {
          const firstVisibleInput = panel.querySelector<HTMLElement>(
            '.ytx-tab-btn.active, .ytx-settings-page[style*="block"] input:not([disabled])'
          );
          if (firstVisibleInput) firstVisibleInput.focus();
          else panel.focus();
        }
      }
    },
    true
  );

  window.addEventListener('keydown', handlePanelNavKey, true);
}

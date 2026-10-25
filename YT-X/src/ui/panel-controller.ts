// Opening and closing the options panel.

import { configRead } from '../config/config';
import { setBadgeHidden } from './badge';
import { createOptionsPanel } from './options-panel';
import { applyPanelCareMode } from './panel-care';
import { animatePanelIn, animatePanelOut } from './panel-animation';
import { panelState, syncSponsorBlockPanel } from './panel-state';

/** Where focus was when the panel opened; restored on close. */
let openerFocus: HTMLElement | null = null;

function restoreOpenerFocus(target: HTMLElement | null): void {
  if (!target) return;
  const apply = () => {
    if (target.isConnected && target.getClientRects().length > 0) {
      target.focus();
    }
  };
  // After the panel is hidden, so the focus trap does not fight the move; once more
  // in case YouTube's focus engine reclaimed focus in between.
  requestAnimationFrame(apply);
  setTimeout(apply, 350);
}

export function showOptionsPanel(
  visible = true,
  opener: HTMLElement | null = null
): void {
  if (panelState.initBlock) {
    return;
  }

  if (visible && !panelState.visible) {
    let panel = panelState.panel;
    if (!panel) {
      panelState.initBlock = true;
      setTimeout(() => {
        panelState.initBlock = false;
      }, 500);
      panel = panelState.panel = createOptionsPanel(() =>
        showOptionsPanel(false)
      );
      document.body.appendChild(panel);

      applyPanelCareMode(configRead('panelCareMode'));
    }

    const candidate =
      opener ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    openerFocus =
      candidate &&
      candidate !== document.body &&
      candidate !== document.documentElement &&
      !panel.contains(candidate)
        ? candidate
        : null;

    panel.style.display = 'block';
    animatePanelIn(panel);
    panel.buildDeferredPages();
    panel.recalcDensity();
    syncSponsorBlockPanel(true);

    const activeTabBtn = panel.querySelector<HTMLElement>(
      '.ytx-tab-btn.active'
    );
    if (activeTabBtn) {
      activeTabBtn.focus();
      panelState.lastSafeFocus = activeTabBtn;
    } else {
      panel.focus();
      panelState.lastSafeFocus = panel;
    }
    panelState.visible = true;
  } else if (!visible && panelState.visible && panelState.panel) {
    animatePanelOut(panelState.panel);
    syncSponsorBlockPanel(false);
    panelState.panel.blur();
    panelState.visible = false;
    panelState.lastSafeFocus = null;
    restoreOpenerFocus(openerFocus);
    openerFocus = null;
  }

  setBadgeHidden(panelState.visible);
}

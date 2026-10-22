// Opening and closing the options panel.

import { configRead } from '../config/config';
import { setBadgeHidden } from './badge';
import { createOptionsPanel } from './options-panel';
import { applyPanelCareMode } from './panel-care';
import { animatePanelIn, animatePanelOut } from './panel-animation';
import { panelState, syncSponsorBlockPanel } from './panel-state';

export function showOptionsPanel(visible = true): void {
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
  }

  setBadgeHidden(panelState.visible);
}

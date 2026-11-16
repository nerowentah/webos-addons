// UI entry point: wires the options panel, badge, themes and scale together.
// The pieces live in panel-*.ts, badge.ts, panel-care.ts and options-panel.ts;
// the order below is the order their listeners register, which matters for
// capture-phase handlers competing with YouTube's.

import './ui.css';
import './theme.css';
import { addTVSpecsChangeListener, refreshUIScale } from '../platform/tv-specs';
import { initBadge } from './badge';
import { showOptionsPanel } from './panel-controller';
import { initPanelCare } from './panel-care';
import { initPanelKeys } from './panel-keys';
import { initTextScale } from './text-scale';
import { initOpenShortcut } from './shortcut';
import { initExitKeys } from '../core/exit-keys';
import { initExitDialogKeys } from './exit-dialog';
import { panelState, setSponsorBlockPanelSync } from './panel-state';

export { showNotification } from './notifications';
export { setSponsorBlockPanelSync };

initPanelKeys();
initOpenShortcut();
// Before Back handling, so an open exit dialog owns every key.
initExitDialogKeys();
// After the panel's handler, so an open panel still consumes Back first.
initExitKeys();

initBadge(() => showOptionsPanel(!panelState.visible));

initPanelCare();
initTextScale();

// --ytx-ui-scale is owned by tv-specs but measured here (the site's stylesheets
// are only present in-page), so it re-runs on every specs change and the panel's density relayout rides along.
addTVSpecsChangeListener(() => {
  refreshUIScale();
  panelState.panel?.recalcDensity();
});
refreshUIScale();

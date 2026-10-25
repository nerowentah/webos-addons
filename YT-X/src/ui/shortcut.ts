// GREEN on the remote opens the settings panel. The badge stays out of
// YouTube's D-pad focus order (it would steal tile hover focus), so this is the
// keyboard way in. Registered in the capture phase, before YouTube's handlers.

import { isOpenPanelKey, isSyntheticKey } from '../core/keys';
import { showOptionsPanel } from './panel-controller';
import { panelState } from './panel-state';

function isEditing(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
  );
}

export function initOpenShortcut(): void {
  window.addEventListener(
    'keydown',
    (evt) => {
      const active = document.activeElement;
      if (
        !isOpenPanelKey(evt, {
          synthetic: isSyntheticKey(evt),
          panelVisible: panelState.visible,
          editing: isEditing(active)
        })
      ) {
        return;
      }
      evt.preventDefault();
      evt.stopImmediatePropagation();
      showOptionsPanel(true, active instanceof HTMLElement ? active : null);
    },
    true
  );
}

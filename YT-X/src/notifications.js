import { configRead } from './config.js';
import { resolvePanelCareMode } from './tv-specs';
import { MAX_UI_TEXT } from './ui-text.js';

// Container created lazily on first showNotification(); ensureContainer() reads
// the initial config, so the care-mode setter is a no-op until then.
let notificationContainer = null;

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

/**
 * Hard cap on a toast's length; a few strings interpolate values the app cannot control.
 */
function clampText(text) {
  if (typeof text !== 'string' || text.length <= MAX_UI_TEXT) return text;
  console.warn(
    `[notifications] message trimmed to ${MAX_UI_TEXT} chars: ${text}`
  );
  return text.slice(0, MAX_UI_TEXT - 1).trimEnd() + '…';
}

function ensureContainer() {
  if (notificationContainer) return notificationContainer;
  notificationContainer = makeEl('div', 'ytx-notification-container');
  const careMode = resolvePanelCareMode(configRead('panelCareMode'));
  if (careMode !== 'off')
    notificationContainer.classList.add(
      careMode === 'qned' ? 'qned-care' : 'oled-care'
    );
  document.body.appendChild(notificationContainer);
  return notificationContainer;
}

// Live messages, keyed by text, so duplicates are reused rather than stacked.
const liveMessages = new Map();

// The border colour comes from the stylesheet, so the message follows the active theme.
export function showNotification(text, time = 3000) {
  const container = ensureContainer();
  text = clampText(text);

  const existing = liveMessages.get(text);
  if (
    existing &&
    existing.elmInner.isConnected &&
    !existing.elmInner.classList.contains('message-hidden')
  ) {
    if (time > 0) existing.handle.update(text, time);
    return existing.handle;
  }

  const elmInner = makeEl('div', 'message message-hidden', text);
  const elm = makeEl('div');
  elm.appendChild(elmInner);
  container.appendChild(elm);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => elmInner.classList.remove('message-hidden'))
  );

  const remove = () => {
    if (elmInner._removeTimer) clearTimeout(elmInner._removeTimer);
    elmInner._removeTimer = null;
    elmInner.classList.add('message-hidden');
    if (liveMessages.get(elmInner.textContent)?.elmInner === elmInner) {
      liveMessages.delete(elmInner.textContent);
    }
    // Always removes the same wrapper node.
    setTimeout(() => elm.remove(), 1000);
  };

  if (time > 0) elmInner._removeTimer = setTimeout(remove, time);

  const update = (newText, newTime = 3000) => {
    newText = clampText(newText);
    if (elmInner.textContent === newText) {
      if (newTime > 0) {
        if (elmInner._removeTimer) clearTimeout(elmInner._removeTimer);
        elmInner._removeTimer = setTimeout(remove, newTime);
      }
      return;
    }
    if (liveMessages.get(elmInner.textContent)?.elmInner === elmInner) {
      liveMessages.delete(elmInner.textContent);
    }
    elmInner.textContent = newText;
    elmInner.classList.remove('message-hidden');
    if (elmInner._removeTimer) clearTimeout(elmInner._removeTimer);
    if (newTime > 0) elmInner._removeTimer = setTimeout(remove, newTime);
    liveMessages.set(newText, { elmInner, handle });
  };

  const handle = { remove, update };
  liveMessages.set(text, { elmInner, handle });
  return handle;
}

export function setNotificationPanelCare(mode) {
  if (!notificationContainer) return;
  notificationContainer.classList.toggle('oled-care', mode === 'oled');
  notificationContainer.classList.toggle('qned-care', mode === 'qned');
}

import { configRead } from './config.js';
import { resolvePanelCareMode } from './tv-specs';

// Notification container is created lazily on first showNotification() call.
// The care-mode setter is a no-op until then; ui.js wires it on config changes.
// ensureContainer() still reads the initial config so a notification shown
// before ui.js applies anything still gets the right classes.
let notificationContainer = null;

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
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

// Live messages, keyed by text. Replaces an
// Array.from(querySelectorAll('.message')).find(...) scan that allocated an
// array of every on-screen message on each call.
const liveMessages = new Map();

// The border colour comes from the stylesheet, so the message follows the
// active theme and care mode.
export function showNotification(text, time = 3000) {
  const container = ensureContainer();

  // Reuse an existing visible message with the same text instead of stacking
  // duplicates — just extend its timer.
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
    // Always removes the same wrapper node. The old duplicate-detection path
    // removed `existing.parentElement` while this removed `elm` — two different
    // nodes for the same conceptual "dismiss this notification".
    setTimeout(() => elm.remove(), 1000);
  };

  if (time > 0) elmInner._removeTimer = setTimeout(remove, time);

  const update = (newText, newTime = 3000) => {
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

import { configRead } from '../config/config';
import { resolvePanelCareMode } from '../platform/tv-specs';
import { MAX_UI_TEXT } from '../config/ui-text';

export interface NotificationHandle {
  remove(): void;
  update(newText: string, newTime?: number): void;
}

interface LiveMessage {
  elmInner: HTMLElement;
  handle: NotificationHandle;
}

// Container created lazily on first showNotification(); ensureContainer() reads
// the initial config, so the care-mode setter is a no-op until then.
let notificationContainer: HTMLElement | null = null;

function makeEl(tag: 'div', className?: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

/**
 * Hard cap on a toast's length; a few strings interpolate values the app cannot control.
 */
function clampText(text: string): string {
  if (text.length <= MAX_UI_TEXT) return text;
  return text.slice(0, MAX_UI_TEXT - 1).trimEnd() + '…';
}

function ensureContainer(): HTMLElement {
  if (notificationContainer) return notificationContainer;
  const container = makeEl('div', 'ytx-notification-container');
  // Polite live region: a toast's text is announced when it is inserted or changed.
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  const careMode = resolvePanelCareMode(configRead('panelCareMode'));
  if (careMode !== 'off')
    container.classList.add(careMode === 'qned' ? 'qned-care' : 'oled-care');
  document.body.appendChild(container);
  notificationContainer = container;
  return container;
}

/** The CSS opacity transition on .message (ui.css); after it the text is hidden from assistive tech. */
const FADE_MS = 200;

// Live messages, keyed by text, so duplicates are reused rather than stacked.
const liveMessages = new Map<string, LiveMessage>();

// The border colour comes from the stylesheet, so the message follows the active theme.
export function showNotification(
  text: string,
  time = 3000
): NotificationHandle {
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

  let currentText = text;
  let removeTimer: ReturnType<typeof setTimeout> | null = null;

  const forgetCurrent = () => {
    if (liveMessages.get(currentText)?.elmInner === elmInner) {
      liveMessages.delete(currentText);
    }
  };

  const remove = () => {
    if (removeTimer) clearTimeout(removeTimer);
    removeTimer = null;
    elmInner.classList.add('message-hidden');
    // Opacity alone leaves the faded text in the accessibility tree.
    setTimeout(() => {
      if (elmInner.classList.contains('message-hidden')) {
        elmInner.setAttribute('aria-hidden', 'true');
      }
    }, FADE_MS);
    forgetCurrent();
    // Always removes the same wrapper node.
    setTimeout(() => elm.remove(), 1000);
  };

  if (time > 0) removeTimer = setTimeout(remove, time);

  const update = (newText: string, newTime = 3000) => {
    newText = clampText(newText);
    if (currentText === newText) {
      if (newTime > 0) {
        if (removeTimer) clearTimeout(removeTimer);
        removeTimer = setTimeout(remove, newTime);
      }
      return;
    }
    forgetCurrent();
    currentText = newText;
    elmInner.textContent = newText;
    elmInner.classList.remove('message-hidden');
    elmInner.removeAttribute('aria-hidden');
    if (removeTimer) clearTimeout(removeTimer);
    if (newTime > 0) removeTimer = setTimeout(remove, newTime);
    liveMessages.set(newText, { elmInner, handle });
  };

  const handle: NotificationHandle = { remove, update };
  liveMessages.set(text, { elmInner, handle });
  return handle;
}

export function setNotificationPanelCare(mode: string): void {
  if (!notificationContainer) return;
  notificationContainer.classList.toggle('oled-care', mode === 'oled');
  notificationContainer.classList.toggle('qned-care', mode === 'qned');
}

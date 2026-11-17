// The "Close YouTube-X?" confirmation. Every exit path (Back at the home page,
// YouTube's own window.close) ends here, so the remote cannot drop out of the
// app by accident. Exit force-closes; Cancel and Back return to the page.

import { PANEL } from '../config/ui-text';
import { configRead } from '../config/config';
import { isSyntheticKey } from '../core/keys';
import { isClosing } from '../platform/app-close';
import { forceClose } from '../platform/close-on-exit';
import { isBlackedOut } from '../platform/screen-off';
import { resolvePanelCareMode } from '../platform/tv-specs';
import { createElement } from './dom';
import {
  DEFAULT_EXIT_CHOICE,
  exitDialogKey,
  type ExitChoice
} from './exit-dialog-keys';

interface OpenDialog {
  root: HTMLElement;
  buttons: Record<ExitChoice, HTMLElement>;
  focus: ExitChoice;
  /** Where focus was before the dialog took it. */
  opener: HTMLElement | null;
}

let open: OpenDialog | null = null;

const consume = (evt: Event): void => {
  evt.preventDefault();
  evt.stopImmediatePropagation();
};

function setFocus(dialog: OpenDialog, choice: ExitChoice): void {
  dialog.focus = choice;
  for (const key of ['exit', 'cancel'] as const) {
    dialog.buttons[key].classList.toggle('ytx-focused', key === choice);
  }
  dialog.buttons[choice].focus();
}

function dismiss(): void {
  const dialog = open;
  if (!dialog) return;
  open = null;
  dialog.root.remove();
  const target = dialog.opener;
  if (target?.isConnected) target.focus();
}

function settle(choice: ExitChoice): void {
  dismiss();
  if (choice === 'exit') forceClose();
}

function onKey(evt: KeyboardEvent): void {
  const dialog = open;
  if (!dialog) return;
  // The dialog is modal: every real key press is ours, whether or not it does anything.
  if (isSyntheticKey(evt)) return;
  consume(evt);
  if (evt.repeat) return;
  const step = exitDialogKey(evt.keyCode, dialog.focus);
  if (step.action) {
    settle(step.action);
    return;
  }
  if (step.focus !== dialog.focus) setFocus(dialog, step.focus);
}

function buildDialog(): OpenDialog {
  const text = PANEL.exitDialog;
  const make = (choice: ExitChoice, label: string): HTMLElement =>
    createElement('button', {
      class: 'ytx-exit-btn',
      type: 'button',
      text: label,
      events: {
        click: () => settle(choice),
        mouseenter: () => open && setFocus(open, choice)
      }
    });
  const buttons = {
    exit: make('exit', text.exit),
    cancel: make('cancel', text.cancel)
  };
  const care = resolvePanelCareMode(configRead('panelCareMode'));
  const root = createElement(
    'div',
    {
      class: `ytx-exit-dialog${care === 'oled' ? ' oled-care' : care === 'qned' ? ' qned-care' : ''}`,
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-label': text.title
    },
    createElement(
      'div',
      { class: 'ytx-exit-box' },
      createElement('div', { class: 'ytx-exit-title', text: text.title }),
      createElement(
        'div',
        { class: 'ytx-exit-actions' },
        buttons.exit,
        buttons.cancel
      )
    )
  );
  const active = document.activeElement;
  return {
    root,
    buttons,
    focus: DEFAULT_EXIT_CHOICE,
    opener:
      active instanceof HTMLElement && active !== document.body ? active : null
  };
}

/**
 * Asks whether to close the app. With the screen blacked out the dialog would
 * sit unseen under the black layer and nothing could answer it, so it closes
 * straight away; a close already under way, or a dialog already up, makes this
 * a no-op.
 */
export function requestExit(): void {
  if (isClosing() || open) return;
  if (isBlackedOut()) {
    forceClose();
    return;
  }
  const dialog = buildDialog();
  open = dialog;
  document.body.appendChild(dialog.root);
  setFocus(dialog, DEFAULT_EXIT_CHOICE);
}

/** Keeps focus inside the dialog; YouTube's focus engine would otherwise take it. */
function onFocusIn(evt: FocusEvent): void {
  const dialog = open;
  if (!dialog) return;
  const target = evt.target;
  if (target instanceof Node && dialog.root.contains(target)) return;
  dialog.buttons[dialog.focus].focus();
}

/**
 * Registers the dialog's capture-phase key handler once, ahead of YouTube's, so
 * it owns every key while the dialog is up. Inert while the dialog is closed.
 */
export function initExitDialogKeys(): void {
  window.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', onFocusIn, true);
}

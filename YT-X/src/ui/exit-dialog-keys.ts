// Key handling for the Exit / Cancel dialog, kept DOM-free so it is unit-testable.
// Two buttons side by side: Exit on the left, Cancel on the right.

import { REMOTE_KEYS } from '../core/keys';

export type ExitChoice = 'exit' | 'cancel';

/** Focused when the dialog opens: Cancel, so a stray OK cannot close the app. */
export const DEFAULT_EXIT_CHOICE: ExitChoice = 'cancel';

export interface ExitDialogStep {
  /** The button that has focus after the key. */
  focus: ExitChoice;
  /** Set when the key settles the dialog. */
  action: ExitChoice | null;
}

/**
 * Left/Right move focus, Enter activates the focused button, Back (and the
 * Escape that Cobalt sends for it) cancels. Every other key leaves the state
 * alone; the dialog is modal, so the caller consumes all of them regardless.
 */
export function exitDialogKey(
  keyCode: number,
  focus: ExitChoice
): ExitDialogStep {
  switch (keyCode) {
    case REMOTE_KEYS.LEFT.keyCode:
      return { focus: 'exit', action: null };
    case REMOTE_KEYS.RIGHT.keyCode:
      return { focus: 'cancel', action: null };
    case REMOTE_KEYS.ENTER.keyCode:
      return { focus, action: focus };
    case REMOTE_KEYS.BACK.keyCode:
    case REMOTE_KEYS.ESCAPE.keyCode:
      return { focus, action: 'cancel' };
    default:
      return { focus, action: null };
  }
}

// Pure text matchers for the "Video paused. Continue watching?" prompt, kept
// dependency-free so they can be unit-tested without a DOM.
const DIALOG_TEXT_RE =
  /video paused|continue watching|still watching|are you still/i;
const CONFIRM_LABEL_RE = /^(?:yes|continue|keep watching|resume|ok)/i;

/** True when `text` looks like the inactivity "continue watching" prompt. */
export function matchesContinueWatchingText(text) {
  return typeof text === 'string' && DIALOG_TEXT_RE.test(text);
}

/** True when `label` is an affirmative control of that prompt. */
export function isConfirmLabel(label) {
  return typeof label === 'string' && CONFIRM_LABEL_RE.test(label.trim());
}

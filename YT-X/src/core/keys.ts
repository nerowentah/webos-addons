export interface KeyDef {
  /** Legacy `keyCode`/`which`: the value YouTube's key handling reads. */
  readonly keyCode: number;
  readonly key: string;
  /** `KeyboardEvent.code`; empty where the key has no standard physical code. */
  readonly code: string;
  /** Alternate keyCodes emitted by some webOS remotes. */
  readonly alt?: readonly number[];
}

const def = (
  keyCode: number,
  key: string,
  code: string,
  alt?: readonly number[]
): KeyDef =>
  Object.freeze(
    alt
      ? { keyCode, key, code, alt: Object.freeze([...alt]) }
      : { keyCode, key, code }
  );

export const REMOTE_KEYS = Object.freeze({
  ENTER: def(13, 'Enter', 'Enter'),
  BACK: def(461, 'Back', ''),
  ESCAPE: def(27, 'Escape', 'Escape'),
  LEFT: def(37, 'ArrowLeft', 'ArrowLeft'),
  UP: def(38, 'ArrowUp', 'ArrowUp'),
  RIGHT: def(39, 'ArrowRight', 'ArrowRight'),
  DOWN: def(40, 'ArrowDown', 'ArrowDown'),
  RED: def(403, 'Red', '', [166]),
  GREEN: def(404, 'Green', '', [172]),
  YELLOW: def(405, 'Yellow', '', [170]),
  BLUE: def(406, 'Blue', '', [167, 191]),

  // Numeric keys 0-9 are mechanical: keyCode 48 + n.
  0: def(48, '0', 'Digit0'),
  1: def(49, '1', 'Digit1'),
  2: def(50, '2', 'Digit2'),
  3: def(51, '3', 'Digit3'),
  4: def(52, '4', 'Digit4'),
  5: def(53, '5', 'Digit5'),
  6: def(54, '6', 'Digit6'),
  7: def(55, '7', 'Digit7'),
  8: def(56, '8', 'Digit8'),
  9: def(57, '9', 'Digit9')
});

type ColorName = 'red' | 'green' | 'yellow' | 'blue';

const COLOR_KEYS = [
  ['red', REMOTE_KEYS.RED],
  ['green', REMOTE_KEYS.GREEN],
  ['yellow', REMOTE_KEYS.YELLOW],
  ['blue', REMOTE_KEYS.BLUE]
] as const satisfies readonly (readonly [ColorName, KeyDef])[];

const colorByCode = new Map<number, ColorName>();
for (const [name, { keyCode, alt }] of COLOR_KEYS) {
  colorByCode.set(keyCode, name);
  for (const altCode of alt ?? []) colorByCode.set(altCode, name);
}

/** Single source of truth for colour-key codes, including the alternates some remotes emit; consumed by keyboard-search.ts. Read-only: the backing map is private. */
export const COLOR_CODE_MAP = Object.freeze({
  has: (keyCode: number): boolean => colorByCode.has(keyCode),
  get: (keyCode: number): ColorName | undefined => colorByCode.get(keyCode)
});

// Stamped onto every synthesised KeyboardEvent so our listeners can tell them
// from a real press; `isTrusted` is not set reliably on all engines. Registered
// symbol, so a second bundle copy still agrees on the flag.
export const SYNTHETIC_KEY_FLAG: unique symbol = Symbol.for(
  'ytx.syntheticKey'
) as never;

/** Whether `evt` was produced by `sendKey` rather than a real press. */
export function isSyntheticKey(evt: Event): boolean {
  return (
    !evt.isTrusted ||
    (evt as unknown as Record<symbol, unknown>)[SYNTHETIC_KEY_FLAG] === true
  );
}

function makeKeyEvent(type: 'keydown' | 'keyup', keyDef: KeyDef) {
  const evt = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: false,
    composed: true,
    view: window,
    key: keyDef.key,
    code: keyDef.code
  });

  // The KeyboardEvent constructor ignores keyCode/which/charCode, so redefine them.
  Object.defineProperties(evt, {
    keyCode: { get: () => keyDef.keyCode },
    which: { get: () => keyDef.keyCode },
    charCode: { get: () => 0 },
    [SYNTHETIC_KEY_FLAG]: { value: true }
  });
  return evt;
}

/** Dispatches a synthetic keydown+keyup for `keyDef` at `target` (default `document.body`), stamped with SYNTHETIC_KEY_FLAG. No-op without a target. */
export function sendKey(
  keyDef: KeyDef | null | undefined,
  target: EventTarget | null = document.body
): void {
  if (!keyDef || !keyDef.keyCode || !target) return;

  target.dispatchEvent(makeKeyEvent('keydown', keyDef));
  target.dispatchEvent(makeKeyEvent('keyup', keyDef));
}

/**
 * Whether a keydown should open the settings panel: the GREEN colour key (or
 * the alternate code some remotes send), from a real press, not a repeat, not
 * while the panel is open and not while the user is typing.
 */
export function isOpenPanelKey(
  evt: { keyCode: number; repeat: boolean },
  ctx: { synthetic: boolean; panelVisible: boolean; editing: boolean }
): boolean {
  return (
    !ctx.synthetic &&
    !ctx.panelVisible &&
    !ctx.editing &&
    !evt.repeat &&
    COLOR_CODE_MAP.get(evt.keyCode) === 'green'
  );
}

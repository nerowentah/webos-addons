import { configRead } from '../../config/config';
import { isSearchPage, isSyntheticKey, COLOR_CODE_MAP } from '../../core/utils';

/**
 * Types in Search with a USB/Bluetooth keyboard by pressing the on-screen
 * keyboard's keys. The first character probes whether the app already takes
 * printable keys natively; if not, each press strategy is tried until the
 * query changes, failing safe (no matching key -> YouTube gets it untouched).
 * Remote rules kept: digits only within TYPING_WINDOW_MS of another key,
 * Enter only right after typing, Backspace only undoes keys typed here;
 * arrows/OK/Back/colour/modifier keys and keys in a text field or the
 * settings panel are never touched.
 */

// A digit or an Enter counts as keyboard input this long after a typed key.
const TYPING_WINDOW_MS = 3000;
// How long the query gets to settle; generous so a slow TV that types natively but late is not also typed for by this module.
const SETTLE_MS = 400;

const KEY_SELECTOR = 'yt-keyboard-key, ytlr-keyboard-key';
const KEY_CLASS_SELECTOR =
  '[class*="ytKeyboardKey"], [class*="ytLrKeyboardKey"]';
const QUERY_SELECTORS = ['ytlr-search-text-box', 'ytlr-search-bar'];

// On-screen key labels are in the UI language; icon class names are not, so they are the fallback.
const SPACE_LABEL =
  /^(?:space|space ?bar|espace|espacio|espaço|leerzeichen|spazio|spatie|spacja|mezera|medzera|szóköz|spațiu|razmak|presledek|пробел|пробіл|интервал|boşluk|mellanslag|mellemrum|välilyönti|mellomrom|διάστημα|スペース|공백|空格)$/i;
const BACKSPACE_LABEL = /^(?:backspace|delete|del|⌫)$/i;
const SEARCH_LABEL =
  /^(?:search|suchen|rechercher|buscar|pesquisar|cerca|zoeken|szukaj|hledat|hľadať|keresés|căutare|traži|pretraži|ara|sök|søg|haku|søk|поиск|пошук|търсене|αναζήτηση|検索|검색|搜索)$/i;
const SPACE_ICON = /space/i;
const BACKSPACE_ICON = /backspace|delete|erase/i;
const SEARCH_ICON = /search|magnif/i;

// US layout, only for engines without KeyboardEvent.key (Chrome < 51).
const PUNCTUATION: Record<number, string> = {
  186: ';',
  187: '=',
  188: ',',
  189: '-',
  190: '.',
  192: '`',
  219: '[',
  220: '\\',
  221: ']',
  222: "'"
};

const KEY_BACKSPACE = 8;
const KEY_ENTER = 13;

// 'unknown' until the first character settles it: 'native' (YouTube types by itself), 'osk' (we press on-screen keys) or 'none' (nothing worked).
type Mode = 'unknown' | 'native' | 'osk' | 'none';

/** The first character(s) typed while the mode is undecided, queued until YouTube's reaction is known. */
interface Probe {
  before: string | null;
  chars: string[];
  timer: ReturnType<typeof setTimeout> | null;
}

let mode: Mode = 'unknown';
let pressStrategy = 0;
let lastTypedAt = 0;
let typedCount = 0;
let probe: Probe | null = null;
const swallowedKeyUps: number[] = [];

function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function onScreenKeys(): HTMLElement[] {
  let keys = Array.from(document.querySelectorAll<HTMLElement>(KEY_SELECTOR));
  if (keys.length === 0) {
    // Class-named keys: keep the outermost element of each key, not its label.
    keys = Array.from(
      document.querySelectorAll<HTMLElement>(KEY_CLASS_SELECTOR)
    ).filter(
      (el) => !el.parentElement || !el.parentElement.closest(KEY_CLASS_SELECTOR)
    );
  }
  return keys.filter(isVisible);
}

function labelOf(el: Element): string {
  return (el.getAttribute('aria-label') || el.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function iconClassesOf(el: Element): string {
  let names = typeof el.className === 'string' ? el.className : '';
  for (const inner of el.querySelectorAll('[class]')) {
    const c = inner.getAttribute('class');
    if (c) names += ' ' + c;
  }
  return names;
}

function findKey(ch: string): HTMLElement | null {
  const keys = onScreenKeys();
  if (ch === ' ') return findSpecialKey(keys, SPACE_LABEL, SPACE_ICON);
  const wanted = ch.toLowerCase();
  for (const key of keys) {
    const label = labelOf(key);
    if (label.length === 1 && label.toLowerCase() === wanted) return key;
  }
  return null;
}

function findSpecialKey(
  keys: readonly HTMLElement[],
  labelPattern: RegExp,
  iconPattern: RegExp
): HTMLElement | null {
  for (const key of keys) {
    if (labelPattern.test(labelOf(key))) return key;
  }
  // Icon-only keys: no text of their own, the icon's class names the job.
  for (const key of keys) {
    if (
      (key.textContent || '').trim() === '' &&
      iconPattern.test(iconClassesOf(key))
    )
      return key;
  }
  return null;
}

function queryText(): string | null {
  for (const selector of QUERY_SELECTORS) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input, textarea'
    );
    return input ? input.value : el.textContent || '';
  }
  return null;
}

interface Point {
  clientX: number;
  clientY: number;
}

function centreOf(el: Element): Point {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
}

function dispatchMouse(el: Element, type: string, at: Point): void {
  let evt: MouseEvent;
  try {
    evt = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: at.clientX,
      clientY: at.clientY,
      button: 0
    });
  } catch {
    // Engines without the MouseEvent constructor.
    evt = document.createEvent('MouseEvents');
    evt.initMouseEvent(
      type,
      true,
      true,
      window,
      1,
      0,
      0,
      at.clientX,
      at.clientY,
      false,
      false,
      false,
      false,
      0,
      null
    );
  }
  el.dispatchEvent(evt);
}

// Ways of pressing an on-screen key, tried in order until one changes the query; the working one is kept.
const PRESS_STRATEGIES: readonly ((el: HTMLElement) => void)[] = [
  function click(el) {
    el.click();
  },
  function pointer(el) {
    const at = centreOf(el);
    ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(
      (type) => {
        dispatchMouse(el, type, at);
      }
    );
  },
  function instance(el) {
    const inst = el.__instance;
    if (!inst || typeof inst.onSelect !== 'function') return;
    inst.onSelect({
      type: 'click',
      stopPropagation() {},
      preventDefault() {},
      target: el,
      currentTarget: el,
      bubbles: true,
      cancelable: true
    });
  }
];

function press(el: HTMLElement, strategy: number): boolean {
  try {
    const run = PRESS_STRATEGIES[strategy];
    if (!run) return false;
    run(el);
    return true;
  } catch {
    return false;
  }
}

function swallow(evt: KeyboardEvent): void {
  evt.preventDefault();
  evt.stopImmediatePropagation();
  // YouTube may act on the keyup too; it gets neither half.
  if (!swallowedKeyUps.includes(evt.keyCode)) swallowedKeyUps.push(evt.keyCode);
}

function printableChar(evt: KeyboardEvent): string | null {
  if (evt.ctrlKey || evt.altKey || evt.metaKey) return null;
  const code = evt.keyCode;
  if (COLOR_CODE_MAP.has(code)) return null;
  const key = evt.key;
  if (typeof key === 'string' && key !== 'Unidentified' && key !== '') {
    return key.length === 1 ? key : null; // a named key: Enter, ArrowLeft, ...
  }
  if (code >= 65 && code <= 90) return String.fromCharCode(code + 32);
  if (code >= 48 && code <= 57 && !evt.shiftKey) return String(code - 48);
  if (code === 32) return ' ';
  return PUNCTUATION[code] ?? null;
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function inOwnTerritory(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
    return true;
  return target.closest('.ytx-ui-container') !== null;
}

function resetSession(): void {
  if (probe && probe.timer) clearTimeout(probe.timer);
  probe = null;
  lastTypedAt = 0;
  typedCount = 0;
  swallowedKeyUps.length = 0;
  // Nothing worked on the last visit: maybe the keyboard was not up. Try again.
  if (mode === 'none') mode = 'unknown';
}

/** Types characters on the on-screen keyboard, with the press that works. */
function typeOnScreen(chars: readonly string[]): void {
  for (const ch of chars) {
    const key = findKey(ch);
    if (key && press(key, pressStrategy)) typedCount++;
  }
}

/** The probe character went to YouTube; if the query did not change, find a press strategy that does, then type everything queued meanwhile. */
function settleProbe(): void {
  const p = probe;
  if (!p) return;
  p.timer = null;
  const now = queryText();
  if (now !== p.before) {
    mode = 'native';
    typedCount += p.chars.length;
    probe = null;
    return;
  }
  tryStrategy(p, 0);
}

function tryStrategy(p: Probe, strategy: number): void {
  if (probe !== p) return;
  if (!isSearchPage()) {
    probe = null;
    return;
  }
  const first = p.chars[0];
  const key = first === undefined ? null : findKey(first);
  if (!key) {
    // No key to press for it (keyboard not shown, another layout or script); drop that character and decide on the next one.
    p.chars.shift();
    if (p.chars.length === 0) {
      probe = null;
      return;
    }
    tryStrategy(p, strategy);
    return;
  }
  const before = queryText();
  press(key, strategy);
  p.timer = setTimeout(() => {
    p.timer = null;
    if (probe !== p) return;
    if (queryText() !== before) {
      mode = 'osk';
      pressStrategy = strategy;
      typedCount++;
      probe = null;
      typeOnScreen(p.chars.slice(1));
    } else if (strategy + 1 < PRESS_STRATEGIES.length) {
      tryStrategy(p, strategy + 1);
    } else {
      mode = 'none';
      probe = null;
    }
  }, SETTLE_MS);
}

function onKeyDown(evt: KeyboardEvent): void {
  if (isSyntheticKey(evt)) return;
  if (mode === 'none' || !isSearchPage() || !configRead('keyboardSearch'))
    return;
  if (inOwnTerritory(evt.target) || inOwnTerritory(document.activeElement))
    return;

  const now = Date.now();
  const typing = now - lastTypedAt < TYPING_WINDOW_MS;
  const code = evt.keyCode;

  if (code === KEY_BACKSPACE) {
    // Only what was typed here, and only when we are the ones typing.
    if (mode !== 'osk' || typedCount === 0) return;
    const key = findSpecialKey(onScreenKeys(), BACKSPACE_LABEL, BACKSPACE_ICON);
    if (!key) return;
    swallow(evt);
    if (press(key, pressStrategy)) typedCount--;
    lastTypedAt = now;
    return;
  }

  if (code === KEY_ENTER) {
    // The remote's OK sends the same code: Enter submits only right after keyboard typing.
    if (mode !== 'osk' || !typing || typedCount === 0) return;
    const key = findSpecialKey(onScreenKeys(), SEARCH_LABEL, SEARCH_ICON);
    if (!key) return;
    swallow(evt);
    press(key, pressStrategy);
    lastTypedAt = 0;
    typedCount = 0;
    return;
  }

  const ch = printableChar(evt);
  if (ch === null) return;
  if (isDigit(ch) && !typing) return; // the remote's number keys stay shortcuts

  if (mode === 'native') {
    lastTypedAt = now;
    typedCount++;
    return;
  }

  if (mode === 'osk') {
    const key = findKey(ch);
    if (!key) return;
    swallow(evt);
    if (press(key, pressStrategy)) typedCount++;
    lastTypedAt = now;
    return;
  }

  lastTypedAt = now;
  if (probe) {
    // Still deciding: YouTube gets this one too, and it is queued in case YouTube does nothing with it.
    probe.chars.push(ch);
    return;
  }
  const before = queryText();
  if (before === null) return; // nothing to watch: no way to tell, so no touching
  const next: Probe = { before, chars: [ch], timer: null };
  next.timer = setTimeout(settleProbe, SETTLE_MS);
  probe = next;
}

function onKeyUp(evt: KeyboardEvent): void {
  if (isSyntheticKey(evt)) return;
  const i = swallowedKeyUps.indexOf(evt.keyCode);
  if (i === -1) return;
  swallowedKeyUps.splice(i, 1);
  evt.preventDefault();
  evt.stopImmediatePropagation();
}

// Window capture, registered before YouTube's app code runs, so a key typed here never also reaches YouTube's own handlers.
window.addEventListener('keydown', onKeyDown, true);
window.addEventListener('keyup', onKeyUp, true);
window.addEventListener('ytx-page-update', (evt) => {
  if (!evt.detail.isSearch) resetSession();
});

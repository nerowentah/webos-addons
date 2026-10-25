// Gaps in Cobalt's engine, measured on the TV or taken from its supported-features
// list, that the shared code would otherwise trip over.
//
// DOM/JS: Element.remove, Element.closest, HTMLElement.click and Node.isConnected
// are missing, as is the `HTMLInputElement` global; URL has no `searchParams`
// (use string parsing); requestIdleCallback is filled defensively.
// Behaviour: checkboxes do not activate on Enter (panel-keys.ts issues the click);
// text set on a <style> already in the document is ignored (insert-style.ts
// appends after a microtask); MutationObserver may omit attributeOldValue
// (core/utils.ts re-checks the page state instead).
// CSS gaps (grid, :checked, :focus-within, structural pseudos, var(), 8-digit
// hex, @keyframes on transform that aborts the app) are guarded by
// tools/cobalt-css.test.ts. The shared code uses all of the above, so fill them in.
// These gaps are the legacy Cobalt engine's (23.lts, in RF1705's runtime), whose
// supported-features list names only a partial DOM4 and URL; the newer
// Blink-based Cobalt lacks none of them, so the fills are no-ops there.

if (typeof Element !== 'undefined' && !Element.prototype.remove) {
  Element.prototype.remove = function remove(this: Element): void {
    this.parentNode?.removeChild(this);
  };
}

if (typeof Element !== 'undefined' && !Element.prototype.closest) {
  Element.prototype.closest = function closest(
    this: Element,
    selector: string
  ): Element | null {
    if (this.matches(selector)) return this;
    return this.parentElement ? this.parentElement.closest(selector) : null;
  } as Element['closest'];
}

// Node.isConnected: getVideo() and the injected <style> checks read it; undefined
// would read as "detached" forever (cache never hits, a new <style> per tick).
if (
  typeof Node !== 'undefined' &&
  !Object.getOwnPropertyDescriptor(Node.prototype, 'isConnected')
) {
  Object.defineProperty(Node.prototype, 'isConnected', {
    configurable: true,
    get(this: Node): boolean {
      return document.documentElement.contains(this);
    }
  });
}

// Typed as optional: the DOM lib says these always exist, which is what the check is for.
const idleHost: Partial<Window> | undefined =
  typeof window === 'undefined' ? undefined : window;
if (idleHost && typeof idleHost.requestIdleCallback !== 'function') {
  idleHost.requestIdleCallback = (callback, options) =>
    setTimeout(
      () => callback({ didTimeout: false, timeRemaining: () => 8 }),
      Math.min(options?.timeout ?? 50, 50)
    ) as unknown as number;
  idleHost.cancelIdleCallback = (handle) =>
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.click) {
  HTMLElement.prototype.click = function click(this: HTMLElement): void {
    this.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  };
}

// Cobalt does not activate checkboxes: neither a click event nor a label click
// flips `checked` or fires `change`. Detect that once and add the activation
// behaviour at document level, so the panel's key presses (click()) and a
// pointer click both toggle.
function checkboxNeedsActivation(): boolean {
  if (typeof document === 'undefined') return false;
  const probe = document.createElement('input');
  probe.setAttribute('type', 'checkbox');
  probe.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true })
  );
  return !probe.checked;
}

function toggleCheckbox(input: HTMLInputElement): void {
  if (input.disabled) return;
  input.checked = !input.checked;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Both native bundles load this file, and the early one runs before the page's
// document is final, so the listener is marked on the document it was added to
// (a flag on the global would survive a document swap and skip the real one).
const ACTIVATION_FLAG = '__ytxCheckboxActivation';

function documentHasActivation(): boolean {
  return (
    (document as unknown as Record<string, unknown>)[ACTIVATION_FLAG] === true
  );
}

if (
  typeof document !== 'undefined' &&
  !documentHasActivation() &&
  checkboxNeedsActivation()
) {
  (document as unknown as Record<string, unknown>)[ACTIVATION_FLAG] = true;
  // Tag checks, not instanceof: Cobalt defines no HTMLInputElement global.
  const asCheckbox = (
    el: Element | null | undefined
  ): HTMLInputElement | null => {
    if (el?.tagName !== 'INPUT') return null;
    const input = el as HTMLInputElement;
    return input.type === 'checkbox' ? input : null;
  };

  // Cobalt has no Element.closest either, so the label is found by walking up.
  const labelInput = (el: Element): HTMLInputElement | null => {
    for (let node: Node | null = el; node; node = node.parentNode) {
      if ((node as Element).tagName === 'LABEL') {
        return asCheckbox((node as Element).querySelector('input'));
      }
    }
    return null;
  };

  document.addEventListener('click', (evt) => {
    const target = evt.target as Element | null;
    if (evt.defaultPrevented || !target) return;
    const input = asCheckbox(target) ?? labelInput(target);
    if (input) toggleCheckbox(input);
  });
}

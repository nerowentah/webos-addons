// Allowlisted element construction: the only way the panel builds DOM, so
// untrusted keys never reach innerHTML, src/href or on* handlers.

// Allowlist: a fallthrough like el['innerHTML'] = ... (or src/href/on*) could
// inject markup or navigate, so unknown keys are dropped.
const ELEMENT_PROP_KEYS = new Set([
  'id',
  'type',
  'value',
  'checked',
  'disabled',
  'selected',
  'tabIndex',
  'title',
  'role',
  'name',
  'slot',
  'hidden'
]);
const UNSAFE_ATTRIBUTES = new Set([
  'srcdoc',
  'src',
  'srcset',
  'href',
  'action',
  'formaction',
  'background'
]);

type ElementEvents = {
  [K in keyof HTMLElementEventMap]?: (evt: HTMLElementEventMap[K]) => void;
};

/** What createElement accepts: the allowlisted properties, `class`/`text`/`style`/`events`, and any other string-valued attribute (e.g. `aria-label`). */
export interface ElementProps {
  class?: string;
  text?: string;
  style?: Partial<CSSStyleDeclaration>;
  events?: ElementEvents;
  id?: string;
  type?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  selected?: boolean;
  tabIndex?: number;
  title?: string;
  role?: string;
  name?: string;
  slot?: string;
  hidden?: boolean;
  [attribute: `aria-${string}` | `data-${string}`]: string | undefined;
}

export const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: (string | Node)[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);

  for (const [key, val] of Object.entries(props as Record<string, unknown>)) {
    if (key === 'style' && typeof val === 'object' && val !== null) {
      Object.assign(el.style, val);
    } else if (key === 'class') el.className = String(val);
    else if (key === 'events' && typeof val === 'object' && val !== null) {
      for (const [evt, handler] of Object.entries(val)) {
        el.addEventListener(evt, handler as EventListener);
      }
    } else if (key === 'text') el.textContent = String(val);
    else if (ELEMENT_PROP_KEYS.has(key) && val != null) {
      // Allowlisted above: only plain element properties get written.
      (el as unknown as Record<string, unknown>)[key] = val;
      // Cobalt does not reflect the `type` property to the attribute, and the panel's CSS selects on [type='checkbox'].
      if (key === 'type' && typeof val === 'string') {
        el.setAttribute('type', val);
      }
    } else if (
      typeof val === 'string' &&
      /^[a-z][a-z0-9-]*$/.test(key) &&
      !UNSAFE_ATTRIBUTES.has(key) &&
      !/^on/i.test(key)
    ) {
      el.setAttribute(key, val);
    }
  }

  for (const child of children) {
    el.appendChild(
      typeof child === 'string' ? document.createTextNode(child) : child
    );
  }
  return el;
};

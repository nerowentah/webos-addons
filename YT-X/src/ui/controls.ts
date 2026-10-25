import {
  configAddChangeListener,
  configGetDesc,
  configRead,
  configWrite,
  videoCodecModes,
  type BoolKey,
  type ConfigValues
} from '../config/config';
import { gridColumns } from '../core/layout';
import { isNativeBuild } from '../platform/is-native';
import { LIVENESS, NEXT_LOAD_NOTICE } from '../config/liveness';
import { createElement } from './dom';
import { showNotification } from './notifications';

// Re-reads every checkbox from the stored value; run when a page is shown so a
// write that bypassed a control (replayed from the other bundle, or a property
// Cobalt dropped at construction) cannot leave the box out of step.
const checkboxSyncs = new Set<() => void>();

export function syncConfigCheckboxes(): void {
  for (const sync of checkboxSyncs) sync();
}

/** Settings that do nothing on the native build: the cast wake is a web-app request. */
const NATIVE_INACTIVE: readonly string[] = ['blockWebosCast'];

const isNativeInactive = (key: BoolKey): boolean =>
  isNativeBuild() && NATIVE_INACTIVE.includes(key);

export function createConfigCheckbox(key: BoolKey): HTMLLabelElement {
  const inactive = isNativeInactive(key);
  // Cobalt has no :checked or :focus-within, so the checked and focused looks
  // are classes kept in step here (see the .ytx-checked / .ytx-focused rules).
  const syncChecked = (): void => {
    elmInput.classList.toggle('ytx-checked', elmInput.checked);
  };
  const elmInput: HTMLInputElement = createElement('input', {
    type: 'checkbox',
    checked: configRead(key),
    disabled: inactive,
    events: {
      change: () => {
        configWrite(key, elmInput.checked);
        syncChecked();
        if (LIVENESS[key] === 'next-load') showNotification(NEXT_LOAD_NOTICE);
      },
      focus: () => elmLabel.classList.add('ytx-focused'),
      blur: () => elmLabel.classList.remove('ytx-focused')
    }
  });
  const syncFromConfig = (): void => {
    elmInput.checked = configRead(key);
    syncChecked();
  };
  syncFromConfig();
  checkboxSyncs.add(syncFromConfig);

  const labelContent = createElement(
    'div',
    { class: 'label-content' },
    inactive
      ? `${configGetDesc(key)} (not used on native)`
      : configGetDesc(key),
    elmInput
  );
  const elmLabel = createElement(
    'label',
    { class: inactive ? 'ytx-inactive' : '' },
    labelContent
  );
  elmLabel.dataset['sortKey'] = configGetDesc(key);

  configAddChangeListener(key, (evt) => {
    elmInput.checked = evt.detail.newValue;
    syncChecked();
  });

  return elmLabel;
}

/** Order controls A-Z by `dataset.sortKey`; unkeyed elements group with the keyed control they follow. */
function orderByLabel(elements: readonly HTMLElement[]): HTMLElement[] {
  interface Group {
    key: string;
    last: boolean;
    els: HTMLElement[];
  }
  const groups: Group[] = [];
  for (const el of elements) {
    const key = el.dataset['sortKey'];
    const lastGroup = groups[groups.length - 1];
    if (key === undefined && lastGroup) {
      lastGroup.els.push(el);
    } else {
      groups.push({
        key: key === undefined ? '' : key.toLowerCase(),
        // Pinned to the section bottom; A-Z would bury this summary row among the checkboxes.
        last: el.classList.contains('ytx-cycle-row'),
        els: [el]
      });
    }
  }
  groups.sort((a, b) => {
    if (a.last !== b.last) return a.last ? 1 : -1;
    return a.key.localeCompare(b.key);
  });

  const ordered: HTMLElement[] = [];
  for (const group of groups) {
    for (const el of group.els) ordered.push(el);
  }
  return ordered;
}

/**
 * @param title Section heading.
 * @param elements Control rows.
 * @param grid Opt the section into the multi-column layout. The
 *   column count (2 or 3) is then derived from how many rows it holds.
 * @param note Optional muted caption rendered beside the heading, e.g.
 *   a third-party attribution. Not uppercased or bolded like the title.
 */
export function createSection(
  title: string,
  elements: readonly HTMLElement[],
  grid = false,
  note = ''
): HTMLDivElement {
  const ordered = orderByLabel(elements);
  let cls = '';
  if (grid && elements.length > 1) {
    const labelCount = ordered.filter((el) => el.tagName === 'LABEL').length;
    const cols = gridColumns(labelCount);
    cls = `ytx-grid ytx-grid-${cols}`;
  }
  const legend = createElement('div', { text: title, class: 'section-title' });
  if (note) {
    legend.appendChild(
      createElement('span', { text: note, class: 'section-title-note' })
    );
  }
  return createElement(
    'div',
    { class: 'ytx-settings-section' + (cls ? ` ${cls}` : '') },
    legend,
    ...ordered
  );
}

function createGenericControlRow(
  labelText: string,
  displayValueGetter: () => string,
  onLeft: () => void,
  onRight: () => void,
  onClick: () => void
): { container: HTMLDivElement; updateDisplay: () => void } {
  const valueText = createElement('span', { class: 'current-value' });
  const updateDisplay = () => {
    valueText.textContent = displayValueGetter();
  };

  const container = createElement(
    'div',
    {
      class: 'ytx-cycle-row',
      tabIndex: 0,
      events: {
        click: () => onClick()
      }
    },
    createElement('span', {
      text: labelText,
      class: 'ytx-cycle-label'
    }),
    createElement(
      'div',
      { class: 'ytx-cycle-value' },
      createElement('span', {
        text: '<',
        class: 'arrow-btn arrow-prev',
        events: {
          click: (e) => {
            e.stopPropagation();
            onLeft();
          }
        }
      }),
      valueText,
      createElement('span', {
        text: '>',
        class: 'arrow-btn',
        events: {
          click: (e) => {
            e.stopPropagation();
            onRight();
          }
        }
      })
    )
  );

  container.dataset['sortKey'] = labelText;

  return { container, updateDisplay };
}

/** Config options that hold one of a fixed set of modes. */
type CycleKey = 'panelCareMode' | 'forceVideoCodec';

function createCycleControl<K extends CycleKey>(
  configKey: K,
  labelText: string,
  displayMap: Record<ConfigValues[K], string>
): HTMLDivElement {
  const modesArray = Object.keys(displayMap) as ConfigValues[K][];
  const displayValueGetter = (): string =>
    displayMap[configRead(configKey)] || configRead(configKey);
  const cycle = (dir: 'next' | 'prev') => {
    let idx = modesArray.indexOf(configRead(configKey));
    if (idx === -1) idx = 0;
    idx =
      dir === 'next'
        ? (idx + 1) % modesArray.length
        : (idx - 1 + modesArray.length) % modesArray.length;
    const mode = modesArray[idx];
    if (mode !== undefined) configWrite(configKey, mode);
    updateDisplay();
  };

  const { container, updateDisplay } = createGenericControlRow(
    labelText,
    displayValueGetter,
    () => cycle('prev'),
    () => cycle('next'),
    () => cycle('next')
  );

  configAddChangeListener(configKey, updateDisplay);
  updateDisplay();
  return container;
}

/** A cycle control that lines up with the checkbox rows around it (both start their label at the row's left edge, so no placeholder is needed). */
export function createAlignedCycleControl<K extends CycleKey>(
  configKey: K,
  displayMap: Record<ConfigValues[K], string>
): HTMLDivElement {
  return createCycleControl(configKey, configGetDesc(configKey), displayMap);
}

export const createVideoCodecControl = () =>
  createAlignedCycleControl('forceVideoCodec', videoCodecModes);

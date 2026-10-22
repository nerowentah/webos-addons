import {
  configAddChangeListener,
  configGetDesc,
  configRead,
  configWrite,
  panelCareModes,
  type PanelCareMode,
  videoCodecModes,
  type BoolKey,
  type ConfigValues
} from '../config/config';
import './ui.css';
import './theme.css';
import {
  addTVSpecsChangeListener,
  refreshUIScale,
  resolvePanelCareMode
} from '../platform/tv-specs';
import {
  showNotification as notificationsShowNotification,
  setNotificationPanelCare
} from './notifications';
import { REMOTE_KEYS, isSyntheticKey } from '../core/utils';
import { gridColumns } from '../core/layout';
import { PANEL } from '../config/ui-text';

export const showNotification = notificationsShowNotification;

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
interface ElementProps {
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

const createElement = <K extends keyof HTMLElementTagNameMap>(
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

function createConfigCheckbox(key: BoolKey): HTMLLabelElement {
  const elmInput: HTMLInputElement = createElement('input', {
    type: 'checkbox',
    checked: configRead(key),
    events: { change: () => configWrite(key, elmInput.checked) }
  });

  const labelContent = createElement(
    'div',
    { class: 'label-content' },
    configGetDesc(key),
    elmInput
  );
  const elmLabel = createElement('label', {}, labelContent);
  elmLabel.dataset['sortKey'] = configGetDesc(key);

  configAddChangeListener(key, (evt) => {
    elmInput.checked = evt.detail.newValue;
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
function createSection(
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
        class: 'arrow-btn',
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
function createAlignedCycleControl<K extends CycleKey>(
  configKey: K,
  displayMap: Record<ConfigValues[K], string>
): HTMLDivElement {
  return createCycleControl(configKey, configGetDesc(configKey), displayMap);
}

const createVideoCodecControl = () =>
  createAlignedCycleControl('forceVideoCodec', videoCodecModes);

/** The options panel element plus the hooks the module drives it through. */
interface OptionsPanel extends HTMLDivElement {
  activePage: number;
  ensurePage(index: number): void;
  buildDeferredPages(): void;
  recalcDensity(): void;
}

let optionsPanel: OptionsPanel | null = null;
let optionsPanelVisible = false;
let panelInitBlock = false;
let lastSafeFocus: HTMLElement | null = null;

// Wired by sponsorblock.ts via setSponsorBlockPanelSync; no-op until then.
// The registered fn receives the panel-open state; the popup is suppressed
// while the panel is open.
let syncSponsorBlockPanel: (open: boolean) => void = () => {};
export function setSponsorBlockPanelSync(fn: (open: boolean) => void): void {
  syncSponsorBlockPanel = fn;
}

const SPONSOR_CATEGORIES = [
  'enableSponsorBlockSponsor',
  'enableSponsorBlockIntro',
  'enableSponsorBlockOutro',
  'enableSponsorBlockInteraction',
  'enableSponsorBlockSelfPromo',
  'enableSponsorBlockMusicOfftopic',
  'enableSponsorBlockPreview',
  'enableSponsorBlockFiller',
  'enableSponsorBlockHook',
  'enableSponsorBlockHighlight'
] as const satisfies readonly BoolKey[];

function createOptionsPanel(): OptionsPanel {
  const elmContainer: OptionsPanel = Object.assign(
    createElement('div', {
      class: 'ytx-ui-container',
      style: { display: 'none' },
      tabIndex: 0,
      events: {
        keydown: (e) => {
          if (
            e.key === 'Escape' ||
            e.key === 'Back' ||
            e.keyCode === REMOTE_KEYS.BACK.keyCode ||
            e.code === 'Backspace'
          ) {
            e.preventDefault();
            e.stopImmediatePropagation();
            showOptionsPanel(false);
          }
        }
      }
    }),
    {
      activePage: 0,
      // Replaced below, once the page machinery they close over exists.
      ensurePage: (_index: number): void => {},
      buildDeferredPages: (): void => {},
      recalcDensity: (): void => {}
    }
  );

  let activePage = 0;
  // Page elements by tab index: Main, UI, System, Privacy, Adblock.
  const pages: (HTMLElement | undefined)[] = [];

  const tabMenu = createElement('div', {
    class: 'ytx-tab-menu',
    events: {
      mouseleave: () => {
        const activeTabBtn = tabBtns[activePage];
        if (
          activeTabBtn &&
          document.activeElement &&
          document.activeElement.classList.contains('ytx-tab-btn')
        ) {
          activeTabBtn.focus();
        }
      }
    }
  });
  const tabs = PANEL.tabs;
  const tabBtns = tabs.map((name, index) =>
    createElement('button', {
      class: index === 0 ? 'ytx-tab-btn active' : 'ytx-tab-btn',
      text: name,
      tabIndex: 0,
      events: {
        click: () => setActivePage(index),
        mouseenter: (e) => {
          if (e.target instanceof HTMLElement) e.target.focus();
        }
      }
    })
  );
  tabBtns.forEach((btn) => {
    tabMenu.appendChild(btn);
  });

  const focusSelectors = [
    'input',
    '.ytx-cycle-row, input',
    '.ytx-cycle-row, input',
    'input',
    '.ytx-cycle-row, input'
  ];

  const setActivePage = (pageIndex: number) => {
    if (pageIndex === activePage) return;
    ensurePage(pageIndex);

    const previous = pages[activePage];
    if (previous) previous.style.display = 'none';
    tabBtns[activePage]?.classList.remove('active');

    activePage = elmContainer.activePage = pageIndex;
    const page = pages[activePage];
    if (page) page.style.display = 'block';
    tabBtns[activePage]?.classList.add('active');

    const activeEl = document.activeElement;
    const isTabFocused = activeEl && activeEl.classList.contains('ytx-tab-btn');

    if (!isTabFocused) {
      const focusTarget = page?.querySelector<HTMLElement>(
        focusSelectors[activePage] ?? 'input'
      );
      if (focusTarget) focusTarget.focus();
    }

    recalcDensity();
  };

  const elmHeading = createElement(
    'h1',
    {},
    createElement('span', { text: PANEL.heading })
  );
  elmContainer.appendChild(elmHeading);

  const elmClose = createElement('button', {
    class: 'ytx-close-btn',
    text: PANEL.closeGlyph,
    tabIndex: 0,
    'aria-label': PANEL.closeLabel,
    events: {
      click: () => showOptionsPanel(false)
    }
  });
  elmContainer.appendChild(elmClose);
  elmContainer.appendChild(tabMenu);

  const pageMain = createElement('div', {
    class: 'ytx-settings-page',
    id: 'ytx-page-main'
  });
  pages[0] = pageMain;

  pageMain.appendChild(
    createSection(
      PANEL.sections.videoPlayer,
      [
        createConfigCheckbox('forceHighResVideo'),
        createConfigCheckbox('showQualityOnStart'),
        createConfigCheckbox('showTimeRemaining'),
        createConfigCheckbox('loadRowsAhead'),
        createVideoCodecControl(),
        createConfigCheckbox('keepPlaying')
      ],
      true
    )
  );
  elmContainer.appendChild(pageMain);

  // Remaining pages build off the critical path, one per animation frame; setActivePage() forces a synchronous build if reached first.
  const pageBuilders: ((() => void) | null)[] = [
    null,
    function buildUITweaksPage() {
      const pageUITweaks = createElement('div', {
        class: 'ytx-settings-page',
        id: 'ytx-page-ui-tweaks',
        style: { display: 'none' }
      });
      pages[1] = pageUITweaks;

      pageUITweaks.appendChild(
        createSection(
          PANEL.sections.playerUiTweaks,
          [
            createConfigCheckbox('fixMultilineTitles'),
            createConfigCheckbox('pointerSettingsButton'),
            createConfigCheckbox('keyboardSearch'),
            createConfigCheckbox('disableAnimations'),
            createConfigCheckbox('autoAccountSelect'),
            createConfigCheckbox('disableAutoCaptions'),
            createConfigCheckbox('hideLogo'),
            createConfigCheckbox('removeShorts'),
            createConfigCheckbox('removeMembersOnly'),
            createConfigCheckbox('removeLiveVideos'),
            createConfigCheckbox('removeUpcomingVideos'),
            createConfigCheckbox('removeTopLiveGames'),
            createConfigCheckbox('removeMostRelevant'),
            createConfigCheckbox('removeEndscreen')
          ],
          true
        )
      );

      elmContainer.appendChild(pageUITweaks);
    },
    function buildSystemPage() {
      const pageSystem = createElement('div', {
        class: 'ytx-settings-page',
        id: 'ytx-page-system',
        style: { display: 'none' }
      });
      pages[2] = pageSystem;

      pageSystem.appendChild(
        createSection(PANEL.sections.system, [
          createConfigCheckbox('blockWebosCast'),
          createAlignedCycleControl('panelCareMode', panelCareModes)
        ])
      );

      elmContainer.appendChild(pageSystem);
    },
    function buildPrivacyPage() {
      const pagePrivacy = createElement('div', {
        class: 'ytx-settings-page',
        id: 'ytx-page-privacy',
        style: { display: 'none' }
      });
      pages[3] = pagePrivacy;

      pagePrivacy.appendChild(
        createSection(PANEL.sections.privacy, [
          createConfigCheckbox('keepPlaybackTracking'),
          createConfigCheckbox('enableTrackingBlock')
        ])
      );

      elmContainer.appendChild(pagePrivacy);
    },
    function buildSponsorPage() {
      const pageSponsor = createElement('div', {
        class: 'ytx-settings-page',
        id: 'ytx-page-sponsor',
        style: { display: 'none' }
      });
      pages[4] = pageSponsor;

      pageSponsor.appendChild(
        createSection(PANEL.sections.adBlocking, [
          createConfigCheckbox('enableAdBlock'),
          createConfigCheckbox('enableSponsorBlock')
        ])
      );

      pageSponsor.appendChild(
        createSection(
          PANEL.sections.sponsorBlock,
          [
            ...SPONSOR_CATEGORIES.map((k) => createConfigCheckbox(k)),
            createConfigCheckbox('enableMutedSegments'),
            createConfigCheckbox('sbPeriodicRefresh'),
            createConfigCheckbox('skipSegmentsOnce')
          ],
          true,
          PANEL.attribution
        )
      );
      elmContainer.appendChild(pageSponsor);
    }
  ];

  const ensurePage = (index: number) => {
    const build = pageBuilders[index];
    if (!build) return;
    pageBuilders[index] = null;
    build();
    if (index === activePage) recalcDensity();
  };
  elmContainer.ensurePage = ensurePage;

  elmContainer.buildDeferredPages = () => {
    let index = 1;
    const step = () => {
      while (index < pageBuilders.length && !pageBuilders[index]) index++;
      if (index >= pageBuilders.length) return;
      ensurePage(index++);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // Row count varies with the config surface, so density is trimmed only when the visible page actually overflows.
  const recalcDensity = () => {
    if (elmContainer.style.display === 'none') return;
    const page = pages[activePage];
    if (!page || page.style.display === 'none') return;
    elmContainer.classList.toggle(
      'ytx-panel-compact',
      page.scrollHeight > page.clientHeight + 1
    );
    // Overflowing grids step down 3 -> 2 -> 1 columns; each scrollWidth read forces layout, so the previous class is measured before the next.
    elmContainer.classList.remove('ytx-grid-col-2', 'ytx-grid-stack');
    if (page.scrollWidth > page.clientWidth + 1) {
      elmContainer.classList.add('ytx-grid-col-2');
      if (page.scrollWidth > page.clientWidth + 1) {
        elmContainer.classList.add('ytx-grid-stack');
      }
    }
  };
  elmContainer.recalcDensity = recalcDensity;

  const version = createElement('div');
  version.className = 'ytx-ui-version';
  version.textContent = [`v${__YTX_VERSION__}`, __YTX_OWNER__, __YTX_GITSHA__]
    .filter(Boolean)
    .join(' · ');
  elmContainer.appendChild(version);

  return elmContainer;
}

function applyUIFixes(): void {
  try {
    const bodyClasses = document.body.classList;

    // Strip eagerly: the observer below only reacts to later changes.
    bodyClasses.remove('app-quality-root');

    const observer = new MutationObserver(function bodyClassCallback() {
      try {
        if (bodyClasses.contains('app-quality-root')) {
          bodyClasses.remove('app-quality-root');
        }
      } catch {
        // A throwing observer callback must not break the mutation loop.
      }
    });

    observer.observe(document.body, {
      subtree: false,
      childList: false,
      attributes: true,
      attributeFilter: ['class'],
      characterData: false
    });
  } catch {
    // Observer setup is best-effort.
  }
}

let panelExitTimer: ReturnType<typeof setTimeout> | null = null;
let panelEntranceRaf: number | null = null;

function cancelPanelAnimation(): void {
  if (panelExitTimer) {
    clearTimeout(panelExitTimer);
    panelExitTimer = null;
  }
  if (panelEntranceRaf) {
    cancelAnimationFrame(panelEntranceRaf);
    panelEntranceRaf = null;
  }
}

// Pose hidden, force a reflow, then flip on the next frame; without the
// intermediate commit the transition has no "from" value and pops in.
function animatePanelIn(panel: HTMLElement): void {
  cancelPanelAnimation();
  panel.classList.remove('collapse-start', 'collapse-end');
  panel.classList.add('collapse-start');
  // Forced reflow; `void` marks the read as intentional.
  // eslint-disable-next-line @typescript-eslint/no-meaningless-void-operator
  void panel.offsetWidth;
  panelEntranceRaf = requestAnimationFrame(() => {
    panelEntranceRaf = null;
    panel.classList.remove('collapse-start');
    panel.classList.add('collapse-end');
  });
}

// Fixed timer, not transitionend (unreliable when backgrounded); the
// display:none that follows stops the hidden panel trapping focus/clicks.
function animatePanelOut(panel: HTMLElement): void {
  if (panelEntranceRaf) {
    cancelAnimationFrame(panelEntranceRaf);
    panelEntranceRaf = null;
  }
  panel.classList.remove('collapse-end');
  panel.classList.add('collapse-start');
  panelExitTimer = setTimeout(() => {
    panelExitTimer = null;
    panel.style.display = 'none';
    panel.classList.remove('collapse-start');
  }, 300);
}

function showOptionsPanel(visible = true): void {
  if (panelInitBlock) {
    return;
  }

  if (visible && !optionsPanelVisible) {
    let panel = optionsPanel;
    if (!panel) {
      panelInitBlock = true;
      setTimeout(() => {
        panelInitBlock = false;
      }, 500);
      panel = optionsPanel = createOptionsPanel();
      document.body.appendChild(panel);

      applyPanelCareMode(configRead('panelCareMode'));
    }

    panel.style.display = 'block';
    animatePanelIn(panel);
    panel.buildDeferredPages();
    panel.recalcDensity();
    syncSponsorBlockPanel(true);

    const activeTabBtn = panel.querySelector<HTMLElement>(
      '.ytx-tab-btn.active'
    );
    if (activeTabBtn) {
      activeTabBtn.focus();
      lastSafeFocus = activeTabBtn;
    } else {
      panel.focus();
      lastSafeFocus = panel;
    }
    optionsPanelVisible = true;
  } else if (!visible && optionsPanelVisible && optionsPanel) {
    animatePanelOut(optionsPanel);
    syncSponsorBlockPanel(false);
    optionsPanel.blur();
    optionsPanelVisible = false;
    lastSafeFocus = null;
  }

  configBadge.classList.toggle('ytx-ui-badge-hidden', optionsPanelVisible);
}

// Trap focus inside options panel when visible
document.addEventListener(
  'focus',
  (e) => {
    const panel = optionsPanel;
    if (!optionsPanelVisible || !panel) return;
    const target = e.target;
    const isSafeFocus = target instanceof Node && panel.contains(target);
    if (isSafeFocus) {
      if (target instanceof HTMLElement) lastSafeFocus = target;
    } else {
      e.stopPropagation();
      e.preventDefault();
      if (lastSafeFocus && lastSafeFocus.isConnected) lastSafeFocus.focus();
      else {
        const firstVisibleInput = panel.querySelector<HTMLElement>(
          '.ytx-tab-btn.active, .ytx-settings-page[style*="block"] input:not([disabled])'
        );
        if (firstVisibleInput) firstVisibleInput.focus();
        else panel.focus();
      }
    }
  },
  true
);

// Magic Remote navigation: the panel overlay is invisible to the host's spatial
// focus engine, so this capture-phase handler (registered before YouTube's) drives D-pad focus itself; inert when the panel is closed.

const PANEL_FOCUSABLE_SELECTOR =
  '.ytx-tab-btn, .ytx-close-btn, .ytx-cycle-row, ' +
  'input[type="checkbox"]:not([disabled])';

// Visible focusable controls in DOM order; the two guards drop hidden pages and negative tabindex, so no page-aware query is needed.
function panelFocusables(): HTMLElement[] {
  if (!optionsPanel) return [];
  return Array.from(
    optionsPanel.querySelectorAll<HTMLElement>(PANEL_FOCUSABLE_SELECTOR)
  ).filter((el) => el.tabIndex >= 0 && el.offsetParent !== null);
}

type Direction = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/** Nearest focusable from `list` in `direction`, measured by geometry; the score is the travel distance plus 2x the perpendicular offset, so moves stay in their column. */
function findSpatialNeighbor(
  current: Element,
  list: readonly HTMLElement[],
  direction: Direction
): HTMLElement | null {
  const cur = current.getBoundingClientRect();
  const curX = cur.left + cur.width / 2;
  const curY = cur.top + cur.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of list) {
    if (el === current) continue;

    const rect = el.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - curX;
    const dy = rect.top + rect.height / 2 - curY;

    let primary: number;
    let perpendicular: number;
    if (direction === 'ArrowUp') {
      primary = -dy;
      perpendicular = Math.abs(dx);
    } else if (direction === 'ArrowDown') {
      primary = dy;
      perpendicular = Math.abs(dx);
    } else if (direction === 'ArrowLeft') {
      primary = -dx;
      perpendicular = Math.abs(dy);
    } else {
      primary = dx;
      perpendicular = Math.abs(dy);
    }

    // Must be at least a pixel further along the travel axis.
    if (primary < 1) continue;

    const score = primary + perpendicular * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

const NAV_DIRECTIONS = new Map<number, Direction>([
  [REMOTE_KEYS.UP.keyCode, 'ArrowUp'],
  [REMOTE_KEYS.DOWN.keyCode, 'ArrowDown'],
  [REMOTE_KEYS.LEFT.keyCode, 'ArrowLeft'],
  [REMOTE_KEYS.RIGHT.keyCode, 'ArrowRight']
]);

const isHorizontal = (direction: Direction): boolean =>
  direction === 'ArrowLeft' || direction === 'ArrowRight';

const consume = (evt: Event): void => {
  evt.preventDefault();
  evt.stopImmediatePropagation();
};

function handlePanelNavKey(evt: KeyboardEvent): void {
  const panel = optionsPanel;
  if (!optionsPanelVisible || !panel) return;
  // Synthetic events (sendKey) are not remote presses; real input only, same contract as keyboard-search.ts.
  if (isSyntheticKey(evt)) return;

  // Remote Back closes the panel from the capture phase, so it works even when
  // focus has escaped the panel, and it is consumed so YouTube's own back
  // handling cannot navigate the page out from under an open panel. webOS
  // reports the key as keyCode 461; `key` is not stable across engines.
  if (evt.keyCode === REMOTE_KEYS.BACK.keyCode) {
    consume(evt);
    showOptionsPanel(false);
    return;
  }

  const focused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const inPanel = focused !== null && panel.contains(focused);

  const direction = NAV_DIRECTIONS.get(evt.keyCode);
  if (direction) {
    // On a value row, Left/Right step the value itself and never move focus.
    if (
      focused &&
      inPanel &&
      isHorizontal(direction) &&
      focused.classList.contains('ytx-cycle-row')
    ) {
      const arrows = focused.querySelectorAll<HTMLElement>('.arrow-btn');
      const target =
        direction === 'ArrowLeft' ? arrows[0] : arrows[arrows.length - 1];
      if (target) {
        consume(evt);
        target.click();
      }
      return;
    }

    const list = panelFocusables();
    const first = list[0];
    if (!first) return;

    if (!focused || !inPanel || focused === panel) {
      consume(evt);
      first.focus();
      return;
    }

    const next = findSpatialNeighbor(focused, list, direction);
    consume(evt);
    if (next) next.focus();
    return;
  }

  // Checkboxes do not toggle on Enter natively, so the click is issued here and the default suppressed to avoid a second activation.
  if (evt.keyCode === REMOTE_KEYS.ENTER.keyCode && focused && inPanel) {
    if (focused.matches(PANEL_FOCUSABLE_SELECTOR)) {
      consume(evt);
      focused.click();
    }
  }
}

window.addEventListener('keydown', handlePanelNavKey, true);

/** On-screen entry point for the options panel; tabindex = -1 keeps it out of the focus order so it can never steal a tile's hover focus. */
const configBadge = document.createElement('button');
configBadge.type = 'button';
configBadge.className = 'ytx-ui-badge';
configBadge.textContent = PANEL.badge;
configBadge.setAttribute('tabindex', '-1');
configBadge.addEventListener(
  'click',
  (evt) => {
    evt.stopPropagation();
    showOptionsPanel(!optionsPanelVisible);
  },
  true
);
document.body.appendChild(configBadge);

// With the Fixed Settings Panel Button off, the badge tracks pointer activity:
// shown on a real move, fading seconds later, dismissed by
// D-pad/pointer-hide/navigation. On, it stays put as a fixed entry point.
const POINTER_BADGE_HIDE_MS = 4000;
let pointerBadgeTimer: ReturnType<typeof setTimeout> | null = null;
let lastPointerX = -1;
let lastPointerY = -1;

const hidePointerBadge = (): void => {
  if (pointerBadgeTimer) {
    clearTimeout(pointerBadgeTimer);
    pointerBadgeTimer = null;
  }
  configBadge.classList.remove('ytx-badge-visible');
};

const showPointerBadge = (): void => {
  if (configRead('pointerSettingsButton')) {
    return;
  }
  configBadge.classList.add('ytx-badge-visible');
  if (pointerBadgeTimer) clearTimeout(pointerBadgeTimer);
  pointerBadgeTimer = setTimeout(hidePointerBadge, POINTER_BADGE_HIDE_MS);
};

const syncBadgeVisibility = (): void => {
  const fixed = configRead('pointerSettingsButton');
  configBadge.classList.toggle('ytx-badge-pointer-mode', !fixed);
  // Any pointer-mode "visible" state (and its fade timer) is stale across a mode switch; drop it so the badge settles into the new resting visibility.
  hidePointerBadge();
};
syncBadgeVisibility();
configAddChangeListener('pointerSettingsButton', syncBadgeVisibility);

// A resting pointer emits synthetic mousemoves with unchanged coordinates as the page scrolls; only a real move counts.
document.addEventListener(
  'mousemove',
  (evt) => {
    if (evt.clientX === lastPointerX && evt.clientY === lastPointerY) return;
    lastPointerX = evt.clientX;
    lastPointerY = evt.clientY;
    showPointerBadge();
  },
  true
);
// webOS reports the pointer appearing/disappearing (it hides on D-pad presses).
document.addEventListener('cursorStateChange', (evt) => {
  if (evt.detail && evt.detail.visibility === false) hidePointerBadge();
});
const ARROW_KEY_CODE = new Set([
  REMOTE_KEYS.LEFT.keyCode,
  REMOTE_KEYS.UP.keyCode,
  REMOTE_KEYS.RIGHT.keyCode,
  REMOTE_KEYS.DOWN.keyCode
]);
window.addEventListener(
  'keydown',
  (evt) => {
    if (ARROW_KEY_CODE.has(evt.keyCode)) hidePointerBadge();
  },
  true
);
// Picking a video with the pointer must not leave the button over it.
window.addEventListener('ytx-page-update', (evt) => {
  if (evt.detail.isWatch || evt.detail.isShorts) hidePointerBadge();
});

function initGlobalToggles(): void {
  // Toggles live on <html> because YouTube rewrites body.className on tab
  // navigation; not gated on .app-quality-root, which applyUIFixes() strips.
  // The rules they switch are in theme.css.
  const syncClass = (cls: string, key: BoolKey) =>
    document.documentElement.classList.toggle(cls, configRead(key));
  const CLASS_KEYS: Readonly<Record<string, BoolKey>> = {
    'ytx-hide-logo': 'hideLogo',
    'ytx-fix-titles': 'fixMultilineTitles',
    'ytx-no-animations': 'disableAnimations'
  };
  for (const [cls, key] of Object.entries(CLASS_KEYS)) {
    syncClass(cls, key);
    configAddChangeListener(key, () => syncClass(cls, key));
  }
}

/**
 * The care mode to apply, with 'auto' already resolved; everything downstream
 * reads this rather than configRead('panelCareMode'), so the surfaces cannot disagree.
 */
let resolvedPanelCareMode = resolvePanelCareMode(configRead('panelCareMode'));

function applyPanelCareMode(mode: PanelCareMode): void {
  resolvedPanelCareMode = resolvePanelCareMode(mode);
  const isOled = resolvedPanelCareMode === 'oled';
  const isQned = resolvedPanelCareMode === 'qned';

  if (optionsPanel) {
    optionsPanel.classList.toggle('oled-care', isOled);
    optionsPanel.classList.toggle('qned-care', isQned);
  }
  setNotificationPanelCare(resolvedPanelCareMode);

  document.documentElement.classList.toggle('oled-theme-active', isOled);
  document.documentElement.classList.toggle('qned-theme-active', isQned);
}

initGlobalToggles();

applyPanelCareMode(configRead('panelCareMode'));
configAddChangeListener('panelCareMode', (evt) =>
  applyPanelCareMode(evt.detail.newValue)
);

// 'auto' resolves against the UA model that tv-specs computes at startup, so
// re-resolve whenever tv-specs updates.
addTVSpecsChangeListener(() => applyPanelCareMode(configRead('panelCareMode')));

applyUIFixes();

// --ytx-ui-scale is owned by tv-specs but measured here (the site's stylesheets
// are only present in-page), so it re-runs on every specs change and the panel's density relayout rides along.
addTVSpecsChangeListener(() => {
  refreshUIScale();
  optionsPanel?.recalcDensity();
});
refreshUIScale();

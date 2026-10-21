/*global __YTX_VERSION__, __YTX_GITSHA__, __YTX_OWNER__*/
import {
  configAddChangeListener,
  configGetDesc,
  configRead,
  configWrite,
  panelCareModes,
  videoCodecModes
} from '../config/config.js';
import './ui.css';
import {
  addTVSpecsChangeListener,
  refreshUIScale,
  resolvePanelCareMode
} from '../platform/tv-specs';
import {
  showNotification as notificationsShowNotification,
  setNotificationPanelCare
} from './notifications.js';
import { isWatchPage, REMOTE_KEYS, SYNTHETIC_KEY_FLAG } from '../core/utils.js';
import { gridColumns } from '../core/layout.js';
import { PANEL } from '../config/ui-text.js';

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

const createElement = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);

  for (const [key, val] of Object.entries(props)) {
    if (key === 'style' && typeof val === 'object') {
      for (const [styleKey, styleVal] of Object.entries(val)) {
        el.style[styleKey] = styleVal;
      }
    } else if (key === 'class') el.className = val;
    else if (key === 'events' && typeof val === 'object') {
      for (const [evt, handler] of Object.entries(val)) {
        el.addEventListener(evt, handler);
      }
    } else if (key === 'text') el.textContent = val;
    else if (ELEMENT_PROP_KEYS.has(key) && val != null) el[key] = val;
    else if (
      typeof val === 'string' &&
      /^[a-z][a-z0-9-]*$/.test(key) &&
      !UNSAFE_ATTRIBUTES.has(key) &&
      !/^on/i.test(key)
    ) {
      el.setAttribute(key, val);
    }
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    el.appendChild(
      typeof child === 'string' ? document.createTextNode(child) : child
    );
  }
  return el;
};

function createConfigCheckbox(key) {
  const elmInput = createElement('input', {
    type: 'checkbox',
    checked: configRead(key),
    events: { change: (evt) => configWrite(key, evt.target.checked) }
  });

  const labelContent = createElement(
    'div',
    { class: 'label-content' },
    configGetDesc(key),
    elmInput
  );
  const elmLabel = createElement('label', {}, labelContent);
  elmLabel.dataset.sortKey = configGetDesc(key);

  configAddChangeListener(key, (evt) => {
    elmInput.checked = evt.detail.newValue;
  });

  return elmLabel;
}

/** Order controls A-Z by `dataset.sortKey`; unkeyed elements group with the keyed control they follow. */
function orderByLabel(elements) {
  const groups = [];
  for (const el of elements) {
    const key = el && el.dataset ? el.dataset.sortKey : undefined;
    if (key === undefined && groups.length) {
      groups[groups.length - 1].els.push(el);
    } else {
      groups.push({
        key: key === undefined ? '' : key.toLowerCase(),
        // Pinned to the section bottom; A-Z would bury this summary row among the checkboxes.
        last: !!(el.classList && el.classList.contains('ytx-cycle-row')),
        els: [el]
      });
    }
  }
  groups.sort((a, b) => {
    if (a.last !== b.last) return a.last ? 1 : -1;
    return a.key.localeCompare(b.key);
  });

  const ordered = [];
  for (const group of groups) {
    for (const el of group.els) ordered.push(el);
  }
  return ordered;
}

/**
 * @param {string} title Section heading.
 * @param {Element[]} elements Control rows.
 * @param {boolean} grid Opt the section into the multi-column layout. The
 *   column count (2 or 3) is then derived from how many rows it holds.
 * @param {string} note Optional muted caption rendered beside the heading, e.g.
 *   a third-party attribution. Not uppercased or bolded like the title.
 */
function createSection(title, elements, grid = false, note = '') {
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
  labelText,
  displayValueGetter,
  onLeft,
  onRight,
  onClick
) {
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

  container.dataset.sortKey = labelText;

  return { container, updateDisplay };
}

function createCycleControl(
  configKey,
  labelText,
  modesArray,
  displayMap = null
) {
  const displayValueGetter = () =>
    displayMap
      ? displayMap[configRead(configKey)] || configRead(configKey)
      : configRead(configKey);
  const cycle = (dir) => {
    let idx = modesArray.indexOf(configRead(configKey));
    if (idx === -1) idx = 0;
    idx =
      dir === 'next'
        ? (idx + 1) % modesArray.length
        : (idx - 1 + modesArray.length) % modesArray.length;
    configWrite(configKey, modesArray[idx]);
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
function createAlignedCycleControl(configKey, displayMap) {
  return createCycleControl(
    configKey,
    configGetDesc(configKey),
    Object.keys(displayMap),
    displayMap
  );
}

const createVideoCodecControl = () =>
  createAlignedCycleControl('forceVideoCodec', videoCodecModes);

let optionsPanel = null;
let optionsPanelVisible = false;
let panelInitBlock = false;
let lastSafeFocus = null;

// Wired by sponsorblock.js via setSponsorBlockPanelSync; no-op until then.
// The registered fn receives the panel-open state; the popup is suppressed
// while the panel is open.
let syncSponsorBlockPanel = () => {};
export function setSponsorBlockPanelSync(fn) {
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
];

function createOptionsPanel() {
  const elmContainer = createElement('div', {
    class: 'ytx-ui-container',
    style: { display: 'none' },
    tabIndex: 0,
    events: {
      keydown: (e) => {
        if (
          e.key === 'Escape' ||
          e.key === 'Back' ||
          e.keyCode === REMOTE_KEYS.BACK.code ||
          e.code === 'Backspace'
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          showOptionsPanel(false);
        }
      }
    }
  });

  let activePage = 0;
  elmContainer.activePage = 0;
  let pageMain, pageSponsor, pageUITweaks, pagePrivacy, pageSystem;

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
        mouseenter: (e) => e.target.focus()
      }
    })
  );
  tabBtns.forEach((btn) => {
    tabMenu.appendChild(btn);
  });

  const setActivePage = (pageIndex) => {
    if (pageIndex === activePage) return;
    ensurePage(pageIndex);
    const pagesArray = [
      pageMain,
      pageUITweaks,
      pageSystem,
      pagePrivacy,
      pageSponsor
    ];
    const focusSelectors = [
      'input',
      '.ytx-cycle-row, input',
      '.ytx-cycle-row, input',
      'input',
      '.ytx-cycle-row, input'
    ];

    pagesArray[activePage].style.display = 'none';
    tabBtns[activePage].classList.remove('active');

    activePage = elmContainer.activePage = pageIndex;
    pagesArray[activePage].style.display = 'block';
    tabBtns[activePage].classList.add('active');

    const activeEl = document.activeElement;
    const isTabFocused = activeEl && activeEl.classList.contains('ytx-tab-btn');

    if (!isTabFocused) {
      const focusTarget = pagesArray[activePage].querySelector(
        focusSelectors[activePage]
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

  pageMain = createElement('div', {
    class: 'ytx-settings-page',
    id: 'ytx-page-main'
  });

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
  const pageBuilders = [
    null,
    function buildUITweaksPage() {
      pageUITweaks = createElement('div', {
        class: 'ytx-settings-page',
        id: 'ytx-page-ui-tweaks',
        style: { display: 'none' }
      });

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
      pageSystem = createElement('div', {
        class: 'ytx-settings-page',
        id: 'ytx-page-system',
        style: { display: 'none' }
      });

      pageSystem.appendChild(
        createSection(PANEL.sections.system, [
          createConfigCheckbox('blockWebosCast'),
          createAlignedCycleControl('panelCareMode', panelCareModes)
        ])
      );

      elmContainer.appendChild(pageSystem);
    },
    function buildPrivacyPage() {
      pagePrivacy = createElement('div', {
        class: 'ytx-settings-page',
        id: 'ytx-page-privacy',
        style: { display: 'none' }
      });

      pagePrivacy.appendChild(
        createSection(PANEL.sections.privacy, [
          createConfigCheckbox('keepPlaybackTracking'),
          createConfigCheckbox('enableTrackingBlock')
        ])
      );

      elmContainer.appendChild(pagePrivacy);
    },
    function buildSponsorPage() {
      pageSponsor = createElement('div', {
        class: 'ytx-settings-page',
        id: 'ytx-page-sponsor',
        style: { display: 'none' }
      });

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

  const ensurePage = (index) => {
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
    const pages = [
      pageMain,
      pageUITweaks,
      pageSystem,
      pagePrivacy,
      pageSponsor
    ];
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

function applyUIFixes() {
  try {
    const bodyClasses = document.body.classList;

    // Strip eagerly: the observer below only reacts to later changes.
    bodyClasses.remove('app-quality-root');

    const observer = new MutationObserver(function bodyClassCallback(
      _records,
      _observer
    ) {
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

let panelExitTimer = null;
let panelEntranceRaf = null;

function cancelPanelAnimation() {
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
function animatePanelIn() {
  cancelPanelAnimation();
  optionsPanel.classList.remove('collapse-start', 'collapse-end');
  optionsPanel.classList.add('collapse-start');
  void optionsPanel.offsetWidth;
  panelEntranceRaf = requestAnimationFrame(() => {
    panelEntranceRaf = null;
    optionsPanel.classList.remove('collapse-start');
    optionsPanel.classList.add('collapse-end');
  });
}

// Fixed timer, not transitionend (unreliable when backgrounded); the
// display:none that follows stops the hidden panel trapping focus/clicks.
function animatePanelOut() {
  if (panelEntranceRaf) {
    cancelAnimationFrame(panelEntranceRaf);
    panelEntranceRaf = null;
  }
  optionsPanel.classList.remove('collapse-end');
  optionsPanel.classList.add('collapse-start');
  panelExitTimer = setTimeout(() => {
    panelExitTimer = null;
    optionsPanel.style.display = 'none';
    optionsPanel.classList.remove('collapse-start');
  }, 300);
}

function showOptionsPanel(visible) {
  if (panelInitBlock) {
    return;
  }
  if (visible === undefined || visible === null) visible = true;

  if (visible && !optionsPanelVisible) {
    if (!optionsPanel) {
      panelInitBlock = true;
      setTimeout(() => {
        panelInitBlock = false;
      }, 500);
      optionsPanel = createOptionsPanel();
      document.body.appendChild(optionsPanel);

      applyPanelCareMode(configRead('panelCareMode'));
    }

    optionsPanel.style.display = 'block';
    animatePanelIn();
    if (optionsPanel.buildDeferredPages) optionsPanel.buildDeferredPages();
    if (optionsPanel.recalcDensity) optionsPanel.recalcDensity();
    syncSponsorBlockPanel(true);

    const activeTabBtn = optionsPanel.querySelector('.ytx-tab-btn.active');
    if (activeTabBtn) {
      activeTabBtn.focus();
      lastSafeFocus = activeTabBtn;
    } else {
      optionsPanel.focus();
      lastSafeFocus = optionsPanel;
    }
    optionsPanelVisible = true;
  } else if (!visible && optionsPanelVisible && optionsPanel) {
    animatePanelOut();
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
    if (!optionsPanelVisible || !optionsPanel) return;
    const target = e.target;
    const isSafeFocus = optionsPanel && optionsPanel.contains(target);
    if (isSafeFocus) lastSafeFocus = target;
    else {
      e.stopPropagation();
      e.preventDefault();
      if (lastSafeFocus && lastSafeFocus.isConnected) lastSafeFocus.focus();
      else {
        const firstVisibleInput = optionsPanel.querySelector(
          '.ytx-tab-btn.active, .ytx-settings-page[style*="block"] input:not([disabled])'
        );
        if (firstVisibleInput) firstVisibleInput.focus();
        else optionsPanel.focus();
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
function panelFocusables() {
  if (!optionsPanel) return [];
  return Array.from(
    optionsPanel.querySelectorAll(PANEL_FOCUSABLE_SELECTOR)
  ).filter((el) => el.tabIndex >= 0 && el.offsetParent !== null);
}

/** Nearest focusable from `list` in `direction`, measured by geometry; the score is the travel distance plus 2x the perpendicular offset, so moves stay in their column. */
function findSpatialNeighbor(current, list, direction) {
  const cur = current.getBoundingClientRect();
  const curX = cur.left + cur.width / 2;
  const curY = cur.top + cur.height / 2;

  let best = null;
  let bestScore = Infinity;

  for (const el of list) {
    if (el === current) continue;

    const rect = el.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - curX;
    const dy = rect.top + rect.height / 2 - curY;

    let primary;
    let perpendicular;
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

const NAV_DIRECTIONS = {
  [REMOTE_KEYS.UP.code]: 'ArrowUp',
  [REMOTE_KEYS.DOWN.code]: 'ArrowDown',
  [REMOTE_KEYS.LEFT.code]: 'ArrowLeft',
  [REMOTE_KEYS.RIGHT.code]: 'ArrowRight'
};

const isHorizontal = (direction) =>
  direction === 'ArrowLeft' || direction === 'ArrowRight';

const consume = (evt) => {
  evt.preventDefault();
  evt.stopImmediatePropagation();
};

function handlePanelNavKey(evt) {
  if (!optionsPanelVisible || !optionsPanel) return;
  // Synthetic events (sendKey) are not remote presses; real input only, same contract as keyboard-search.js.
  if (evt.isTrusted === false || evt[SYNTHETIC_KEY_FLAG]) return;

  // Remote Back closes the panel from the capture phase, so it works even when
  // focus has escaped the panel, and it is consumed so YouTube's own back
  // handling cannot navigate the page out from under an open panel. webOS
  // reports the key as keyCode 461; `key` is not stable across engines.
  if (evt.keyCode === REMOTE_KEYS.BACK.code) {
    consume(evt);
    showOptionsPanel(false);
    return;
  }

  const focused = document.activeElement;
  const inPanel = focused && optionsPanel.contains(focused);

  const direction = NAV_DIRECTIONS[evt.keyCode];
  if (direction) {
    // On a value row, Left/Right step the value itself and never move focus.
    if (
      inPanel &&
      isHorizontal(direction) &&
      focused.classList.contains('ytx-cycle-row')
    ) {
      const arrows = focused.querySelectorAll('.arrow-btn');
      const target =
        direction === 'ArrowLeft' ? arrows[0] : arrows[arrows.length - 1];
      if (target) {
        consume(evt);
        target.click();
      }
      return;
    }

    const list = panelFocusables();
    if (list.length === 0) return;

    if (!inPanel || focused === optionsPanel) {
      consume(evt);
      list[0].focus();
      return;
    }

    const next = findSpatialNeighbor(focused, list, direction);
    consume(evt);
    if (next) next.focus();
    return;
  }

  // Checkboxes do not toggle on Enter natively, so the click is issued here and the default suppressed to avoid a second activation.
  if (evt.keyCode === REMOTE_KEYS.ENTER.code && inPanel) {
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
configBadge.setAttribute('tabindex', -1);
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
let pointerBadgeTimer = null;
let lastPointerX = -1;
let lastPointerY = -1;

const hidePointerBadge = () => {
  if (pointerBadgeTimer) {
    clearTimeout(pointerBadgeTimer);
    pointerBadgeTimer = null;
  }
  configBadge.classList.remove('ytx-badge-visible');
};

const showPointerBadge = () => {
  if (configRead('pointerSettingsButton')) {
    return;
  }
  configBadge.classList.add('ytx-badge-visible');
  if (pointerBadgeTimer) clearTimeout(pointerBadgeTimer);
  pointerBadgeTimer = setTimeout(hidePointerBadge, POINTER_BADGE_HIDE_MS);
};

const syncBadgeVisibility = () => {
  const fixed = !!configRead('pointerSettingsButton');
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
  REMOTE_KEYS.LEFT.code,
  REMOTE_KEYS.UP.code,
  REMOTE_KEYS.RIGHT.code,
  REMOTE_KEYS.DOWN.code
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

// Watch-band translucency: walk up from the playback scrim and make any
// opaque ancestor (YouTube's solid metadata surface or a care-theme plate)
// translucent. Re-run on nav; the class is stripped off the watch page.
const WATCH_BAND_CANDIDATES = '.p0DeOc, .Jx9xPc, .k82tDb';
const WATCH_BAND_CLASS = 'ytx-watch-band-translucent';
// getComputedStyle reports a solid colour as rgb(...) with no alpha channel.
const isOpaqueColor = (color) => {
  if (!color.startsWith('rgb')) return false;
  const alpha = color.split(',')[3];
  return alpha === undefined || parseFloat(alpha) >= 0.9;
};
let watchBandFrame = 0;
function applyWatchBandTranslucency() {
  const scrim =
    document.querySelector("[idomkey='shadow']") ||
    document.querySelector('.ytLrWatchDefaultShadow') ||
    document.querySelector('.ytLrWatchDefault2025Shadow');
  const active = scrim?.isConnected && isWatchPage();
  if (!active) {
    document.querySelectorAll(`.${WATCH_BAND_CLASS}`).forEach((el) => {
      el.classList.remove(WATCH_BAND_CLASS);
    });
    return;
  }
  let el = scrim.parentElement;
  for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
    if (el.classList.contains(WATCH_BAND_CLASS)) continue;
    if (
      el.matches(WATCH_BAND_CANDIDATES) ||
      isOpaqueColor(getComputedStyle(el).backgroundColor)
    ) {
      el.classList.add(WATCH_BAND_CLASS);
    }
  }
}
// Transition/animation events fire in bursts; coalesce them to one pass per frame.
function scheduleWatchBandTranslucency() {
  if (watchBandFrame) return;
  watchBandFrame = requestAnimationFrame(() => {
    watchBandFrame = 0;
    applyWatchBandTranslucency();
  });
}
window.addEventListener('ytx-page-update', applyWatchBandTranslucency);
['transitionend', 'animationend'].forEach((evt) => {
  document.addEventListener(evt, scheduleWatchBandTranslucency, {
    passive: true
  });
});
applyWatchBandTranslucency();

function initGlobalStyles() {
  // Toggles live on <html> because YouTube rewrites body.className on tab
  // navigation; not gated on .app-quality-root, which applyUIFixes() strips.
  const style = createElement('style');
  style.textContent = `
    /* Disable Animations. Scoped to YouTube's own app root, so the settings
       panel and notifications (all on <body>) keep theirs. Near-zero
       durations rather than "none": a transitionend or animationend that
       YouTube waits for still fires, just at once. */
    html.ytx-no-animations ytlr-app,
    html.ytx-no-animations ytlr-app *,
    html.ytx-no-animations ytlr-app *:before,
    html.ytx-no-animations ytlr-app *:after {
      transition-duration: 0.01ms !important;
      transition-delay: 0s !important;
      animation-duration: 0.01ms !important;
      animation-delay: 0s !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
    }

    html.ytx-hide-logo ytlr-redux-connect-ytlr-logo-entity,
    html.ytx-hide-logo ytlr-logo-entity { visibility: hidden !important; }

    html.oled-theme-active { --ytx-dark-rgb: 0 0 0; }
    html.qned-theme-active { --ytx-dark-rgb: 20 20 20; }

    html.oled-theme-active #container,
    html.oled-theme-active .ytLrGuideResponseMask,
    html.oled-theme-active .geClSe,
    html.oled-theme-active .hsdF6b,
    html.oled-theme-active .ytLrAnimatedOverlayContainer,
    html.oled-theme-active .ZghAqf,
    html.oled-theme-active .RAE3Re .AmQJbe,
    html.oled-theme-active .tVp1L,
    html.oled-theme-active .DnwJH,
    html.oled-theme-active .qRdzpd.stQChb .TYE3Ed,
    html.oled-theme-active .k82tDb { background-color: #000 !important; }
    html.oled-theme-active .ytLrGuideResponseGradient { display: none; }
    html.oled-theme-active .iha0pc { color: #000 !important; }
    html.oled-theme-active .Jx9xPc { background-color: #000 !important; }
    html.oled-theme-active .p0DeOc { background-color: #000 !important; background-image: none !important; }
    html.oled-theme-active ytlr-player-focus-ring { border: 0.375rem solid rgb(200, 200, 200) !important; }
    html.oled-theme-active ytlr-surface-page { background-image: none !important; background-color: #000 !important; }

    html.qned-theme-active #container,
    html.qned-theme-active .ytLrGuideResponseMask,
    html.qned-theme-active .geClSe,
    html.qned-theme-active .hsdF6b,
    html.qned-theme-active .ytLrAnimatedOverlayContainer,
    html.qned-theme-active .ZghAqf,
    html.qned-theme-active .RAE3Re .AmQJbe,
    html.qned-theme-active .tVp1L,
    html.qned-theme-active .DnwJH,
    html.qned-theme-active .qRdzpd.stQChb .TYE3Ed,
    html.qned-theme-active .k82tDb { background-color: #141414 !important; }
    html.qned-theme-active .Jx9xPc { background-color: #141414 !important; }
    html.qned-theme-active .p0DeOc { background-color: #141414 !important; }
    html.qned-theme-active ytlr-player-focus-ring { border: 0.375rem solid rgb(160, 160, 160) !important; }
    html.qned-theme-active ytlr-surface-page { background-color: #141414 !important; }

    html.oled-theme-active .ytx-watch-band-translucent { background-color: rgba(0, 0, 0, 0.6) !important; }
    html.qned-theme-active .ytx-watch-band-translucent { background-color: rgba(20, 20, 20, 0.6) !important; }

    html.ytx-fix-titles .SK1srf .WVWtef,
    html.ytx-fix-titles .SK1srf .niS3yd {
        padding-bottom: 0.37vh !important;
        padding-top: 0.37vh !important;
    }
  `;
  document.head.appendChild(style);

  const syncClass = (cls, key) =>
    document.documentElement.classList.toggle(cls, !!configRead(key));
  const CLASS_KEYS = {
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

function applyPanelCareMode(mode) {
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

initGlobalStyles();

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
  optionsPanel?.recalcDensity?.();
});
refreshUIScale();

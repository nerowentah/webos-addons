/*global __YTX_VERSION__, __YTX_GITSHA__, __YTX_OWNER__*/
import {
  configAddChangeListener,
  configGetDesc,
  configRead,
  configWrite,
  panelCareModes,
  videoCodecModes
} from './config.js';
import './ui.css';
import {
  addTVSpecsChangeListener,
  refreshUIScale,
  resolvePanelCareMode
} from './tv-specs';
import {
  showNotification as notificationsShowNotification,
  setNotificationPanelCare
} from './notifications.js';
import { isWatchPage } from './utils.js';

export const showNotification = notificationsShowNotification;

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
    else el[key] = val;
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
    { class: 'label-content', style: { fontSize: '2.1vh' } },
    elmInput,
    `\u00A0${configGetDesc(key)}`
  );
  const elmLabel = createElement('label', {}, labelContent);

  configAddChangeListener(key, (evt) => {
    elmInput.checked = evt.detail.newValue;
  });

  return elmLabel;
}

// `variant` is an extra class on the section, used to opt a section into the
// two-column layout. Sizing and spacing moved to ui.css so the whole panel can
// be retuned in one place instead of through inline styles on every section.
function createSection(title, elements, variant) {
  const legend = createElement('div', { text: title, class: 'section-title' });
  return createElement(
    'div',
    { class: 'ytx-settings-section' + (variant ? ` ${variant}` : '') },
    legend,
    ...elements
  );
}

function createGenericControlRow(
  labelText,
  displayValueGetter,
  onLeft,
  onRight,
  onClick,
  extraElements = null
) {
  const valueText = createElement('span', { class: 'current-value' });
  const updateDisplay = () => {
    valueText.textContent = displayValueGetter();
  };

  const container = createElement(
    'div',
    {
      class: 'shortcut-control-row',
      tabIndex: 0,
      events: {
        click: () => onClick()
      }
    },
    createElement('span', {
      text: labelText,
      class: 'shortcut-label',
      style: { fontSize: '2.1vh' }
    }),
    createElement(
      'div',
      { class: 'shortcut-value-container' },
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

  if (extraElements) {
    container
      .querySelector('.shortcut-value-container')
      .appendChild(extraElements);
  }

  return { container, updateDisplay };
}

function createCycleControl(
  configKey,
  labelText,
  modesArray,
  displayMap = null,
  extraElements = null
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
    () => cycle('next'),
    extraElements
  );

  configAddChangeListener(configKey, updateDisplay);
  updateDisplay();
  return container;
}

/**
 * A cycle control that lines up with the checkbox rows around it.
 *
 * A .shortcut-control-row has no checkbox, so its label starts flush against
 * the row edge while every neighbouring label starts one checkbox-width in. The
 * hidden input below reserves exactly that width, which is cheaper and steadier
 * across themes than hard-coding a padding value that has to track the checkbox
 * CSS by hand.
 */
function createAlignedCycleControl(configKey, displayMap) {
  const control = createCycleControl(
    configKey,
    configGetDesc(configKey),
    Object.keys(displayMap),
    displayMap
  );

  const label = control.querySelector('.shortcut-label');
  if (label) {
    // An unstyled checkbox spacer, not a padded one: it inherits the 1.85vh
    // width and 1.1vh right margin from the base checkbox rule, which is
    // exactly the space a real checkbox occupies. It previously carried
    // `padding-left: 2.2vh`, which widened the spacer and pushed these labels
    // ~2.2vh right of the checkbox rows. Nothing here should grow the box -
    // the rule's own box-sizing: border-box keeps 1.85vh meaning the same
    // thing whether or not the host page also sets one.
    const spacer = createElement('input', { type: 'checkbox' });
    spacer.tabIndex = -1;
    spacer.style.visibility = 'hidden';
    spacer.setAttribute('aria-hidden', 'true');

    label.textContent = '';
    label.appendChild(spacer);
    label.appendChild(
      document.createTextNode('\u00A0' + configGetDesc(configKey))
    );
  }

  return control;
}

const createVideoCodecControl = () =>
  createAlignedCycleControl('forceVideoCodec', videoCodecModes);

function createOpacityControl(key) {
  const step = 5;
  const min = 0;
  const max = 100;

  const displayValueGetter = () => `${configRead(key)}%`;

  const changeValue = (delta) => {
    let val = configRead(key);
    val = Math.min(max, Math.max(min, val + delta));
    configWrite(key, val);
    updateDisplay();
  };

  const { container, updateDisplay } = createGenericControlRow(
    configGetDesc(key),
    displayValueGetter,
    () => changeValue(-step),
    () => changeValue(step),
    () => changeValue(step)
  );

  configAddChangeListener(key, updateDisplay);
  updateDisplay();
  return container;
}

let optionsPanel = null;
let optionsPanelVisible = false;
let panelInitBlock = false;
let lastSafeFocus = null;

// Popup toggle is wired up by Sponsorblock-UI.js via setSponsorBlockPopupSync.
// Until then the popup never exists, so this is a no-op.
let syncSponsorBlockPopup = () => {};
export function setSponsorBlockPopupSync(fn) {
  syncSponsorBlockPopup = fn;
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
        if (e.key === 'Escape' || e.key === 'Back' || e.code === 'Backspace') {
          showOptionsPanel(false);
        }
      }
    }
  });

  let activePage = 0;
  elmContainer.activePage = 0;
  let pageMain, pageSponsor, pageUITweaks;

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
  const tabs = ['Main', 'SponsorBlock', 'UI Tweaks'];
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
    const pagesArray = [pageMain, pageSponsor, pageUITweaks];
    const focusSelectors = [
      'input',
      '.shortcut-control-row, input',
      '.shortcut-control-row, input'
    ];
    const hasPopups = [false, true, false];

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

    syncSponsorBlockPopup(hasPopups[activePage] && isWatchPage());
    recalcDensity();
  };

  const elmHeading = createElement(
    'h1',
    {},
    createElement('span', { text: 'YouTube Extended for webOS' })
  );
  elmContainer.appendChild(elmHeading);

  const elmClose = createElement('button', {
    class: 'ytx-close-btn',
    text: '✕',
    tabIndex: 0,
    'aria-label': 'Close settings',
    events: {
      click: () => showOptionsPanel(false)
    }
  });
  elmContainer.appendChild(elmClose);
  elmContainer.appendChild(tabMenu);

  // --- Page 1: Main ---
  pageMain = createElement('div', {
    class: 'ytx-settings-page',
    id: 'ytx-page-main'
  });

  pageMain.appendChild(
    createSection(
      'Cosmetic Filtering',
      [
        createConfigCheckbox('enableAdBlock'),
        createConfigCheckbox('removeShorts'),
        createConfigCheckbox('removeMembersOnly'),
        createConfigCheckbox('hideLogo'),
        createConfigCheckbox('upgradeThumbnails')
      ],
      'ytx-section-2col'
    )
  );
  pageMain.appendChild(
    createSection('Video Player', [
      createConfigCheckbox('forceHighResVideo'),
      createVideoCodecControl(),
      createConfigCheckbox('removeEndscreen'),
      createConfigCheckbox('keepPlaying')
    ])
  );
  elmContainer.appendChild(pageMain);

  // --- Pages 1-2: built off the critical path. Only the Main page is built
  // now; the rest are built one per animation frame once the panel is on
  // screen, and setActivePage() forces a build synchronously if the user gets
  // to a tab before the idle chain does.
  const pageBuilders = [
    null,
    function buildSponsorPage() {
      pageSponsor = createElement('div', {
        class: 'ytx-settings-page',
        id: 'ytx-page-sponsor',
        style: { display: 'none' }
      });
      pageSponsor.appendChild(createConfigCheckbox('enableSponsorBlock'));

      const elmBlock = createElement(
        'blockquote',
        {},
        ...SPONSOR_CATEGORIES.map((k) => createConfigCheckbox(k)),
        createConfigCheckbox('skipSegmentsOnce')
      );
      pageSponsor.appendChild(elmBlock);
      pageSponsor.appendChild(
        createElement(
          'div',
          {},
          createElement('small', {
            text: 'Sponsor segments skipping - https://sponsor.ajay.app'
          })
        )
      );
      elmContainer.appendChild(pageSponsor);
    },
    function buildUITweaksPage() {
      pageUITweaks = createElement('div', {
        class: 'ytx-settings-page',
        id: 'ytx-page-ui-tweaks',
        style: { display: 'none' }
      });

      pageUITweaks.appendChild(
        createSection('Player UI Tweaks', [
          createOpacityControl('videoShelfOpacity'),
          createElement('div', {
            text: 'Adjusts opacity of the background underneath videos (Requires a Panel Care Mode)',
            style: { color: '#aaa', fontSize: '18px', padding: '4px 12px 12px' }
          }),
          createConfigCheckbox('fixMultilineTitles'),
          createConfigCheckbox('showYtxButton'),
          createConfigCheckbox('autoAccountSelect'),
          createAlignedCycleControl('panelCareMode', panelCareModes)
        ])
      );

      elmContainer.appendChild(pageUITweaks);
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

  // The panel scales in vh, but whether a page fits 95vh depends on how many
  // rows it has, which changes with the config surface. Measure the visible
  // page and trim density only when it actually overflows, so the panel stays
  // correct at any screen resolution and if rows are ever added.
  const recalcDensity = () => {
    if (elmContainer.style.display === 'none') return;
    const pages = [pageMain, pageSponsor, pageUITweaks];
    const page = pages[activePage];
    if (!page || page.style.display === 'none') return;
    elmContainer.classList.toggle(
      'ytx-panel-compact',
      page.scrollHeight > page.clientHeight + 1
    );
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

    // Strip eagerly in case the class was already present before this script
    // ran; the observer below only reacts to later changes.
    bodyClasses.remove('app-quality-root');

    const observer = new MutationObserver(function bodyClassCallback(
      _records,
      _observer
    ) {
      try {
        if (bodyClasses.contains('app-quality-root')) {
          bodyClasses.remove('app-quality-root');
        }
      } catch (e) {
        console.error('error in <body> class observer callback:', e);
      }
    });

    observer.observe(document.body, {
      subtree: false,
      childList: false,
      attributes: true,
      attributeFilter: ['class'],
      characterData: false
    });
  } catch (e) {
    console.error('error setting up <body> class observer:', e);
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

// One-time entrance: pose the panel in its hidden state, force a reflow so the
// pose is committed, then flip to the visible pose on the next frame. Without
// the intermediate commit the opacity/transform transition has no "from" value
// and the panel just pops in.
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

// One-time exit: swap to the hidden pose (the transition animates it), then
// paint display:none once it has finished so the invisible panel never traps
// focus or clicks. transitionend is unreliable when the tab is backgrounded,
// so a fixed fallback does the same job.
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
    console.log(
      '[UI] Options panel toggle blocked due to initialization lock.'
    );
    return;
  }
  if (visible === undefined || visible === null) visible = true;

  if (visible && !optionsPanelVisible) {
    if (!optionsPanel) {
      console.log('[UI] Initializing Options Panel (Lazy Load)...');
      panelInitBlock = true;
      setTimeout(() => {
        panelInitBlock = false;
      }, 500);
      optionsPanel = createOptionsPanel();
      document.body.appendChild(optionsPanel);

      applyPanelCareMode(configRead('panelCareMode'));
    }

    console.debug('Showing and focusing options panel!');
    optionsPanel.style.display = 'block';
    animatePanelIn();
    if (optionsPanel.buildDeferredPages) optionsPanel.buildDeferredPages();
    if (optionsPanel.recalcDensity) optionsPanel.recalcDensity();
    syncSponsorBlockPopup(optionsPanel.activePage === 1 && isWatchPage());

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
    console.debug('Hiding options panel!');
    animatePanelOut();
    syncSponsorBlockPopup(false);
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
    const isSafeFocus =
      (optionsPanel && optionsPanel.contains(target)) ||
      target.closest('.sb-segments-popup');
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

/**
 * On-screen entry point for the options panel. Pointer-only: tabindex = -1
 * keeps it out of the app's focus order so it can never steal a tile's
 * focus (breaking its hover preview). Opens and closes on click.
 */
const configBadge = document.createElement('button');
configBadge.type = 'button';
configBadge.className = 'ytx-ui-badge';
configBadge.textContent = 'YT-X';
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

const syncBadgeVisibility = () =>
  configBadge.classList.toggle(
    'ytx-badge-disabled',
    !configRead('showYtxButton')
  );
syncBadgeVisibility();
configAddChangeListener('showYtxButton', syncBadgeVisibility);

function initGlobalStyles() {
  // Static stylesheet - written once, never rebuilt. Toggling a class on the
  // <html> element activates/deactivates each section. We use documentElement
  // rather than body because YouTube's leanback app rewrites body.className
  // on tab navigation (Home -> Gaming, etc.) and would wipe our toggles.
  //
  // Note: these rules are intentionally not scoped under .app-quality-root
  // (the fork scopes them there). applyUIFixes() strips that class from
  // <body>, so a .app-quality-root gate would silently disable every rule.
  const style = createElement('style');
  style.textContent = `
    :root { --ytx-panel-opacity: 1; }

    html.ytx-hide-logo ytlr-redux-connect-ytlr-logo-entity,
    html.ytx-hide-logo ytlr-logo-entity { visibility: hidden !important; }

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
    html.oled-theme-active .Jx9xPc { background-color: rgba(0, 0, 0, var(--ytx-panel-opacity)) !important; }
    html.oled-theme-active .p0DeOc { background-color: #000 !important; background-image: none !important; }
    html.oled-theme-active ytlr-player-focus-ring { border: 0.375rem solid rgb(200, 200, 200) !important; }
    html.oled-theme-active ytlr-surface-page { background-image: none !important; background-color: #000 !important; }
    html.oled-theme-active.oled-transparent-shelf .UGcxnc .dxLAmd,
    html.oled-theme-active.oled-transparent-shelf .UGcxnc .Dc2Zic .JkDfAc { background-color: rgba(0, 0, 0, 0) !important; }

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
    html.qned-theme-active .Jx9xPc { background-color: rgba(20, 20, 20, var(--ytx-panel-opacity)) !important; }
    html.qned-theme-active .p0DeOc { background-color: #141414 !important; }
    html.qned-theme-active ytlr-player-focus-ring { border: 0.375rem solid rgb(160, 160, 160) !important; }
    html.qned-theme-active ytlr-surface-page { background-color: #141414 !important; }
    html.qned-theme-active.qned-transparent-shelf .UGcxnc .dxLAmd,
    html.qned-theme-active.qned-transparent-shelf .UGcxnc .Dc2Zic .JkDfAc { background-color: rgba(20, 20, 20, 0) !important; }

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
    'ytx-fix-titles': 'fixMultilineTitles'
  };
  for (const [cls, key] of Object.entries(CLASS_KEYS)) {
    syncClass(cls, key);
    configAddChangeListener(key, () => syncClass(cls, key));
  }
}

function syncShelfOpacity() {
  const opacityVal = configRead('videoShelfOpacity');
  document.documentElement.style.setProperty(
    '--ytx-panel-opacity',
    String(opacityVal / 100)
  );
  const isOled = resolvedPanelCareMode === 'oled';
  const isQned = resolvedPanelCareMode === 'qned';
  document.documentElement.classList.toggle(
    'oled-transparent-shelf',
    isOled && opacityVal > 50
  );
  document.documentElement.classList.toggle(
    'qned-transparent-shelf',
    isQned && opacityVal > 50
  );
}

/**
 * The care mode to actually apply, with 'auto' already resolved against the
 * detected panel. Everything downstream (the panel, the clock, notifications,
 * the shelf opacity) reads this rather than configRead('panelCareMode'), so the
 * three of them cannot disagree about which mode is active.
 */
let resolvedPanelCareMode = resolvePanelCareMode(configRead('panelCareMode'));

function applyPanelCareMode(mode) {
  resolvedPanelCareMode = resolvePanelCareMode(mode);
  const isOled = resolvedPanelCareMode === 'oled';
  const isQned = resolvedPanelCareMode === 'qned';
  const active = isOled || isQned;

  if (optionsPanel) {
    optionsPanel.classList.toggle('oled-care', isOled);
    optionsPanel.classList.toggle('qned-care', isQned);
  }
  setNotificationPanelCare(resolvedPanelCareMode);

  document.documentElement.classList.toggle('oled-theme-active', isOled);
  document.documentElement.classList.toggle('qned-theme-active', isQned);
  if (active) syncShelfOpacity();
  else {
    document.documentElement.classList.remove('oled-transparent-shelf');
    document.documentElement.classList.remove('qned-transparent-shelf');
  }
}

// --- Start-up ---
initGlobalStyles();

applyPanelCareMode(configRead('panelCareMode'));
configAddChangeListener('panelCareMode', (evt) =>
  applyPanelCareMode(evt.detail.newValue)
);

// 'auto' resolves against the model in the UA, which tv-specs computes at
// startup - so the resolved mode can change once tv-specs finishes, e.g. after
// a window resize triggers its update().
addTVSpecsChangeListener(() => applyPanelCareMode(configRead('panelCareMode')));

configAddChangeListener('videoShelfOpacity', () => {
  if (resolvedPanelCareMode !== 'off') syncShelfOpacity();
});

applyUIFixes();

// --ytx-ui-scale is written by tv-specs, which owns the density knob and
// re-measures it whenever the specs change. Measuring it needs the site's
// stylesheets, which are only present here rather than in the app shell, so the
// call is repeated on entry and the panel's density-dependent relayout rides
// along on the same notification.
addTVSpecsChangeListener(() => {
  refreshUIScale();
  optionsPanel?.recalcDensity?.();
});
refreshUIScale();

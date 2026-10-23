// Builds the options panel element: tab menu, lazily-built pages, density
// relayout. Behaviour on close is injected, so this module never imports the
// controller that creates it.

import { panelCareModes } from '../config/config';
import { PANEL } from '../config/ui-text';
import { REMOTE_KEYS } from '../core/utils';
import { SEGMENT_CATEGORIES } from '../features/sponsorblock/categories';
import {
  createAlignedCycleControl,
  createConfigCheckbox,
  createSection,
  createVideoCodecControl
} from './controls';
import { createElement } from './dom';
import type { OptionsPanel } from './panel-state';

export function createOptionsPanel(onClose: () => void): OptionsPanel {
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
            onClose();
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
      click: () => onClose()
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
            ...SEGMENT_CATEGORIES.map((c) => createConfigCheckbox(c.configKey)),
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

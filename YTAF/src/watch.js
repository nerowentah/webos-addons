import {
  configAddChangeListener,
  configRead,
  configRemoveChangeListener
} from './config.js';
import { debounce } from './utils.js';
import { addTVSpecsChangeListener, resolvePanelCareMode } from './tv-specs';

class Watch {
  constructor() {
    this._watch = null;
    this._timer = null;
    this._globalListeners = [];

    this._PLAYER_SELECTOR = 'ytlr-watch-default';
    this._DEBOUNCE_DELAY = 50;
    this._cachedPlayer = null;
    this._cachedOverlay = null;

    this.onPanelCareChange = this.onPanelCareChange.bind(this);
    this.updateVisibility = this.updateVisibility.bind(this);

    // Bind happens before debouncing so the wrapper can be used both as a
    // method and as a DOM event handler without losing the instance context.
    this.debouncedUpdate = debounce(
      this.updateVisibility,
      this._DEBOUNCE_DELAY
    );

    this.createElement();
    this.startClock();
    this.setupGlobalListeners();

    this.applyPanelCareMode(configRead('panelCareMode'));
    configAddChangeListener('panelCareMode', this.onPanelCareChange);

    // 'auto' resolves against the model parsed out of the UA, which tv-specs
    // computes at startup and republishes when it updates.
    addTVSpecsChangeListener(this.onPanelCareChange);

    configAddChangeListener('alwaysShowClock', this.debouncedUpdate);

    this.updateVisibility();
  }

  onPanelCareChange(evt) {
    this.applyPanelCareMode(
      evt?.detail?.newValue ?? configRead('panelCareMode')
    );
  }

  applyPanelCareMode(mode) {
    const care = resolvePanelCareMode(mode);
    if (this._watch) {
      this._watch.classList.toggle('oled-care', care === 'oled');
      this._watch.classList.toggle('qned-care', care === 'qned');
    }
  }

  createElement() {
    this._watch = document.createElement('div');
    // Starts hidden so the first updateVisibility() cross-fades the clock in
    // rather than snapping it on. setHidden() is what takes it back off.
    this._watch.className = 'webOs-watch clock-hidden';
    this._watch.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this._watch);
  }

  startClock() {
    const nextSeg = (60 - new Date().getSeconds()) * 1000;

    const formatter = new Intl.DateTimeFormat(navigator.language, {
      hour: 'numeric',
      minute: 'numeric'
    });

    const setTime = () => {
      if (this._watch) {
        // textContent is faster than innerText
        this._watch.textContent = formatter.format(new Date());

        this.updateVisibility();
      }
    };

    setTime();
    setTimeout(() => {
      setTime();
      this._timer = setInterval(setTime, 60000);
    }, nextSeg);
  }

  // A class rather than a display toggle, so the clock cross-fades in step with
  // the options panel and the notifications. The widget is aria-hidden and
  // pointer-events: none, so leaving it in the layer while faded costs nothing
  // and saves the transitionend bookkeeping the panel needs for focus trapping.
  setHidden(hidden) {
    if (this._watch.classList.contains('clock-hidden') !== hidden) {
      this._watch.classList.toggle('clock-hidden', hidden);
    }
  }

  updateVisibility() {
    if (!this._watch) return;

    if (configRead('alwaysShowClock')) {
      this.setHidden(false);
      return;
    }

    if (!this._cachedPlayer || !this._cachedPlayer.isConnected) {
      this._cachedPlayer = document.querySelector(this._PLAYER_SELECTOR);
    }

    if (!this._cachedPlayer) {
      this.setHidden(false);
      return;
    }

    if (!this._cachedOverlay || !this._cachedOverlay.isConnected) {
      this._cachedOverlay = document.querySelector('.AmQJbe');
    }

    const isHybridFocused =
      this._cachedPlayer.getAttribute('hybridnavfocusable') === 'true';
    const isPlayerElementActive =
      document.activeElement === this._cachedPlayer ||
      document.activeElement === document.body;
    const isOverlayActive = !!this._cachedOverlay;

    this.setHidden(isHybridFocused || isPlayerElementActive || isOverlayActive);
  }

  setupGlobalListeners() {
    this.boundStateChange = (e) => {
      const state = e.detail.state;
      if (state === 1 || state === 2 || state === -1) {
        this.debouncedUpdate();
      }
    };
    window.addEventListener('yt-player-state-change', this.boundStateChange);

    const addListener = (type, handler) => {
      document.addEventListener(type, handler, true);
      this._globalListeners.push({ type, fn: handler });
    };

    // focusin only: a focusout is followed by a focusin in every practical
    // case on this platform, and the callback is debounced, so the focusout
    // invocation would only be coalesced away. Halves the clock's share of
    // the focus-traffic load.
    addListener('focusin', this.debouncedUpdate);
  }

  destroy() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    configRemoveChangeListener('panelCareMode', this.onPanelCareChange);
    configRemoveChangeListener('alwaysShowClock', this.debouncedUpdate);

    if (this.boundStateChange) {
      window.removeEventListener(
        'yt-player-state-change',
        this.boundStateChange
      );
    }

    this._globalListeners.forEach((l) => {
      document.removeEventListener(l.type, l.fn, true);
    });
    this._globalListeners = [];

    if (this._watch) {
      this._watch.remove();
      this._watch = null;
    }
  }
}

let watchInstance = null;

function toggleWatch(show) {
  if (show) {
    if (!watchInstance) {
      watchInstance = new Watch();
    }
  } else if (watchInstance) {
    watchInstance.destroy();
    watchInstance = null;
  }
}

toggleWatch(configRead('showWatch'));

configAddChangeListener('showWatch', (evt) => {
  toggleWatch(evt.detail.newValue);
});
